# Testing Guidelines

This document defines the mandatory rules, standards, thresholds, and behavioral expectations that govern all QA engineering and software testing activities conducted through this harness. Every tester, automation script, and CI gate operating under this repository **must** treat the thresholds in this document as hard pass/fail boundaries unless a documented, time-bound exception is approved by the QA lead.

---

## Table of Contents

1. [Guiding Principles](#1-guiding-principles)
2. [Performance Testing](#2-performance-testing)
   - 2.1 [Core Web Vitals](#21-core-web-vitals)
   - 2.2 [Supplementary Performance Metrics](#22-supplementary-performance-metrics)
   - 2.3 [Lighthouse Score Requirements](#23-lighthouse-score-requirements)
   - 2.4 [API Response Time Standards](#24-api-response-time-standards)
   - 2.5 [Page Load Budgets](#25-page-load-budgets)
   - 2.6 [Network Throttling Profiles](#26-network-throttling-profiles)
3. [Accessibility Testing](#3-accessibility-testing)
   - 3.1 [WCAG Conformance Requirements](#31-wcag-conformance-requirements)
   - 3.2 [Color Contrast Ratios](#32-color-contrast-ratios)
   - 3.3 [Touch Target Sizes](#33-touch-target-sizes)
   - 3.4 [Keyboard and Focus Management](#34-keyboard-and-focus-management)
   - 3.5 [Animation and Motion](#35-animation-and-motion)
4. [UX Quality Standards](#4-ux-quality-standards)
   - 4.1 [Nielsen's Usability Heuristics as Test Criteria](#41-nielsens-usability-heuristics-as-test-criteria)
   - 4.2 [Typography and Readability](#42-typography-and-readability)
   - 4.3 [Loading States](#43-loading-states)
   - 4.4 [Error Handling UX](#44-error-handling-ux)
   - 4.5 [Empty States](#45-empty-states)
   - 4.6 [Navigation and Information Architecture](#46-navigation-and-information-architecture)
5. [Form Testing](#5-form-testing)
   - 5.1 [Validation Behavior Rules](#51-validation-behavior-rules)
   - 5.2 [Field Constraint Matrix](#52-field-constraint-matrix)
   - 5.3 [Adversarial Input Requirements](#53-adversarial-input-requirements)
6. [Visual Regression Testing](#6-visual-regression-testing)
7. [Cross-Browser and Cross-Device Testing](#7-cross-browser-and-cross-device-testing)
   - 7.1 [Browser Testing Matrix](#71-browser-testing-matrix)
   - 7.2 [Viewport Sizes](#72-viewport-sizes)
   - 7.3 [Mobile-Specific Checks](#73-mobile-specific-checks)
8. [Security Testing](#8-security-testing)
   - 8.1 [OWASP Top 10 Coverage](#81-owasp-top-10-coverage)
   - 8.2 [HTTP Security Headers](#82-http-security-headers)
   - 8.3 [Cookie and Session Rules](#83-cookie-and-session-rules)
9. [SEO Validation](#9-seo-validation)
10. [Image and Media Optimization](#10-image-and-media-optimization)
11. [Internationalization (i18n) Testing](#11-internationalization-i18n-testing)
12. [Privacy and Compliance Testing](#12-privacy-and-compliance-testing)
13. [HTTP Status Code Verification](#13-http-status-code-verification)
14. [Test Reporting and Exit Criteria](#14-test-reporting-and-exit-criteria)

---

## 1. Guiding Principles

These are non-negotiable. Every testing activity conducted under this harness must uphold them.

1. **Measure, do not assume.** Every claim about performance, accessibility, or correctness must be backed by a recorded metric. Subjective assessments ("it feels fast") are not valid test results.
2. **Test at the boundaries.** Valid inputs confirm the happy path; boundary values, empty inputs, maximum-length strings, and adversarial payloads reveal defects. Always test both sides of every limit.
3. **Test the real environment.** Use production-equivalent data volumes, real network conditions (throttled profiles), and actual target browsers and devices. Tests that only pass on localhost with zero latency are worthless.
4. **Fail early and loudly.** Every test script must exit with a non-zero status code on failure. Silent failures are treated as testing defects. CI pipelines must block on any non-zero exit.
5. **Reproduce before closing.** No defect may be closed without a regression test that proves the fix and will catch future regressions.
6. **Accessibility is not optional.** WCAG AA compliance is a hard gate on every release. It is tested with the same rigor as functional correctness.
7. **Security is everyone's scope.** Every tester must execute the security checks defined in Section 8 as part of standard test cycles. Security is not deferred to a separate team.
8. **Document every exception.** If a threshold defined in this document cannot be met, the exception must be logged with a justification, an owner, and a target resolution date. Undocumented exceptions are treated as failures.

---

## 2. Performance Testing

### 2.1 Core Web Vitals

These are the three metrics Google uses as ranking signals. A page passes only if at least 75% of real-user page views meet the "Good" threshold (measured at the 75th percentile). In lab testing, **every** sampled run must fall within the "Good" threshold.

#### Largest Contentful Paint (LCP) — Loading

Measures when the largest visible content element (image, video poster, or text block) finishes rendering in the viewport. This is the primary indicator of perceived load speed.

| Rating | Threshold |
|--------|-----------|
| **Good** | **≤ 2.5 seconds** |
| Needs Improvement | 2.5 – 4.0 seconds |
| Poor | > 4.0 seconds |

**Hard rule:** Any page with LCP > 4.0s is a **release blocker**. Pages between 2.5s and 4.0s must have a filed remediation ticket before release.

Common LCP killers to verify:
- Hero images not preloaded or lazy-loaded (hero images must **never** be lazy-loaded)
- Server-side rendering delays (check TTFB first)
- Render-blocking CSS or synchronous JavaScript in `<head>`
- Web fonts blocking text rendering (verify `font-display: swap` or `optional`)

#### Interaction to Next Paint (INP) — Responsiveness

Measures the latency of all click, tap, and keyboard interactions throughout the page lifecycle. Reports the worst (or near-worst for high-interaction pages) single interaction. Replaced First Input Delay (FID) as a Core Web Vital in March 2024.

| Rating | Threshold |
|--------|-----------|
| **Good** | **≤ 200 ms** |
| Needs Improvement | 200 – 500 ms |
| Poor | > 500 ms |

**Hard rule:** Any interaction exceeding 500ms is a **release blocker**. Test every interactive element: buttons, dropdowns, toggles, accordions, tab switches, search inputs, and modals.

Common INP killers to verify:
- Long tasks on the main thread (> 50ms)
- Synchronous JavaScript during event handlers
- Excessive DOM size (> 1,500 nodes)
- Layout thrashing (read-then-write in loops)

#### Cumulative Layout Shift (CLS) — Visual Stability

Measures the sum of all unexpected layout shift scores during the page lifecycle. A layout shift score equals the impact fraction multiplied by the distance fraction of unstable elements.

| Rating | Threshold |
|--------|-----------|
| **Good** | **≤ 0.1** |
| Needs Improvement | 0.1 – 0.25 |
| Poor | > 0.25 |

**Hard rule:** CLS > 0.25 is a **release blocker**.

Mandatory preventive checks:
- All `<img>` and `<video>` elements have explicit `width` and `height` attributes
- No content is injected above the fold after initial paint (ads, banners, cookie consents must reserve space)
- Web fonts do not cause Flash of Invisible Text (FOIT) or Flash of Unstyled Text (FOUT) that shifts layout
- Dynamically loaded content (infinite scroll, "load more") does not push existing content

### 2.2 Supplementary Performance Metrics

These are not Core Web Vitals but are required measurements in every performance test cycle.

#### First Contentful Paint (FCP)

Time until the browser renders the first piece of DOM content (text, image, SVG, or non-white canvas). This is the user's first visual signal that the page is loading.

| Rating | Threshold |
|--------|-----------|
| **Good** | **≤ 1.8 seconds** |
| Needs Improvement | 1.8 – 3.0 seconds |
| Poor | > 3.0 seconds |

**Rule:** FCP > 3.0s is a blocker. The gap between FCP and LCP should not exceed 1.5 seconds — a large gap indicates the page shows something quickly but delays the main content.

#### Time to First Byte (TTFB)

Time from navigation start until the first byte of the HTTP response arrives. Includes DNS lookup, TCP connection, TLS handshake, and server processing time.

| Rating | Threshold |
|--------|-----------|
| **Good** | **≤ 800 ms** |
| Needs Improvement | 800 – 1,800 ms |
| Poor | > 1,800 ms |

**Rule:** TTFB > 1,800ms is a blocker. TTFB sets the floor for every subsequent metric — if the server is slow, nothing downstream can compensate.

#### Total Blocking Time (TBT)

Total time after FCP where the main thread was blocked by long tasks (> 50ms each). For each long task, the blocking time is the duration minus 50ms. TBT is a lab proxy for INP.

| Rating | Threshold |
|--------|-----------|
| **Good (mobile)** | **≤ 200 ms** |
| **Good (desktop)** | **≤ 100 ms** |
| Needs Improvement | 200 – 600 ms |
| Poor | > 600 ms |

TBT carries the highest weight in Lighthouse scoring (30%).

#### Speed Index

Measures how quickly the visible area of the page is populated with content. Calculated from video frames of the page load.

| Rating | Threshold |
|--------|-----------|
| **Good** | **≤ 3.4 seconds** |
| Needs Improvement | 3.4 – 5.8 seconds |
| Poor | > 5.8 seconds |

### 2.3 Lighthouse Score Requirements

All pages must achieve the following Lighthouse scores in a controlled lab environment (consistent hardware, network throttling applied, three-run median):

| Category | Minimum Score | Target Score |
|----------|--------------|-------------|
| **Performance** | **75** | **90+** |
| **Accessibility** | **90** | **100** |
| **Best Practices** | **90** | **100** |
| **SEO** | **90** | **100** |

**Lighthouse Performance Score Weights (current):**

| Metric | Weight |
|--------|--------|
| Total Blocking Time (TBT) | 30% |
| Largest Contentful Paint (LCP) | 25% |
| Cumulative Layout Shift (CLS) | 25% |
| First Contentful Paint (FCP) | 10% |
| Speed Index (SI) | 10% |

Score interpretation: 90–100 = Good (green), 50–89 = Needs Improvement (orange), 0–49 = Poor (red).

### 2.4 API Response Time Standards

#### Latency Thresholds

| Category | Threshold | Context |
|----------|-----------|---------|
| Excellent | < 100 ms | Real-time UX, finance, gaming |
| Good | 100 – 200 ms | Standard web and mobile applications |
| Acceptable | 200 – 500 ms | Business APIs (catalogs, profiles, search) |
| Noticeable | 500 ms – 1 s | Users perceive delay; optimize immediately |
| Unacceptable | > 1 second | **Release blocker** |

#### Percentile-Based Monitoring (Required)

Averages hide tail latency. All API monitoring must track percentiles:

| Percentile | Maximum Allowed |
|------------|----------------|
| P50 (median) | < 100 ms |
| P95 | < 200 ms |
| P99 | < 500 ms |

**Rule:** If P99 exceeds 500ms in any test run, the endpoint is flagged as degraded and requires investigation before release.

#### Async Operations

Long-running operations must return an immediate acknowledgment (`202 Accepted`) within 100ms, then use polling or webhooks for completion notification. Synchronous endpoints must never block for more than 1 second.

### 2.5 Page Load Budgets

| Resource Type | Maximum Budget |
|---------------|---------------|
| Total page weight (all resources) | **3 MB** (warn at 2 MB) |
| HTML document | 100 KB |
| CSS (total, all files) | 200 KB |
| JavaScript (total, all files) | 500 KB |
| Images (total, above the fold) | 500 KB |
| Web fonts (total) | 200 KB |
| Third-party scripts (total) | 300 KB |

**Rule:** Total page weight exceeding 5 MB is a **release blocker**. Pages between 3–5 MB require a filed optimization ticket.

### 2.6 Network Throttling Profiles

All performance tests must be run under at least one throttled profile in addition to unthrottled. The following profiles are mandatory:

#### Primary Test Profile (Lighthouse Default)

| Setting | Value |
|---------|-------|
| Download | 1.6 Mbps |
| Upload | 750 Kbps |
| RTT (latency) | 150 ms |
| CPU slowdown | 4x multiplier |

This simulates the bottom 25% of 4G connections on a mid-tier mobile device. **All performance thresholds in this document are evaluated against this profile.**

#### Secondary Profiles (Required for Critical Flows)

| Profile | Download | Upload | Latency | When to Use |
|---------|----------|--------|---------|-------------|
| Fast 4G | 9 Mbps | 1.5 Mbps | 165 ms | Urban mobile, good coverage |
| Slow 3G | 400 Kbps | 400 Kbps | 2,000 ms | Rural / developing regions, worst case |
| Offline | 0 | 0 | — | Service worker and error handling validation |

**Rule:** Payment flows, login flows, and onboarding flows must pass all thresholds on Slow 3G. Other pages may use Fast 4G as the secondary profile.

---

## 3. Accessibility Testing

### 3.1 WCAG Conformance Requirements

This harness enforces **WCAG 2.2 Level AA** as the minimum legal and quality standard. All criteria are mandatory unless marked otherwise.

#### Level A (32 criteria — absolute minimum)

Without these, some users literally cannot use the site. Failure on any Level A criterion is a **release blocker**.

Key requirements:
- Text alternatives for all non-text content (1.1.1)
- Captions for prerecorded audio/video (1.2.1–1.2.3)
- Info and relationships conveyed through semantic structure, not visual formatting alone (1.3.1)
- Meaningful reading sequence preserved (1.3.2)
- Color is never the sole means of conveying information (1.4.1)
- Full keyboard accessibility with no keyboard traps (2.1.1, 2.1.2)
- Timing adjustable for time-limited content (2.2.1)
- No content flashes more than 3 times per second (2.3.1)
- Every page has a descriptive `<title>` (2.4.2)
- Link purpose is determinable from link text or context (2.4.4)
- Language of the page is identified via `<html lang="...">` (3.1.1)
- Errors are identified and described in text (3.3.1)
- Labels or instructions are provided for user input (3.3.2)
- Focus not obscured (minimum) — focused elements must not be completely hidden (2.4.11)
- Redundant entry — do not require re-entry of previously submitted info in same session (3.3.7)

#### Level AA (24 additional criteria — legal standard)

This is the conformance level required by Section 508, EN 301 549, ADA, and AODA. Failure on any Level AA criterion is a **release blocker**.

Key requirements:
- Contrast ratio minimum **4.5:1** for normal text, **3:1** for large text (1.4.3)
- Text resizable to 200% without loss of content or functionality (1.4.4)
- Reflow at 320px CSS width without horizontal scrolling (1.4.10)
- Non-text contrast minimum **3:1** for UI components and graphical objects (1.4.11)
- Text spacing can be overridden without breaking content (1.4.12)
- Consistent navigation across pages (3.2.3)
- Consistent identification of same-function components (3.2.4)
- Error prevention for legal/financial data (3.3.4)
- Dragging movements have single-pointer alternatives (2.5.7)
- Touch targets minimum **24×24 CSS pixels** (2.5.8)
- Focus indicators meet minimum size (2px perimeter) and **3:1** contrast (2.4.13)
- Help mechanisms appear in consistent locations (3.2.6)
- No cognitive function tests for authentication (3.3.8)

#### Level AAA (aspirational — not required but tracked)

Level AAA criteria are not release gates but violations should be logged as improvement opportunities:
- Enhanced contrast 7:1 for normal text, 4.5:1 for large text (1.4.6)
- No timing limits whatsoever (2.2.3)
- Sign language for prerecorded audio (1.2.6)

### 3.2 Color Contrast Ratios

| Standard | Normal Text (< 18pt / < 14pt bold) | Large Text (≥ 18pt / ≥ 14pt bold) | Non-Text UI Components |
|----------|-------------------------------------|-------------------------------------|------------------------|
| **AA (required)** | **4.5:1** | **3:1** | **3:1** |
| AAA (aspirational) | 7:1 | 4.5:1 | — |

**Large text definition:** 18pt (24px) or larger at regular weight, or 14pt (18.5px) or larger at bold (700+) weight. 1pt = 1.333 CSS pixels.

**Mandatory checks:**
- All text/background combinations including hover, focus, active, and visited states
- Placeholder text (must still meet 4.5:1 — many designs fail here)
- Text rendered on images or gradients at the lowest-contrast point
- Focus indicator contrast against both the component and the surrounding background
- Error/success/warning state colors against their backgrounds

**Exempt from contrast requirements:** disabled controls, purely decorative text, logos.

### 3.3 Touch Target Sizes

| Standard | Minimum Size | Status |
|----------|-------------|--------|
| **WCAG 2.5.8 (AA)** | **24 × 24 CSS px** | **Required** |
| WCAG 2.5.5 (AAA) | 44 × 44 CSS px | Recommended |
| Apple HIG | 44 × 44 points | Required for iOS targets |
| Material Design 3 | 48 × 48 dp | Required for Android targets |
| **Cross-platform recommendation** | **48 × 48 px** | **Adopt the largest standard** |

**Spacing between adjacent targets:** minimum **8px** gap to prevent accidental taps.

WCAG 2.5.8 exceptions (targets may be smaller than 24×24px only if):
1. A 24px-diameter circle centered on the target does not intersect any other target's 24px circle
2. An equivalent same-function control elsewhere on the page meets the requirement
3. The target is inline within a sentence or text block
4. The size is determined by the browser (native controls)
5. The specific presentation is legally or informationally essential

**Test method:** Measure all interactive elements (buttons, links, checkboxes, radio buttons, toggles, icon buttons) on actual touch devices, not just responsive mode in desktop browsers. The hit area (not just the visible element) must meet the size requirement.

### 3.4 Keyboard and Focus Management

These are hard requirements. Failure is a release blocker.

1. **Every interactive element** must be reachable and operable via keyboard alone (Tab, Shift+Tab, Enter, Space, Arrow keys, Escape).
2. **Tab order** must follow the visual reading order. No element may receive focus out of logical sequence.
3. **Focus must never be trapped.** The user must always be able to Tab away from any component. Modals must trap focus while open and return focus to the trigger element on close — this is the only acceptable focus trap.
4. **Focus indicators** must be visible at all times. Removing `outline: none` without providing a custom focus indicator is a **release blocker**.
5. **Skip navigation link** must be the first focusable element on every page (visible on focus, links to `#main-content` or equivalent).
6. **Custom components** (dropdowns, date pickers, carousels, tabs) must implement the appropriate ARIA pattern from the [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apd/).
7. **Focus must not be obscured.** When an element receives focus, no other content (sticky headers, cookie banners, floating toolbars) may completely cover it.

### 3.5 Animation and Motion

| WCAG Criterion | Level | Rule |
|----------------|-------|------|
| 2.3.1 Three Flashes or Below Threshold | A | **No content flashes more than 3 times per second.** Violation is a release blocker. |
| 2.2.2 Pause, Stop, Hide | A | Auto-playing content lasting **> 5 seconds** must have pause/stop/hide controls. |
| 2.3.3 Animation from Interactions | AAA | Motion triggered by interaction can be disabled unless essential. |

**Duration limits for UI animations:**

| Animation Type | Duration | Notes |
|----------------|----------|-------|
| Micro-interactions (button, toggle) | 100–200 ms | |
| Standard UI transitions (fade, slide) | 200–300 ms | The sweet spot |
| Complex transitions (page, modal) | 300–500 ms | **Never exceed 500ms** |
| Color/opacity changes | < 100 ms | Must feel instantaneous |

**`prefers-reduced-motion` is mandatory.** When the operating system's "Reduce Motion" setting is active:
- All non-essential animations must be eliminated or replaced with simple opacity fades
- Parallax scrolling effects must be disabled
- Auto-playing carousels and slideshows must stop
- Page transitions must be replaced with instant changes
- Loading spinners may remain (they are functional, not decorative)
- **No functionality may be lost** when motion is reduced

**Performance constraint:** Animations must only use GPU-composited properties: `transform` and `opacity`. Animating `width`, `height`, `top`, `left`, `margin`, or `padding` triggers layout recalculation and is prohibited.

---

## 4. UX Quality Standards

### 4.1 Nielsen's Usability Heuristics as Test Criteria

Each heuristic maps to concrete test assertions. All are mandatory checks.

| # | Heuristic | What the Tester Must Verify |
|---|-----------|---------------------------|
| 1 | **Visibility of System Status** | Loading indicators appear for every async operation. Progress bars for multi-step flows. Real-time feedback on user actions (save confirmations, upload progress, form submission). The user is never left staring at a static screen wondering if something is happening. |
| 2 | **Match Between System and Real World** | No developer jargon in user-facing text. Icons match real-world metaphors. Information is ordered by user priority, not database schema. Dates, currencies, and numbers follow the user's locale. |
| 3 | **User Control and Freedom** | Undo/redo is available where destructive actions occur. Every modal has a close button and responds to Escape. Users can cancel or go back from any multi-step process. The browser back button works correctly on every page. |
| 4 | **Consistency and Standards** | Identical actions use identical labels everywhere. Buttons and links behave consistently across pages. Platform conventions are followed (underlined text = link, right-click = context menu). |
| 5 | **Error Prevention** | Destructive actions require confirmation dialogs. Form inputs use appropriate type constraints (`type="email"`, `maxlength`, `min`/`max`). Disabled states prevent invalid submissions. Unsaved changes trigger a warning on navigation. |
| 6 | **Recognition Rather than Recall** | Recently used items are visible. Form labels persist (never placeholder-only inputs for required fields). Navigation is always accessible. The user is never required to memorize information from a previous screen. |
| 7 | **Flexibility and Efficiency of Use** | Keyboard shortcuts exist for power users. Frequently used actions are easily accessible (no more than 2 clicks). Search and filter options are available on list/table views. |
| 8 | **Aesthetic and Minimalist Design** | No irrelevant information on screen. Visual hierarchy guides attention to primary actions. Content density is appropriate for the context. |
| 9 | **Help Users Recover from Errors** | Error messages are in plain language. They identify the problem precisely. They suggest a specific corrective action. No raw error codes, stack traces, or technical identifiers are shown to users. |
| 10 | **Help and Documentation** | Help is searchable. Contextual tooltips exist where UI elements are non-obvious. Documentation is task-oriented with concrete steps. |

### 4.2 Typography and Readability

#### Minimum Font Sizes

| Context | Minimum | Recommended |
|---------|---------|-------------|
| Body text (desktop) | 16px | 16–20px |
| Body text (mobile) | 12px | 14–16px |
| Secondary/caption text | 12px | 12–14px |
| **Absolute minimum for any readable text** | **12px** | — |

#### Line Height (Leading)

| Context | Minimum | Recommended |
|---------|---------|-------------|
| Body text | **1.5× font size** (WCAG 1.4.12) | 1.5–1.75× |
| Headings | 1.2× font size | 1.2–1.4× |
| Short UI labels | 1.1× font size | 1.1–1.3× |

#### Line Length (Measure)

| Context | Characters per Line |
|---------|-------------------|
| Desktop body text | 45–75 characters |
| **Optimal** | **66 characters** |
| Mobile body text | 35–40 characters |
| **Never exceed** | **90 characters** |

#### WCAG 1.4.12 Text Spacing Override Test

Content must not break or become unreadable when users apply these minimum spacing overrides (test with a browser extension):
- Line height: at least 1.5× the font size
- Paragraph spacing: at least 2× the font size
- Letter spacing (tracking): at least 0.12× the font size
- Word spacing: at least 0.16× the font size

**Rule:** Text must not overflow containers, overlap other elements, or become clipped when these overrides are applied.

### 4.3 Loading States

The correct loading pattern depends on the expected wait time:

| Expected Duration | Required Pattern | Rationale |
|-------------------|-----------------|-----------|
| < 1 second | **No indicator** | Animation would be more distracting than helpful |
| 1–3 seconds | **Spinner** | Brief blocking actions (form submit, auth, save) |
| 2–10 seconds | **Skeleton screen** | Content fetching where layout context matters |
| > 10 seconds | **Determinate progress bar** | User needs to estimate remaining time |
| Unknown duration | **Indeterminate progress bar + explanatory text** | User needs to know why they are waiting |

**Skeleton screen rules:**
- Skeleton layout must match the actual rendered content layout (same number of lines, same card shapes)
- Skeleton must animate with a subtle shimmer to indicate activity
- Transition from skeleton to real content must not cause layout shift (CLS)
- Skeleton must appear immediately — no blank gap before it renders

**Spinner rules:**
- Spinner must not appear until after a **300ms delay** (avoids a flash on fast responses)
- Spinner must have an accessible label (`aria-label="Loading"` or visually hidden text)
- Spinner must have sufficient color contrast (3:1 against background)
- Interactive elements must be disabled or non-clickable during loading
- Spinner must not run indefinitely — show a timeout error after a reasonable duration (30 seconds max)

**Progressive loading rules:**
- Above-the-fold content must load first
- Below-the-fold images must use `loading="lazy"`
- The LCP element must **never** be lazy-loaded
- The LCP image should have `fetchpriority="high"`
- Infinite scroll must load the next batch before the user reaches the bottom

### 4.4 Error Handling UX

Every error scenario below must be tested. Failure to handle any of them gracefully is a defect.

#### 404 Pages

Every 404 page must include:
- A clear, human-readable statement that the page was not found (not just "404")
- Site branding and navigation preserved (not a bare browser error page)
- A search bar
- A link to the homepage
- Links to popular or suggested pages

**Fact:** approximately 74% of users who hit a 404 page leave and never return. Recovery options are critical.

#### Form Errors

- Error summary at the top of long forms, with anchor links to each errored field
- Inline error messages directly below each invalid field
- Fields visually marked (red border + icon — never color alone)
- Error text specifies both what is wrong and how to fix it
- Focus is programmatically moved to the first errored field on submission
- `aria-invalid="true"` and `aria-describedby` referencing the error message on each invalid field
- **Form data must never be cleared on validation failure**

#### Network and Server Errors

Test each of these scenarios explicitly:
- Network disconnection during data submission
- Slow connection (throttle to Slow 3G)
- Server returns 500
- Session/auth token expires mid-use
- API returns malformed or unexpected data

For each, verify:
- The UI shows a user-friendly message (no raw errors, stack traces, or JSON blobs)
- A retry mechanism is offered for transient failures
- User data is preserved where possible ("Your draft was saved")
- Offline state is detected and communicated ("You appear to be offline")

### 4.5 Empty States

Every area of the application that can be empty must have a designed empty state. Test by creating new accounts, clearing all items, and searching for nonexistent terms.

Every empty state must include:
- A clear headline explaining what the area is ("No messages yet")
- Supporting text explaining what will appear there ("When you receive messages, they'll appear here")
- A call-to-action where applicable ("Compose your first message")

Differentiate between:
- **First-use empty** (user has never added content)
- **No-results empty** (search/filter returned nothing — suggest broadening criteria)
- **Error-caused empty** (data failed to load — show retry)
- **User-cleared empty** (user deleted all items — confirm action completed)

### 4.6 Navigation and Information Architecture

**Structural rules:**
- No content should be more than 3 clicks from the homepage
- Related content must be grouped logically under consistent categories
- Menu labels must use user-facing language, not internal terminology
- Navigation must be consistent across all pages
- Current location must always be indicated (active nav state, breadcrumbs)

**Functional checks:**
- All navigation links resolve (no broken internal links)
- Browser back button works correctly throughout every flow
- Breadcrumbs accurately reflect the page hierarchy
- Search returns relevant results for primary content terms
- Mobile hamburger menu opens, closes, and is keyboard accessible
- Skip-to-content link is present and functional
- Deep links work (direct URL access to any page, bookmarkable)
- Pagination functions correctly (first page, last page, middle pages, edge cases)

---

## 5. Form Testing

### 5.1 Validation Behavior Rules

These rules define when and how validation must fire. Deviating from them is a defect.

1. **Validate on blur** (when the user leaves a field), not on every keystroke.
2. **Do not validate empty required fields until form submission.** Premature "this field is required" messages on untouched fields are hostile.
3. **Remove error messages immediately** when the user corrects the input.
4. **Preserve all user input on validation failure.** Clearing the form on error is a **release blocker**.
5. **Disable the submit button during processing** to prevent double submission.
6. **Tab order must follow visual order.** No field should receive focus out of sequence.
7. **Autofill and autocomplete attributes must be correct** (`autocomplete="email"`, `autocomplete="new-password"`, etc.). Test with browser autofill.
8. **Forms must work with password managers.** Login forms that block paste in the password field are a defect.

### 5.2 Field Constraint Matrix

Every field type requires verification of these constraints:

| Field Type | Constraints to Verify |
|------------|----------------------|
| Email | Format validation, max 254 chars (RFC 5321), domain validation |
| Password | Min length (8+), complexity rules displayed upfront, strength meter if applicable |
| Phone | Country-specific format, international prefix handling, E.164 format |
| Date | Calendar picker functionality, manual entry validation, min/max date ranges, invalid dates (Feb 30) |
| Number | Min/max values, decimal precision, negative number handling, non-numeric input rejection |
| File upload | Allowed MIME types, max file size with user-friendly error, multiple file handling |
| Textarea | Character count display, max length enforcement, multi-line input preservation |
| URL | Protocol validation, malformed URL rejection, `javascript:` protocol blocking |
| Required fields | Asterisk or "(required)" label present, error on empty submission |

### 5.3 Adversarial Input Requirements

Every text-accepting input must be tested with the following adversarial payloads. These tests verify that the application properly sanitizes, escapes, or rejects malicious input.

| Payload Category | Example Values | Expected Behavior |
|-----------------|----------------|-------------------|
| XSS probes | `<script>alert("xss")</script>`, `<img onerror=alert(1) src=x>`, `" onmouseover="alert(1)` | Input is escaped or rejected. Never rendered as executable HTML. |
| SQL injection | `' OR 1=1 --`, `'; DROP TABLE users; --`, `" OR ""="` | Input is parameterized or rejected. Never interpolated into queries. |
| Boundary strings | Empty string, single space, 1 character, maximum length + 1, 10,000 characters | Constraints are enforced. No buffer overflows or truncation without warning. |
| Unicode and encoding | `éàüñ 你好 😀`, zero-width characters, RTL override characters (`U+202E`) | Characters render correctly. No layout breaking or encoding errors. |
| Null bytes | `%00`, `\0` | Stripped or rejected. Never cause string termination. |
| Path traversal | `../../../etc/passwd`, `..\..\windows\system32` | Rejected outright in any file-related input. |

---

## 6. Visual Regression Testing

Visual regression tests compare screenshots of the current state against approved baselines to detect unintended visual changes.

**Rules:**

1. **Every page and every major component state** must have a baseline screenshot captured at the reference viewport (1920×1080 desktop + 375×812 mobile).
2. **Diff threshold:** ≤ 1% pixel mismatch is acceptable (accounts for anti-aliasing and rendering differences). Greater than 1% requires manual review.
3. **Baselines must be updated intentionally.** A failed visual regression test must never be resolved by blindly updating the baseline. The change must be reviewed and confirmed as intended.
4. **Test states, not just default views.** Capture baselines for: empty state, loading state, error state, hover state, focus state, populated state, and overflow/truncation state.
5. **Run visual regression on every PR** that touches CSS, HTML templates, or component code.
6. **Wait for network idle and animation settlement** (minimum 1 second after `networkidle2`) before capturing screenshots to avoid flaky diffs.

---

## 7. Cross-Browser and Cross-Device Testing

### 7.1 Browser Testing Matrix

#### Tier 1 — Full Testing (Every Test Cycle)

These browsers must receive complete functional, visual, and accessibility testing. Any defect on a Tier 1 browser is a release blocker.

| Browser | Versions | Platforms |
|---------|----------|-----------|
| Chrome | Latest, latest − 1 | Windows, macOS, Android |
| Safari | Latest, latest − 1 | macOS, iOS |
| Edge | Latest | Windows |

This covers approximately 94% of global users.

#### Tier 2 — Functional + Visual Spot Checks

| Browser | Versions | Platforms |
|---------|----------|-----------|
| Firefox | Latest | Windows, macOS |
| Samsung Internet | Latest | Android |

This raises coverage to approximately 99%.

#### Tier 3 — Smoke Testing Only

| Browser | Notes |
|---------|-------|
| Opera, Brave, UC Browser | Only if analytics show > 2% of traffic |
| Older browser versions | Only if specifically required by contract |

**Rule:** Any browser or OS combination accounting for more than 5% of the target audience's traffic must be promoted to Tier 1. Update the matrix quarterly.

### 7.2 Viewport Sizes

Every page must be tested at these breakpoints. No horizontal scrolling, no content clipping, no overlapping elements at any size.

#### Mobile (Portrait)

| Width | Representative Devices |
|-------|----------------------|
| 320px | iPhone SE (1st gen), small phones |
| 360px | Samsung Galaxy S series, most Android |
| 375px | iPhone 6/7/8, iPhone SE (2nd/3rd gen) |
| 390px | iPhone 12/13/14 |
| 412–414px | iPhone Plus, Pixel series, Galaxy S21+ |
| 430px | iPhone 14 Pro Max, iPhone 15 Pro Max |

#### Tablet

| Size | Representative Devices |
|------|----------------------|
| 768px (portrait) | iPad standard |
| 810–820px (portrait) | iPad 10th gen, iPad Air |
| 1024px (landscape) | iPad, most tablets |
| 1180–1194px (landscape) | iPad Air, iPad Pro 11" |

#### Desktop

| Size | Context |
|------|---------|
| 1280px | Small laptops |
| 1366px | Most common laptop resolution |
| 1440px | Standard desktop |
| 1920px | Full HD — dominant desktop resolution |
| 2560px | QHD / ultrawide |

#### Responsive Breakpoints (Mandatory Test Points)

| Breakpoint | What It Represents |
|------------|-------------------|
| 320px | Smallest supported mobile |
| 480px | Large phones / landscape |
| 768px | Tablet portrait |
| 1024px | Tablet landscape / small laptop |
| 1280px | Desktop |
| 1920px | Full HD |

### 7.3 Mobile-Specific Checks

All of the following must pass on physical devices (not just browser emulation):

- [ ] Tap, swipe, pinch-to-zoom, and long-press gestures function correctly
- [ ] Virtual keyboard does not obscure the active form field (view scrolls to keep the field visible)
- [ ] Orientation changes (portrait ↔ landscape) are handled gracefully — no layout breakage, no lost state
- [ ] Body text is readable without zooming (minimum 16px)
- [ ] No horizontal scrolling occurs at any standard mobile viewport
- [ ] Images and media scale proportionally within their containers
- [ ] Touch targets meet 48×48px cross-platform recommendation (Section 3.3)
- [ ] Notch, dynamic island, and rounded-corner safe areas do not clip interactive content
- [ ] Pull-to-refresh works where expected and does not interfere with vertical scroll
- [ ] Performance passes all thresholds when tested on a mid-tier device with the Lighthouse default throttling profile

---

## 8. Security Testing

### 8.1 OWASP Top 10 Coverage

Every test cycle must include checks for the OWASP Top 10 (2021 edition). Each item maps to specific test actions.

| Rank | Vulnerability | Mandatory Test Actions |
|------|-------------|----------------------|
| A01 | **Broken Access Control** | Attempt to access resources belonging to other users by manipulating IDs, tokens, or URLs. Verify role-based restrictions on every endpoint. Test horizontal and vertical privilege escalation. |
| A02 | **Cryptographic Failures** | Verify all traffic is HTTPS. Check that sensitive data (passwords, tokens, PII) is never logged, cached in plaintext, or visible in URLs. Verify TLS 1.2+ is enforced. |
| A03 | **Injection** | Test all inputs with SQL injection, XSS, and command injection payloads (Section 5.3). Verify parameterized queries and output encoding. Verify Content Security Policy (CSP) blocks inline scripts. |
| A04 | **Insecure Design** | Verify rate limiting on authentication endpoints. Verify CAPTCHA or equivalent on public forms. Verify account lockout after failed login attempts. Verify business logic abuse scenarios (e.g., applying a coupon twice). |
| A05 | **Security Misconfiguration** | Verify no default credentials. Verify error pages do not expose stack traces, framework versions, or server details. Verify unnecessary HTTP methods are disabled. Verify directory listing is disabled. |
| A06 | **Vulnerable Components** | Run `npm audit` / `pip audit` / equivalent. Verify no known CVEs in dependencies. Verify all components are on supported, patched versions. |
| A07 | **Authentication Failures** | Test weak passwords are rejected. Verify MFA works. Verify session tokens are invalidated on logout. Verify session IDs are not exposed in URLs. Test credential stuffing resistance. |
| A08 | **Software and Data Integrity Failures** | Verify Subresource Integrity (SRI) on all CDN-loaded scripts. Verify software updates are fetched over HTTPS with signature verification. |
| A09 | **Logging and Monitoring Failures** | Verify failed login attempts are logged. Verify security-relevant events generate alerts. Verify logs do not contain sensitive data (passwords, tokens, PII). |
| A10 | **Server-Side Request Forgery (SSRF)** | Test any feature that fetches external URLs (URL preview, webhook configuration, image import). Verify internal IP ranges (127.0.0.1, 10.x, 172.16.x, 192.168.x) are blocked. |

### 8.2 HTTP Security Headers

The following headers must be present on every response. Their absence is a defect.

| Header | Required Value | Purpose |
|--------|---------------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year |
| `Content-Security-Policy` | Site-specific policy; `default-src 'self'` minimum | Prevents XSS and data injection |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` | Prevents clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controls referrer leakage |
| `Permissions-Policy` | Restrict unused features (e.g., `camera=(), microphone=(), geolocation=()`) | Disables unnecessary browser APIs |
| `X-XSS-Protection` | `0` (CSP supersedes this; the legacy filter can introduce vulnerabilities) | Disable legacy XSS filter |

### 8.3 Cookie and Session Rules

| Rule | Requirement |
|------|-------------|
| `Secure` flag | **Mandatory** on all cookies in production. Cookies must never be transmitted over HTTP. |
| `HttpOnly` flag | **Mandatory** on session and authentication cookies. They must not be accessible via JavaScript. |
| `SameSite` attribute | Set to `Strict` or `Lax` on all cookies. `None` requires explicit justification. |
| Session timeout | Sessions must expire after a defined inactivity period (30 minutes maximum for sensitive applications). |
| Token rotation | Session tokens must be rotated after authentication and after privilege escalation. |
| Logout | Logout must invalidate the session server-side, not just clear the client cookie. |

---

## 9. SEO Validation

SEO is a QA concern because technical defects directly impact search visibility. The following checks are mandatory on every release.

#### Crawlability and Indexing

- `robots.txt` allows indexing of all important pages and blocks non-essential paths (admin, API, staging)
- XML sitemap exists, is valid, is auto-updated, and is submitted to Search Console
- Canonical tags are present on every page (self-referencing or pointing to the correct canonical)
- No unintentional `noindex` or `nofollow` meta tags on public pages
- JavaScript-rendered content is accessible to crawlers (test by rendering as Googlebot)
- Redirect chains do not exceed 2 hops
- No soft 404s (pages that return 200 but show "not found" content)

#### Metadata

| Element | Requirement |
|---------|-------------|
| `<title>` | Unique per page, 50–60 characters, descriptive |
| `<meta name="description">` | Unique per page, 150–160 characters, includes primary keyword |
| `<h1>` | Exactly one per page, matches the page topic |
| Heading hierarchy | Logical H1 → H2 → H3, no skipped levels |
| Image `alt` text | Present and descriptive on every content image |
| Open Graph tags | `og:title`, `og:description`, `og:image`, `og:url` on every page |
| Twitter Card tags | `twitter:card`, `twitter:title`, `twitter:description` on every page |

#### Technical Foundations

- HTTPS enforced site-wide with valid, non-expired SSL certificates
- `<html lang="...">` set correctly on every page
- Hreflang tags correct for multi-language sites
- URL structure is clean, lowercase, hyphen-separated, and does not contain excessive query parameters
- Structured data (Schema.org) validates with Google Rich Results Test

---

## 10. Image and Media Optimization

#### Format Selection

| Format | Use Case | Savings vs. JPEG |
|--------|----------|-----------------|
| **AVIF** | Photos, HDR images | 50%+ smaller |
| **WebP** | Default for all web images | 25–35% smaller |
| **JPEG** | Fallback for legacy browsers | Baseline |
| **PNG** | Transparency, screenshots, sharp edges | N/A (lossless) |
| **SVG** | Icons, logos, illustrations | N/A (vector) |

**Rule:** Serve images in AVIF with WebP fallback and JPEG as the final fallback using `<picture>` + `<source>` elements.

#### Compression Targets

| Image Category | Maximum File Size |
|---------------|------------------|
| Hero / banner images | 200 KB |
| Content images | 150 KB |
| Thumbnails | 50 KB |
| Icons (raster) | 10 KB |

Quality settings: JPEG/WebP 75–85%, AVIF 50–65%.

#### Mandatory Attributes

- Every `<img>` must have `width` and `height` attributes (prevents CLS)
- Every content image must have a descriptive `alt` attribute
- Decorative images must have `alt=""`
- Below-the-fold images must have `loading="lazy"`
- The LCP image must have `fetchpriority="high"` and must **never** have `loading="lazy"`
- Non-critical images must have `decoding="async"`

#### Responsive Images

- Provide `srcset` with at least 3 sizes: 640px, 1024px, 1920px
- Use `sizes` attribute that matches the actual CSS layout
- Art direction (different crops per viewport) uses `<picture>` with `<source media="...">`

---

## 11. Internationalization (i18n) Testing

If the application supports or plans to support multiple languages, every item below must be verified.

#### Character Encoding and Unicode

- [ ] UTF-8 encoding is set across the entire stack (HTML meta tag, database, API headers)
- [ ] Unicode characters render correctly: accented characters (éàüñ), CJK (你好), emoji (😀)
- [ ] Special characters in names do not break data processing (O'Brien, Müller)

#### Text Expansion and Contraction

- [ ] UI does not break when text expands by 30–200% (German is ~30% longer than English; some translations expand 200% for short strings)
- [ ] Buttons, labels, and navigation accommodate longer translations without overflow or truncation
- [ ] Test with pseudo-localization (e.g., `[!!Seettiinnggs!!]`) to detect hardcoded strings and layout issues

#### Right-to-Left (RTL) Layout

- [ ] Full layout mirrors correctly for Arabic, Hebrew, Farsi, Urdu
- [ ] Text alignment flips to right-aligned
- [ ] Directional icons (arrows, progress indicators) are mirrored
- [ ] Mixed content (RTL text with embedded LTR numbers/English) renders correctly
- [ ] CSS uses logical properties (`margin-inline-start`, not `margin-left`)

#### Date, Time, Number, and Currency

- [ ] Date format respects locale (MM/DD/YYYY vs. DD/MM/YYYY vs. YYYY-MM-DD)
- [ ] Time format respects 12-hour vs. 24-hour convention
- [ ] Number separators are locale-correct (1,000.50 vs. 1.000,50)
- [ ] Currency symbols are correctly placed (prefix vs. suffix, spacing)
- [ ] Currency precision is correct (JPY = 0 decimal places, USD/EUR = 2)

#### String Handling

- [ ] No hardcoded user-facing strings in code — all externalized to resource files
- [ ] No string concatenation for sentences (word order differs across languages)
- [ ] Pluralization is handled correctly (English has 2 forms; Arabic has 6)
- [ ] Sorting/collation respects locale rules
- [ ] Search handles diacritics (searching "cafe" finds "café")
- [ ] Timezone handling stores UTC and displays local

---

## 12. Privacy and Compliance Testing

### GDPR (EU/EEA/UK)

| Requirement | How to Test |
|-------------|------------|
| No non-essential cookies set before consent | Open the site in a clean browser. Before interacting with the cookie banner, verify zero non-essential cookies exist in DevTools → Application → Cookies. |
| Consent is opt-in, not opt-out | Verify all consent checkboxes start **unchecked**. Pre-checked boxes violate GDPR. |
| "Accept All" and "Reject All" are equally prominent | Both buttons must be the same size, color, and position hierarchy. A large "Accept" and a tiny text "Reject" link is non-compliant. |
| Granular category control | Users must be able to accept/reject cookies by category (analytics, marketing, functional). |
| Withdrawal is as easy as granting consent | Verify a persistent mechanism (footer link, settings page) to change or revoke consent. |
| Consent is recorded | Verify the platform logs consent transactions with timestamps. |
| Third-party scripts respect consent | Analytics, advertising, and social scripts load **only** after the user grants consent for that category. |

### CCPA/CPRA (California)

| Requirement | How to Test |
|-------------|------------|
| "Do Not Sell or Share My Personal Information" link | Verify the link is present and visible on every page. |
| Global Privacy Control (GPC) | Set `Sec-GPC: 1` header or enable GPC in the browser. Verify the site honors it as a valid opt-out. |
| Opt-out confirmation | After opting out, verify a visible confirmation message appears. Silent acceptance is no longer compliant (2026 requirement). |
| Right to Delete | Submit a deletion request and verify the user's data is removed within the required timeframe. |

### QA Regression Rules

- Test the cookie banner after **every deployment**. A banner disappearing for even a few days can trigger enforcement.
- Monthly audit of consent mechanisms recommended.
- Verify public-facing privacy disclosures match actual data processing behavior.

---

## 13. HTTP Status Code Verification

Every status code below must be explicitly tested where applicable. The application must return the correct code and the corresponding user-facing response.

### 2xx Success

| Code | Name | Verification |
|------|------|-------------|
| 200 | OK | Correct body and headers returned |
| 201 | Created | Returned after POST creates a resource; `Location` header points to the new resource |
| 204 | No Content | Returned after DELETE or PUT with no body; verify response body is empty |
| 206 | Partial Content | Range requests work for video streaming and large file downloads |

### 3xx Redirection

| Code | Name | Verification |
|------|------|-------------|
| 301 | Moved Permanently | Old URLs redirect; `Location` header set; SEO value transfers |
| 302 | Found | Temporary redirect preserves original URL for future requests |
| 304 | Not Modified | Caching works: subsequent requests with `If-Modified-Since` return 304 |
| 307 | Temporary Redirect | Like 302 but preserves HTTP method (POST stays POST) |
| 308 | Permanent Redirect | Like 301 but preserves HTTP method |

### 4xx Client Errors

| Code | Name | Verification |
|------|------|-------------|
| 400 | Bad Request | Error body explains what was malformed |
| 401 | Unauthorized | Redirects to login or returns structured auth error |
| 403 | Forbidden | Does not leak resource existence (same response whether resource exists or not) |
| 404 | Not Found | Custom 404 page meets the UX requirements in Section 4.4 |
| 405 | Method Not Allowed | Wrong HTTP methods are rejected (e.g., GET on a POST-only endpoint) |
| 409 | Conflict | Concurrent edit conflicts explained with resolution guidance |
| 413 | Content Too Large | File upload limit communicated to the user with the actual limit |
| 422 | Unprocessable Entity | Structured per-field validation errors returned |
| 429 | Too Many Requests | `Retry-After` header is set; UI shows "try again later" with timing |

### 5xx Server Errors

| Code | Name | Verification |
|------|------|-------------|
| 500 | Internal Server Error | Friendly error page shown; no stack traces or sensitive details exposed |
| 502 | Bad Gateway | Retry behavior works; user sees a clear message |
| 503 | Service Unavailable | `Retry-After` header present; maintenance page shown if applicable |
| 504 | Gateway Timeout | Timeout thresholds are appropriate; user messaging is clear |

### Rate Limiting Headers (Verify on All Rate-Limited Endpoints)

| Header | Purpose |
|--------|---------|
| `Retry-After` | Seconds until the client can retry |
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | UTC timestamp when the window resets |

---

## 14. Test Reporting and Exit Criteria

### Every Test Run Must Produce

1. **A machine-parseable result** — exit code 0 (pass) or non-zero (fail). No test tool may exit 0 when failures exist.
2. **A human-readable report** — listing every check performed, its status (PASS / FAIL / WARN / SKIP), and for failures, the specific metric value versus the threshold.
3. **Failure categorization** — every failure must be tagged:
   - **Blocker** — prevents release. Mapped to the hard rules in this document.
   - **Critical** — does not prevent release but must be fixed within 48 hours.
   - **Major** — must be fixed within the current sprint.
   - **Minor** — tracked and prioritized normally.

### Release Gate Criteria

A release is **blocked** if any of the following are true:

- [ ] Any Core Web Vital exceeds the "Poor" threshold (LCP > 4.0s, INP > 500ms, CLS > 0.25)
- [ ] Any WCAG 2.2 Level A or Level AA criterion fails
- [ ] Any OWASP Top 10 vulnerability is confirmed exploitable
- [ ] Any Tier 1 browser has a functional defect
- [ ] Visual regression diff exceeds 1% without approved baseline update
- [ ] Total page weight exceeds 5 MB
- [ ] API P99 latency exceeds 500ms
- [ ] TTFB exceeds 1,800ms
- [ ] Any security header in Section 8.2 is missing
- [ ] Non-essential cookies are set before user consent
- [ ] Any test tool exits 0 when failures exist (a meta-failure — the tooling itself is broken)

### Exception Process

When a threshold cannot be met before a release deadline:

1. The QA engineer files an exception with: the failing metric, the current value, the target value, the root cause, and a remediation plan.
2. The QA lead and the product owner both approve the exception in writing.
3. The exception has a maximum duration of **14 calendar days**.
4. The exception and its status are visible in the test report.
5. An expired exception with no remediation automatically becomes a release blocker for the next cycle.
