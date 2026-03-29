#!/usr/bin/env node
/**
 * API Health Checker — Validates API endpoints against a spec file.
 *
 * Reads a JSON spec of endpoints and for each one verifies:
 *   - HTTP status code matches expectation
 *   - Response time is within threshold
 *   - Response body contains required fields
 *   - Content-Type header is correct
 *
 * Usage:
 *   node api_health_checker.js --spec endpoints.json
 *   node api_health_checker.js --spec endpoints.json --base-url https://staging.example.com
 *
 * Spec file format (endpoints.json):
 *   [
 *     {
 *       "name": "Get Users",
 *       "method": "GET",
 *       "path": "/api/users",
 *       "expectedStatus": 200,
 *       "maxResponseTime": 2000,
 *       "requiredFields": ["data", "total"],
 *       "headers": { "Authorization": "Bearer <token>" }
 *     }
 *   ]
 */

const fs = require("fs");
const http = require("http");
const https = require("https");
const { URL } = require("url");

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  console.log(`
API Health Checker

Usage:
  node api_health_checker.js --spec <file.json> [options]

Options:
  --spec <file>         Path to the endpoints spec JSON file (required)
  --base-url <url>      Base URL prepended to each path (default: http://localhost:3000)
  --timeout <ms>        Request timeout in ms (default: 10000)
  --verbose             Show response bodies on failure
  --generate <url>      Generate a starter spec by probing common endpoints
  --help                Show this help

Spec file format:
  An array of endpoint objects. Each object may have:
    name            - Human-readable test name
    method          - HTTP method (default: GET)
    path            - URL path (e.g. /api/users)
    body            - Request body (for POST/PUT/PATCH), as object
    headers         - Additional request headers, as object
    expectedStatus  - Expected HTTP status code (default: 200)
    maxResponseTime - Max acceptable response time in ms (default: 5000)
    requiredFields  - Array of top-level field names expected in JSON response
    contentType     - Expected Content-Type (default: application/json)
`);
  process.exit(0);
}

const flagValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

const specPath = flagValue("--spec");
const baseUrl = flagValue("--base-url") || "http://localhost:3000";
const requestTimeout = parseInt(flagValue("--timeout") || "10000", 10);
const verbose = hasFlag("--verbose");
const generateUrl = flagValue("--generate");

// ---------------------------------------------------------------------------
// Spec generator
// ---------------------------------------------------------------------------
function generateSpec(base) {
  const commonPaths = [
    { path: "/", name: "Root" },
    { path: "/health", name: "Health Check" },
    { path: "/api", name: "API Root" },
    { path: "/api/v1", name: "API v1 Root" },
    { path: "/api/users", name: "Users Endpoint" },
    { path: "/api/status", name: "Status Endpoint" },
    { path: "/api/health", name: "API Health" },
  ];

  const spec = commonPaths.map((ep) => ({
    name: ep.name,
    method: "GET",
    path: ep.path,
    expectedStatus: 200,
    maxResponseTime: 3000,
    requiredFields: [],
  }));

  const outPath = "endpoints.json";
  fs.writeFileSync(outPath, JSON.stringify(spec, null, 2));
  console.log(`Generated starter spec: ${outPath}`);
  console.log(`Edit it to match your API, then run:`);
  console.log(`  node api_health_checker.js --spec ${outPath} --base-url ${base}\n`);
  process.exit(0);
}

if (generateUrl) {
  generateSpec(generateUrl);
}

if (!specPath) {
  console.error("Error: --spec <file.json> is required.\n");
  console.error("Tip: generate a starter spec with:");
  console.error("  node api_health_checker.js --generate http://localhost:3000\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP request helper (no external dependencies)
// ---------------------------------------------------------------------------
function makeRequest(fullUrl, method, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(fullUrl);
    const lib = parsed.protocol === "https:" ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: {
        "User-Agent": "srishti-qa-api-checker/1.0",
        Accept: "application/json",
        ...headers,
      },
      timeout: timeoutMs,
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    const start = Date.now();

    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const elapsed = Date.now() - start;
        const rawBody = Buffer.concat(chunks).toString("utf-8");
        let jsonBody = null;
        try {
          jsonBody = JSON.parse(rawBody);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: rawBody,
          json: jsonBody,
          time: elapsed,
        });
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
async function testEndpoint(ep) {
  const fullUrl = baseUrl.replace(/\/$/, "") + ep.path;
  const method = (ep.method || "GET").toUpperCase();
  const expectedStatus = ep.expectedStatus || 200;
  const maxTime = ep.maxResponseTime || 5000;
  const requiredFields = ep.requiredFields || [];
  const expectedContentType = ep.contentType || "application/json";

  const failures = [];

  let res;
  try {
    res = await makeRequest(fullUrl, method, ep.headers || {}, ep.body, requestTimeout);
  } catch (err) {
    return {
      name: ep.name,
      url: `${method} ${fullUrl}`,
      passed: false,
      failures: [`Connection failed: ${err.message}`],
      time: null,
    };
  }

  // Status code
  if (res.status !== expectedStatus) {
    failures.push(
      `Status: expected ${expectedStatus}, got ${res.status}`
    );
  }

  // Response time
  if (res.time > maxTime) {
    failures.push(
      `Response time: ${res.time}ms exceeds max ${maxTime}ms`
    );
  }

  // Content-Type
  const ct = res.headers["content-type"] || "";
  if (!ct.includes(expectedContentType)) {
    failures.push(
      `Content-Type: expected "${expectedContentType}", got "${ct}"`
    );
  }

  // Required fields
  if (requiredFields.length > 0 && res.json) {
    for (const field of requiredFields) {
      if (!(field in res.json)) {
        failures.push(`Missing required field: "${field}"`);
      }
    }
  } else if (requiredFields.length > 0 && !res.json) {
    failures.push("Response is not valid JSON — cannot check required fields");
  }

  return {
    name: ep.name,
    url: `${method} ${fullUrl}`,
    passed: failures.length === 0,
    failures,
    time: res.time,
    responseBody: verbose ? res.body : null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let spec;
  try {
    const raw = fs.readFileSync(specPath, "utf-8");
    spec = JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading spec file: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(spec) || spec.length === 0) {
    console.error("Spec file must be a non-empty JSON array of endpoint objects.");
    process.exit(1);
  }

  console.log(`\nAPI Health Check`);
  console.log(`${"=".repeat(55)}`);
  console.log(`  Base URL   : ${baseUrl}`);
  console.log(`  Endpoints  : ${spec.length}`);
  console.log(`  Timeout    : ${requestTimeout}ms`);
  console.log(`${"=".repeat(55)}\n`);

  const results = [];

  for (const ep of spec) {
    const result = await testEndpoint(ep);
    results.push(result);

    const icon = result.passed ? "PASS" : "FAIL";
    const timeStr = result.time !== null ? `${result.time}ms` : "N/A";
    console.log(`  [${icon}] ${result.name} (${timeStr})`);
    console.log(`        ${result.url}`);

    if (!result.passed) {
      for (const f of result.failures) {
        console.log(`        ! ${f}`);
      }
      if (result.responseBody) {
        const preview = result.responseBody.substring(0, 200);
        console.log(`        Body: ${preview}${result.responseBody.length > 200 ? "..." : ""}`);
      }
    }
    console.log();
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const avgTime =
    results.filter((r) => r.time !== null).reduce((sum, r) => sum + r.time, 0) /
      (results.filter((r) => r.time !== null).length || 1);

  console.log(`${"=".repeat(55)}`);
  console.log(`  Summary`);
  console.log(`${"=".repeat(55)}`);
  console.log(`  Total    : ${results.length}`);
  console.log(`  Passed   : ${passed}`);
  console.log(`  Failed   : ${failed}`);
  console.log(`  Avg time : ${avgTime.toFixed(0)}ms`);
  console.log(`${"=".repeat(55)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
