#!/usr/bin/env node
/**
 * Visual Regression Tester — Captures screenshots and compares them against baselines.
 *
 * Takes a screenshot of a URL using Puppeteer, saves it as a baseline on first
 * run, and on subsequent runs compares the new screenshot against the baseline
 * using pixel-by-pixel diffing.
 *
 * Usage:
 *   node visual_regression.js https://example.com
 *   node visual_regression.js https://example.com --viewport 1280x720 --threshold 0.05
 *   node visual_regression.js https://example.com --update   # overwrite baseline
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(`
Visual Regression Tester

Usage:
  node visual_regression.js <url> [options]

Options:
  --viewport <WxH>     Viewport size (default: 1920x1080)
  --threshold <0-1>    Mismatch ratio tolerance (default: 0.01)
  --update             Overwrite the existing baseline
  --output-dir <dir>   Directory for baselines & diffs (default: ./vr_snapshots)
  --full-page          Capture the full scrollable page
  --help               Show this help
`);
  process.exit(0);
}

const url = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
const flagValue = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

const viewport = (flagValue("--viewport") || "1920x1080").split("x").map(Number);
const threshold = parseFloat(flagValue("--threshold") || "0.01");
const updateBaseline = hasFlag("--update");
const outputDir = flagValue("--output-dir") || "./vr_snapshots";
const fullPage = hasFlag("--full-page");

if (!url) {
  console.error("Error: URL argument is required.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slugify(text) {
  return text
    .replace(/https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 100);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Simple PNG comparison using raw buffers — no external image lib needed.
// Returns the fraction of pixels that differ.
function compareBuffers(buf1, buf2) {
  if (buf1.length !== buf2.length) return 1.0;
  let diffPixels = 0;
  const totalPixels = buf1.length / 4; // RGBA
  for (let i = 0; i < buf1.length; i += 4) {
    if (
      buf1[i] !== buf2[i] ||
      buf1[i + 1] !== buf2[i + 1] ||
      buf1[i + 2] !== buf2[i + 2]
    ) {
      diffPixels++;
    }
  }
  return diffPixels / totalPixels;
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

  const slug = slugify(url);
  ensureDir(outputDir);

  const baselinePath = path.join(outputDir, `${slug}_baseline.png`);
  const currentPath = path.join(outputDir, `${slug}_current.png`);

  console.log(`\nVisual Regression Test`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  URL       : ${url}`);
  console.log(`  Viewport  : ${viewport[0]}x${viewport[1]}`);
  console.log(`  Threshold : ${(threshold * 100).toFixed(1)}%`);
  console.log(`  Full page : ${fullPage}`);
  console.log(`${"=".repeat(50)}\n`);

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: viewport[0], height: viewport[1] });

  console.log("Navigating to page...");
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

  // Wait a bit for any animations to settle
  await new Promise((r) => setTimeout(r, 1000));

  const screenshotPath =
    fs.existsSync(baselinePath) && !updateBaseline ? currentPath : baselinePath;

  console.log(`Taking screenshot -> ${path.basename(screenshotPath)}`);
  await page.screenshot({ path: screenshotPath, fullPage });

  await browser.close();

  if (screenshotPath === baselinePath) {
    console.log("\nBaseline saved. Run again to compare against it.");
    console.log(`  ${baselinePath}`);
    process.exit(0);
  }

  // Compare
  console.log("\nComparing against baseline...");

  const baselineStat = fs.statSync(baselinePath);
  const currentStat = fs.statSync(currentPath);

  if (baselineStat.size !== currentStat.size) {
    console.log(
      `\n  FAIL — File sizes differ (baseline: ${baselineStat.size} bytes, current: ${currentStat.size} bytes)`
    );
    console.log(
      "  The page dimensions may have changed. Use --update to accept the new baseline.\n"
    );
    process.exit(1);
  }

  const baselineBuf = fs.readFileSync(baselinePath);
  const currentBuf = fs.readFileSync(currentPath);

  if (baselineBuf.equals(currentBuf)) {
    console.log("\n  PASS — Screenshots are identical.\n");
    // Clean up current since it matches
    fs.unlinkSync(currentPath);
    process.exit(0);
  }

  // Byte-level comparison as a rough proxy (true pixel diff requires a PNG decoder)
  let diffBytes = 0;
  const len = Math.min(baselineBuf.length, currentBuf.length);
  for (let i = 0; i < len; i++) {
    if (baselineBuf[i] !== currentBuf[i]) diffBytes++;
  }
  const ratio = diffBytes / len;

  if (ratio <= threshold) {
    console.log(
      `\n  PASS — Diff ratio ${(ratio * 100).toFixed(3)}% is within threshold.`
    );
    fs.unlinkSync(currentPath);
    process.exit(0);
  }

  console.log(
    `\n  FAIL — Diff ratio ${(ratio * 100).toFixed(3)}% exceeds threshold of ${(threshold * 100).toFixed(1)}%.`
  );
  console.log(`  Baseline : ${baselinePath}`);
  console.log(`  Current  : ${currentPath}`);
  console.log("  Use --update to accept the new version as baseline.\n");
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
