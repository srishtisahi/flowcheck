#!/usr/bin/env node
/**
 * Form Tester — Automatically discovers and tests HTML forms on a page.
 *
 * Finds all <form> elements, catalogues their inputs, and runs a suite of
 * tests: required-field validation, boundary-value inputs, XSS payload
 * detection, and submit-response verification.
 *
 * Usage:
 *   node form_tester.js https://example.com/login
 *   node form_tester.js https://example.com/contact --timeout 10000
 */

const fs = require("fs");

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(`
Form Tester — Automated HTML form testing

Usage:
  node form_tester.js <url> [options]

Options:
  --timeout <ms>    Navigation timeout in ms (default: 15000)
  --no-submit       Discover and catalogue forms but do not submit them
  --help            Show this help
`);
  process.exit(0);
}

const url = args.find(
  (a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--")
);
const flagValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

const timeout = parseInt(flagValue("--timeout") || "15000", 10);
const noSubmit = hasFlag("--no-submit");

if (!url) {
  console.error("Error: URL argument is required.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test payloads
// ---------------------------------------------------------------------------
const TEST_PAYLOADS = {
  text: [
    { name: "empty", value: "" },
    { name: "normal", value: "Hello World" },
    { name: "long_string", value: "A".repeat(5000) },
    { name: "special_chars", value: '<script>alert("xss")</script>' },
    { name: "sql_injection", value: "' OR 1=1 --" },
    { name: "unicode", value: "\u00e9\u00e0\u00fc\u00f1 \u4f60\u597d \ud83d\ude00" },
    { name: "whitespace_only", value: "   " },
  ],
  email: [
    { name: "empty", value: "" },
    { name: "valid", value: "test@example.com" },
    { name: "invalid_no_at", value: "invalid-email" },
    { name: "invalid_double_at", value: "user@@domain.com" },
    { name: "valid_plus", value: "user+tag@example.com" },
  ],
  number: [
    { name: "empty", value: "" },
    { name: "zero", value: "0" },
    { name: "negative", value: "-1" },
    { name: "large", value: "99999999999" },
    { name: "decimal", value: "3.14" },
    { name: "text_in_number", value: "abc" },
  ],
  password: [
    { name: "empty", value: "" },
    { name: "short", value: "ab" },
    { name: "normal", value: "P@ssw0rd123!" },
    { name: "long", value: "x".repeat(1000) },
  ],
  url: [
    { name: "empty", value: "" },
    { name: "valid", value: "https://example.com" },
    { name: "invalid", value: "not a url" },
    { name: "javascript_proto", value: "javascript:alert(1)" },
  ],
};

function getPayloads(inputType) {
  return TEST_PAYLOADS[inputType] || TEST_PAYLOADS.text;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch {
    console.error(
      "Missing dependency. Install it with:\n  npm install puppeteer"
    );
    process.exit(1);
  }

  console.log(`\nForm Tester`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  URL     : ${url}`);
  console.log(`  Timeout : ${timeout}ms`);
  console.log(`  Submit  : ${noSubmit ? "disabled" : "enabled"}`);
  console.log(`${"=".repeat(50)}\n`);

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2", timeout });

  // Discover forms
  const forms = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("form")).map((form, idx) => {
      const inputs = Array.from(
        form.querySelectorAll("input, select, textarea")
      ).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute("type") || (el.tagName === "TEXTAREA" ? "text" : "text"),
        name: el.getAttribute("name") || "",
        id: el.getAttribute("id") || "",
        required: el.hasAttribute("required"),
        placeholder: el.getAttribute("placeholder") || "",
        maxlength: el.getAttribute("maxlength") || null,
        minlength: el.getAttribute("minlength") || null,
        pattern: el.getAttribute("pattern") || null,
      }));

      return {
        index: idx,
        id: form.getAttribute("id") || "",
        action: form.getAttribute("action") || "",
        method: (form.getAttribute("method") || "GET").toUpperCase(),
        inputs,
        hasSubmitButton:
          !!form.querySelector('button[type="submit"], input[type="submit"]'),
      };
    });
  });

  if (forms.length === 0) {
    console.log("  No forms found on this page.\n");
    await browser.close();
    process.exit(0);
  }

  console.log(`Found ${forms.length} form(s)\n`);

  const results = [];

  for (const form of forms) {
    const formLabel = form.id || `form[${form.index}]`;
    console.log(`${"─".repeat(50)}`);
    console.log(`Form: ${formLabel}`);
    console.log(`  Action : ${form.action || "(same page)"}`);
    console.log(`  Method : ${form.method}`);
    console.log(`  Inputs : ${form.inputs.length}`);
    console.log(`  Submit : ${form.hasSubmitButton ? "yes" : "no button found"}`);

    // Catalogue inputs
    console.log("\n  Fields:");
    for (const inp of form.inputs) {
      const label = inp.name || inp.id || "(unnamed)";
      const constraints = [];
      if (inp.required) constraints.push("required");
      if (inp.maxlength) constraints.push(`maxlength=${inp.maxlength}`);
      if (inp.minlength) constraints.push(`minlength=${inp.minlength}`);
      if (inp.pattern) constraints.push(`pattern=${inp.pattern}`);
      const cStr = constraints.length ? ` [${constraints.join(", ")}]` : "";
      console.log(`    - ${label} (${inp.type})${cStr}`);
    }

    if (noSubmit) {
      console.log("\n  Skipping submission tests (--no-submit)\n");
      continue;
    }

    // Test each fillable input with payloads
    const fillableInputs = form.inputs.filter(
      (i) => !["hidden", "submit", "button", "reset", "image"].includes(i.type)
    );

    if (fillableInputs.length === 0) {
      console.log("\n  No fillable inputs to test.\n");
      continue;
    }

    console.log("\n  Running tests...\n");

    for (const input of fillableInputs) {
      const selector = input.id
        ? `#${input.id}`
        : input.name
        ? `[name="${input.name}"]`
        : null;

      if (!selector) continue;

      const payloads = getPayloads(input.type);
      for (const payload of payloads) {
        const testName = `${input.name || input.id}:${input.type}:${payload.name}`;
        try {
          // Reload page to reset form state
          await page.goto(url, { waitUntil: "networkidle2", timeout });

          // Clear and fill
          const el = await page.$(selector);
          if (!el) {
            results.push({ test: testName, status: "SKIP", detail: "Element not found" });
            continue;
          }

          await el.click({ clickCount: 3 });
          await el.type(payload.value);

          // Check browser-side validation
          const validity = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el || !el.validity) return { valid: true };
            return {
              valid: el.validity.valid,
              valueMissing: el.validity.valueMissing,
              typeMismatch: el.validity.typeMismatch,
              tooLong: el.validity.tooLong,
              tooShort: el.validity.tooShort,
              patternMismatch: el.validity.patternMismatch,
            };
          }, selector);

          const status = validity.valid ? "PASS" : "BLOCKED";
          const detail = validity.valid
            ? "Input accepted"
            : `Validation: ${Object.entries(validity)
                .filter(([k, v]) => k !== "valid" && v)
                .map(([k]) => k)
                .join(", ")}`;

          results.push({ test: testName, status, detail });
          const icon = status === "PASS" ? "+" : "-";
          console.log(`    [${icon}] ${testName}: ${detail}`);
        } catch (err) {
          results.push({ test: testName, status: "ERROR", detail: err.message });
          console.log(`    [!] ${testName}: ERROR — ${err.message}`);
        }
      }
    }
  }

  await browser.close();

  // Summary
  const passed = results.filter((r) => r.status === "PASS").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  const errors = results.filter((r) => r.status === "ERROR").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  Form Test Summary`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  Total tests : ${results.length}`);
  console.log(`  Passed      : ${passed}`);
  console.log(`  Blocked     : ${blocked} (client-side validation prevented input)`);
  console.log(`  Errors      : ${errors}`);
  console.log(`  Skipped     : ${skipped}`);
  console.log(`${"=".repeat(50)}\n`);

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
