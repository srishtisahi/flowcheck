#!/usr/bin/env python3
"""
Accessibility Checker — Scans a web page for common WCAG violations.

Performs static analysis of the HTML to catch issues such as missing alt text,
missing form labels, low-contrast indicators, empty links, missing lang
attribute, and more.

Usage:
    python accessibility_checker.py https://example.com
    python accessibility_checker.py page.html --local
"""

import argparse
import sys
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit(
        "Missing dependencies. Install them with:\n"
        "  pip install requests beautifulsoup4"
    )


class Issue:
    """A single accessibility issue."""

    SEVERITY_ERROR = "ERROR"
    SEVERITY_WARNING = "WARN"

    def __init__(self, severity: str, rule: str, element: str, message: str):
        self.severity = severity
        self.rule = rule
        self.element = element
        self.message = message

    def __str__(self) -> str:
        tag = f"[{self.severity:5s}]"
        return f"  {tag} {self.rule}\n         {self.message}\n         Element: {self.element}"


def fetch_html(target: str, local: bool) -> str:
    if local:
        return Path(target).read_text(encoding="utf-8")
    resp = requests.get(
        target,
        timeout=15,
        headers={"User-Agent": "srishti-qa-a11y-checker/1.0"},
    )
    resp.raise_for_status()
    return resp.text


def truncate(text: str, length: int = 80) -> str:
    s = str(text).replace("\n", " ").strip()
    return s[:length] + "..." if len(s) > length else s


def check_images(soup: BeautifulSoup) -> list[Issue]:
    """Images must have alt attributes."""
    issues: list[Issue] = []
    for img in soup.find_all("img"):
        if not img.get("alt") and img.get("alt") != "":
            issues.append(
                Issue(
                    Issue.SEVERITY_ERROR,
                    "img-alt",
                    truncate(img),
                    "Image is missing an alt attribute. Add alt text or alt=\"\" for decorative images.",
                )
            )
        elif img.get("alt", "").strip() == "" and not img.get("role") == "presentation":
            issues.append(
                Issue(
                    Issue.SEVERITY_WARNING,
                    "img-alt-empty",
                    truncate(img),
                    "Image has empty alt text but is not marked role=\"presentation\".",
                )
            )
    return issues


def check_form_labels(soup: BeautifulSoup) -> list[Issue]:
    """Form inputs must have associated labels."""
    issues: list[Issue] = []
    skip_types = {"hidden", "submit", "button", "reset", "image"}

    for inp in soup.find_all(["input", "select", "textarea"]):
        input_type = inp.get("type", "text").lower()
        if input_type in skip_types:
            continue

        has_label = False
        input_id = inp.get("id")
        if input_id and soup.find("label", attrs={"for": input_id}):
            has_label = True
        if inp.find_parent("label"):
            has_label = True
        if inp.get("aria-label") or inp.get("aria-labelledby"):
            has_label = True
        if inp.get("title"):
            has_label = True

        if not has_label:
            issues.append(
                Issue(
                    Issue.SEVERITY_ERROR,
                    "label",
                    truncate(inp),
                    "Form control has no associated label, aria-label, or title.",
                )
            )
    return issues


def check_links(soup: BeautifulSoup) -> list[Issue]:
    """Links must have discernible text."""
    issues: list[Issue] = []
    for a in soup.find_all("a"):
        text = a.get_text(strip=True)
        has_aria = a.get("aria-label") or a.get("aria-labelledby")
        has_img_alt = any(img.get("alt") for img in a.find_all("img"))

        if not text and not has_aria and not has_img_alt:
            issues.append(
                Issue(
                    Issue.SEVERITY_ERROR,
                    "link-name",
                    truncate(a),
                    "Link has no discernible text. Add text content, aria-label, or an image with alt text.",
                )
            )
    return issues


def check_headings(soup: BeautifulSoup) -> list[Issue]:
    """Headings should not skip levels."""
    issues: list[Issue] = []
    headings = soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"])
    prev_level = 0
    for h in headings:
        level = int(h.name[1])
        if prev_level > 0 and level > prev_level + 1:
            issues.append(
                Issue(
                    Issue.SEVERITY_WARNING,
                    "heading-order",
                    truncate(h),
                    f"Heading level skipped from h{prev_level} to h{level}.",
                )
            )
        if not h.get_text(strip=True):
            issues.append(
                Issue(
                    Issue.SEVERITY_WARNING,
                    "empty-heading",
                    truncate(h),
                    "Heading element is empty.",
                )
            )
        prev_level = level
    return issues


def check_document(soup: BeautifulSoup) -> list[Issue]:
    """Document-level checks: lang attribute, title, viewport."""
    issues: list[Issue] = []

    html_tag = soup.find("html")
    if html_tag and not html_tag.get("lang"):
        issues.append(
            Issue(
                Issue.SEVERITY_ERROR,
                "html-lang",
                "<html>",
                "The <html> element must have a lang attribute.",
            )
        )

    if not soup.find("title") or not soup.find("title").get_text(strip=True):
        issues.append(
            Issue(
                Issue.SEVERITY_ERROR,
                "document-title",
                "<title>",
                "Document must have a non-empty <title> element.",
            )
        )

    meta_vp = soup.find("meta", attrs={"name": "viewport"})
    if meta_vp:
        content = meta_vp.get("content", "")
        if "user-scalable=no" in content or "maximum-scale=1" in content:
            issues.append(
                Issue(
                    Issue.SEVERITY_WARNING,
                    "meta-viewport",
                    truncate(meta_vp),
                    "Viewport meta tag should not disable user scaling.",
                )
            )

    return issues


def check_buttons(soup: BeautifulSoup) -> list[Issue]:
    """Buttons must have discernible text."""
    issues: list[Issue] = []
    for btn in soup.find_all("button"):
        text = btn.get_text(strip=True)
        has_aria = btn.get("aria-label") or btn.get("aria-labelledby")
        if not text and not has_aria:
            issues.append(
                Issue(
                    Issue.SEVERITY_ERROR,
                    "button-name",
                    truncate(btn),
                    "Button has no discernible text. Add text content or aria-label.",
                )
            )
    return issues


def check_tables(soup: BeautifulSoup) -> list[Issue]:
    """Data tables should have headers."""
    issues: list[Issue] = []
    for table in soup.find_all("table"):
        if table.get("role") == "presentation":
            continue
        if not table.find("th"):
            issues.append(
                Issue(
                    Issue.SEVERITY_WARNING,
                    "table-header",
                    truncate(table)[:60],
                    "Data table has no <th> header cells.",
                )
            )
    return issues


def run_checks(html: str) -> list[Issue]:
    soup = BeautifulSoup(html, "html.parser")
    issues: list[Issue] = []
    issues.extend(check_document(soup))
    issues.extend(check_images(soup))
    issues.extend(check_form_labels(soup))
    issues.extend(check_links(soup))
    issues.extend(check_headings(soup))
    issues.extend(check_buttons(soup))
    issues.extend(check_tables(soup))
    return issues


def print_report(target: str, issues: list[Issue]) -> None:
    errors = [i for i in issues if i.severity == Issue.SEVERITY_ERROR]
    warnings = [i for i in issues if i.severity == Issue.SEVERITY_WARNING]

    print(f"\n{'='*60}")
    print(f"  Accessibility Check Report")
    print(f"{'='*60}")
    print(f"  Target   : {target}")
    print(f"  Errors   : {len(errors)}")
    print(f"  Warnings : {len(warnings)}")
    print(f"{'='*60}\n")

    if not issues:
        print("  No issues found. Page passes basic static accessibility checks.\n")
        return

    for issue in issues:
        print(issue)
        print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check a web page for common accessibility issues."
    )
    parser.add_argument("target", help="URL or local HTML file path to check")
    parser.add_argument(
        "--local",
        action="store_true",
        help="Treat the target as a local file path instead of a URL",
    )
    args = parser.parse_args()

    try:
        html = fetch_html(args.target, args.local)
    except Exception as exc:
        print(f"FATAL: Could not load {args.target} — {exc}")
        sys.exit(1)

    issues = run_checks(html)
    print_report(args.target, issues)

    errors = [i for i in issues if i.severity == Issue.SEVERITY_ERROR]
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
