# AGENTS.md

This file provides guidance to Agents Code (agents.ai/code) when working with code in this repository.

## Project Purpose

srishti-qa-harness is a collection of standalone CLI tools for formal QA engineering and software testing of web environments and websites. Each tool targets a specific testing concern (broken links, performance, accessibility, visual regression, form validation, API health).

## Architecture

The repo has no build system, framework, or shared library. Each script in `tools/` is an independent, self-contained CLI tool. There is no shared state between tools.

- **Python tools** (`tools/*.py`) — Depend on `requests` and `beautifulsoup4`. No browser automation; they work via HTTP requests and HTML parsing.
- **JavaScript tools** (`tools/*.js`) — `visual_regression.js` and `form_tester.js` depend on `puppeteer` (headless Chrome). `api_health_checker.js` uses only Node built-in modules (zero dependencies).

Installed Agents Code skills (playwright-cli, selenium-automation, vitest, webapp-testing) live in `.agents/skills/` and `.agents/skills/` — these are managed by the skills system and should not be manually edited.

## Running Tools

Python tools:
```
pip install requests beautifulsoup4
python tools/link_checker.py <url>
python tools/performance_audit.py <url>
python tools/accessibility_checker.py <url> [--local]
```

JavaScript tools:
```
npm install puppeteer
node tools/visual_regression.js <url>
node tools/form_tester.js <url>
node tools/api_health_checker.js --spec endpoints.json --base-url <url>
```

All tools support `--help` and exit with non-zero status on failure (CI-friendly).

## Conventions

- Each tool is a single file — no cross-tool imports or shared utility modules.
- Tools print structured text reports to stdout with pass/fail summaries.
- Python scripts guard their external imports and print install instructions if missing.
- JS scripts that need Puppeteer do the same with a try/catch on `require("puppeteer")`.
