# Agent QA Harness

A comprehensive toolkit for formal QA engineering and software testing of web environments and websites. The repository combines standalone CLI tools for automated testing with Claude Code agent skills for interactive browser automation and test authoring.

---

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Tools](#tools)
  - [Link Checker (Python)](#link-checker)
  - [Performance Audit (Python)](#performance-audit)
  - [Accessibility Checker (Python)](#accessibility-checker)
  - [Visual Regression Tester (JavaScript)](#visual-regression-tester)
  - [Form Tester (JavaScript)](#form-tester)
  - [API Health Checker (JavaScript)](#api-health-checker)
- [Agent Skills](#agent-skills)
  - [playwright-cli](#playwright-cli)
  - [playwright](#playwright)
  - [webapp-testing](#webapp-testing)
  - [selenium-automation](#selenium-automation)
  - [vitest](#vitest)
  - [screenshot](#screenshot)
- [CI Integration](#ci-integration)

---

## Overview

The harness is organized into two layers:

| Layer | Location | Purpose |
|-------|----------|---------|
| **CLI Tools** | `tools/` | Standalone scripts (Python & JS) that test a URL or spec and produce pass/fail reports. Designed for CI pipelines and manual QA runs. |
| **Agent Skills** | `.agents/skills/` | Claude Code skill packs that provide interactive browser automation, test generation, and guided testing workflows when working inside Claude Code. |

### Quick Comparison

| Tool | Language | Dependencies | What It Tests |
|------|----------|-------------|---------------|
| `link_checker.py` | Python | requests, beautifulsoup4 | Broken links across a site |
| `performance_audit.py` | Python | requests, beautifulsoup4 | TTFB, page weight, resource counts |
| `accessibility_checker.py` | Python | requests, beautifulsoup4 | WCAG violations (alt text, labels, headings, lang) |
| `visual_regression.js` | Node.js | puppeteer | Screenshot diffs against baselines |
| `form_tester.js` | Node.js | puppeteer | Form validation with XSS, SQLi, boundary payloads |
| `api_health_checker.js` | Node.js | _(none — uses built-in http/https)_ | API endpoint status, latency, schema |

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Install Python Dependencies

```bash
pip install requests beautifulsoup4
```

### Install JavaScript Dependencies

```bash
npm install puppeteer
```

> `api_health_checker.js` has zero external dependencies and works with a bare Node.js install.

---

## Tools

Every tool lives in `tools/` as a single self-contained file. Each supports `--help`, prints a structured text report to stdout, and exits with a non-zero status code on failure.

---

### Link Checker

**`tools/link_checker.py`** — Crawls a website starting from a given URL, follows internal links up to a configurable depth using BFS traversal, and reports every link that returns a non-200 HTTP status.

```bash
python tools/link_checker.py https://example.com
python tools/link_checker.py https://example.com --depth 3 --timeout 10
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `url` | _(required)_ | Starting URL to crawl |
| `--depth` | 2 | Maximum crawl depth for internal links |
| `--timeout` | 8 | HTTP request timeout in seconds |

**What it checks:**
- Follows all `<a href>` links on each page
- Only crawls internal pages (same domain) but validates external links too
- Skips `mailto:`, `tel:`, `javascript:`, and fragment-only links
- Reports status codes for every link, highlights broken ones with the source page where they were found
- Follows redirects automatically

**Sample output:**
```
============================================================
  Link Check Report
============================================================
  Total links checked : 47
  OK (200)            : 44
  Broken / Errors     : 3
============================================================

Broken links:

  [404] https://example.com/old-page
        found on: https://example.com/blog

  [ERROR] https://example.com/timeout-page
        found on: https://example.com — Connection timed out
```

---

### Performance Audit

**`tools/performance_audit.py`** — Measures Time-To-First-Byte, page weight, resource counts, and identifies the slowest and largest resources on a page.

```bash
python tools/performance_audit.py https://example.com
python tools/performance_audit.py https://example.com --threshold 2.0
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `url` | _(required)_ | URL to audit |
| `--threshold` | 3.0 | Maximum acceptable TTFB in seconds |
| `--timeout` | 15 | HTTP request timeout in seconds |

**What it measures:**
- **TTFB** — Time-To-First-Byte with pass/fail against threshold
- **Page weight** — HTML document size plus all linked resources (warns if > 5 MB)
- **Resource breakdown** — Counts stylesheets, scripts, images, fonts separately
- **Slowest resource** — The resource that took the longest to download
- **Largest resource** — The resource with the biggest payload
- **Resource errors** — Any linked resources that failed to load

---

### Accessibility Checker

**`tools/accessibility_checker.py`** — Static WCAG analysis of an HTML page. Works on remote URLs or local HTML files.

```bash
python tools/accessibility_checker.py https://example.com
python tools/accessibility_checker.py ./build/index.html --local
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `target` | _(required)_ | URL or local file path |
| `--local` | false | Treat target as a local file instead of a URL |

**Checks performed:**

| Rule | Severity | What it catches |
|------|----------|-----------------|
| `html-lang` | ERROR | Missing `lang` attribute on `<html>` |
| `document-title` | ERROR | Missing or empty `<title>` element |
| `img-alt` | ERROR | Images without `alt` attribute |
| `img-alt-empty` | WARN | Empty `alt` without `role="presentation"` |
| `label` | ERROR | Form controls without associated label, `aria-label`, or `title` |
| `link-name` | ERROR | Links with no discernible text |
| `button-name` | ERROR | Buttons with no discernible text |
| `heading-order` | WARN | Skipped heading levels (e.g. h2 → h4) |
| `empty-heading` | WARN | Heading elements with no text |
| `meta-viewport` | WARN | Viewport disabling user scaling |
| `table-header` | WARN | Data tables without `<th>` cells |

---

### Visual Regression Tester

**`tools/visual_regression.js`** — Captures a screenshot of a page via headless Chrome (Puppeteer), saves it as a baseline on first run, and compares subsequent captures against that baseline.

```bash
node tools/visual_regression.js https://example.com
node tools/visual_regression.js https://example.com --viewport 1280x720 --threshold 0.05
node tools/visual_regression.js https://example.com --update
node tools/visual_regression.js https://example.com --full-page
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `<url>` | _(required)_ | URL to screenshot |
| `--viewport` | 1920x1080 | Viewport size as `WxH` |
| `--threshold` | 0.01 | Mismatch ratio tolerance (0.01 = 1%) |
| `--update` | false | Overwrite existing baseline |
| `--output-dir` | `./vr_snapshots` | Directory for baseline and diff images |
| `--full-page` | false | Capture full scrollable page |

**How it works:**
1. First run → saves a baseline PNG in the output directory
2. Subsequent runs → captures a new screenshot and compares byte-by-byte against the baseline
3. If the diff ratio exceeds the threshold → FAIL; screenshots are kept for manual review
4. If within threshold → PASS; the current screenshot is cleaned up
5. Use `--update` to accept changes as the new baseline

---

### Form Tester

**`tools/form_tester.js`** — Discovers all `<form>` elements on a page, catalogues their inputs and validation constraints, then systematically tests each field with adversarial and boundary-value payloads.

```bash
node tools/form_tester.js https://example.com/login
node tools/form_tester.js https://example.com/contact --no-submit
node tools/form_tester.js https://example.com/register --timeout 20000
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `<url>` | _(required)_ | Page URL containing forms |
| `--timeout` | 15000 | Navigation timeout in ms |
| `--no-submit` | false | Catalogue forms without testing them |

**Test payloads per input type:**

| Input Type | Payloads |
|------------|----------|
| `text` | empty, normal text, 5000-char string, `<script>alert("xss")</script>`, `' OR 1=1 --`, unicode, whitespace-only |
| `email` | empty, valid, missing `@`, double `@`, plus-addressing |
| `number` | empty, 0, -1, 99999999999, 3.14, non-numeric text |
| `password` | empty, 2-char, complex valid, 1000-char |
| `url` | empty, valid HTTPS, invalid text, `javascript:` protocol |

For each payload, the tool checks the browser's HTML5 Constraint Validation API and reports whether the input was accepted or blocked (and which specific validity flags triggered: `valueMissing`, `typeMismatch`, `tooLong`, `tooShort`, `patternMismatch`).

---

### API Health Checker

**`tools/api_health_checker.js`** — Validates API endpoints against a JSON specification file. Zero external dependencies.

```bash
# Generate a starter spec file
node tools/api_health_checker.js --generate http://localhost:3000

# Run checks
node tools/api_health_checker.js --spec endpoints.json
node tools/api_health_checker.js --spec endpoints.json --base-url https://staging.example.com
node tools/api_health_checker.js --spec endpoints.json --verbose
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--spec` | _(required)_ | Path to endpoint spec JSON file |
| `--base-url` | `http://localhost:3000` | Base URL prepended to each path |
| `--timeout` | 10000 | Request timeout in ms |
| `--verbose` | false | Show response bodies on failure |
| `--generate` | — | Generate a starter spec file for the given URL |

**Spec file format** (`endpoints.json`):

```json
[
  {
    "name": "List Users",
    "method": "GET",
    "path": "/api/users",
    "expectedStatus": 200,
    "maxResponseTime": 2000,
    "requiredFields": ["data", "total"],
    "headers": { "Authorization": "Bearer <token>" }
  },
  {
    "name": "Create User",
    "method": "POST",
    "path": "/api/users",
    "body": { "name": "Test", "email": "test@example.com" },
    "expectedStatus": 201,
    "requiredFields": ["id"]
  }
]
```

**What it validates per endpoint:**
- HTTP status code matches `expectedStatus`
- Response time is within `maxResponseTime`
- `Content-Type` header matches `contentType` (default: `application/json`)
- All `requiredFields` are present as top-level keys in the JSON response

---

## Agent Skills

These Claude Code skills are pre-installed and available when working in this repository through Claude Code. They provide guided, interactive testing workflows beyond what the standalone CLI tools offer.

### playwright-cli

> Source: `microsoft/playwright-cli`

Full-featured browser automation through CLI commands. Provides granular control over navigation, element interaction, cookies, local/session storage, network mocking, and DevTools integration.

**Key capabilities:**
- Navigate, click, type, fill, select, hover, drag, scroll
- Element targeting via CSS selectors, XPath, test IDs, and ARIA roles
- Cookie and storage state management (save/load for auth flows)
- Network request mocking and interception
- Console monitoring, tracing, and video recording
- Multi-tab and multi-browser support (Chrome, Firefox, WebKit, Edge)

**Reference guides included:** element attributes, request mocking, running code, test generation, session management, storage state, tracing, video recording, Playwright test authoring.

---

### playwright

> Source: bundled skill

A higher-level wrapper around playwright-cli optimized for the snapshot-based workflow: open a page → take a snapshot → interact with elements by ref → re-snapshot to verify.

**Key capabilities:**
- Wrapper shell script (`playwright_cli.sh`) for npx-based execution
- Snapshot-driven element targeting with auto-generated refs
- Multi-tab workflows and persistent browser profiles
- UI flow debugging with tracing

---

### webapp-testing

> Source: `anthropics/skills`

Python-based toolkit for testing local web applications. Includes a server lifecycle helper that starts your dev server, runs Playwright-based tests, and tears it down.

**Key capabilities:**
- Server lifecycle management (single or multi-server setups)
- Reconnaissance-then-action workflow: navigate → screenshot → inspect DOM → act
- Browser console log capture
- Element discovery patterns for dynamic content

**Included examples:** static HTML automation, console logging, element discovery.

---

### selenium-automation

> Source: `mindrally/skills`

Expert guidance and patterns for Selenium WebDriver-based browser testing.

**Key capabilities:**
- Driver Factory pattern and browser driver management
- Page Object Model (POM) design pattern with base page class
- Explicit/implicit wait strategies for dynamic content
- Cross-browser testing (Chrome, Firefox, Safari, Edge)
- Selenium Grid configuration for parallel execution
- Alert, frame/iframe, and multi-window handling

---

### vitest

> Source: `onmax/nuxt-skills`

Configuration and authoring guidance for Vitest, the Vite-native test framework.

**Key capabilities:**
- Test suite authoring with `describe`/`it` and Jest-compatible API
- Module mocking (`vi.fn`, `vi.mock`), timer mocking, spy patterns
- Code coverage configuration and threshold enforcement
- Snapshot testing, type testing, browser mode
- Workspace and multi-project configuration

---

### screenshot

> Source: bundled skill

Cross-platform desktop screenshot capture (macOS, Linux, Windows). Useful for capturing full-screen, window-specific, or region-specific screenshots during testing.

**Key capabilities:**
- Full screen, app/window, and pixel-region capture modes
- macOS Screen Recording permission preflight
- Multi-display handling
- Platform-specific implementations (Swift helpers for macOS, PowerShell for Windows, scrot/gnome-screenshot for Linux)

---

## CI Integration

All CLI tools exit with code 0 on success and code 1 on failure, making them straightforward to integrate into CI pipelines:

```yaml
# Example GitHub Actions step
- name: Check for broken links
  run: python tools/link_checker.py https://staging.example.com --depth 2

- name: Performance gate
  run: python tools/performance_audit.py https://staging.example.com --threshold 2.0

- name: Accessibility scan
  run: python tools/accessibility_checker.py https://staging.example.com

- name: Visual regression
  run: node tools/visual_regression.js https://staging.example.com --threshold 0.02

- name: API health check
  run: node tools/api_health_checker.js --spec endpoints.json --base-url https://staging.example.com
```
