#!/usr/bin/env python3
"""
Performance Audit — Measures key web performance metrics for a URL.

Checks response time, page size, number of resources, and basic Web Vitals
proxy metrics by parsing the HTML and its linked resources.

Usage:
    python performance_audit.py https://example.com
    python performance_audit.py https://example.com --threshold 3.0
"""

import argparse
import sys
import time
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit(
        "Missing dependencies. Install them with:\n"
        "  pip install requests beautifulsoup4"
    )


def measure_ttfb(url: str, timeout: int) -> tuple[requests.Response, float]:
    """Return the response and the Time-To-First-Byte in seconds."""
    start = time.monotonic()
    resp = requests.get(
        url,
        timeout=timeout,
        headers={"User-Agent": "srishti-qa-perf-audit/1.0"},
    )
    ttfb = time.monotonic() - start
    return resp, ttfb


def collect_resource_urls(html: str, base_url: str) -> dict[str, list[str]]:
    """Extract external resource URLs from HTML grouped by type."""
    soup = BeautifulSoup(html, "html.parser")
    resources: dict[str, list[str]] = {
        "stylesheets": [],
        "scripts": [],
        "images": [],
        "fonts": [],
        "other": [],
    }

    for link in soup.find_all("link", rel="stylesheet"):
        href = link.get("href")
        if href:
            resources["stylesheets"].append(urljoin(base_url, href))

    for script in soup.find_all("script", src=True):
        resources["scripts"].append(urljoin(base_url, script["src"]))

    for img in soup.find_all("img", src=True):
        resources["images"].append(urljoin(base_url, img["src"]))

    for link in soup.find_all("link"):
        href = link.get("href", "")
        if "font" in link.get("rel", [""]) or href.endswith(
            (".woff", ".woff2", ".ttf", ".otf")
        ):
            resources["fonts"].append(urljoin(base_url, href))

    return resources


def measure_resources(resources: dict[str, list[str]], timeout: int) -> dict:
    """Fetch each resource and collect size / timing data."""
    total_size = 0
    total_count = 0
    slowest = ("", 0.0)
    largest = ("", 0)
    errors: list[str] = []

    session = requests.Session()
    session.headers.update({"User-Agent": "srishti-qa-perf-audit/1.0"})

    for category, urls in resources.items():
        for url in urls:
            total_count += 1
            try:
                start = time.monotonic()
                resp = session.get(url, timeout=timeout)
                elapsed = time.monotonic() - start
                size = len(resp.content)
                total_size += size
                if elapsed > slowest[1]:
                    slowest = (url, elapsed)
                if size > largest[1]:
                    largest = (url, size)
            except requests.RequestException as exc:
                errors.append(f"{url} — {exc}")

    return {
        "total_count": total_count,
        "total_size_bytes": total_size,
        "slowest_resource": slowest,
        "largest_resource": largest,
        "errors": errors,
    }


def human_size(nbytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if nbytes < 1024:
            return f"{nbytes:.1f} {unit}"
        nbytes /= 1024
    return f"{nbytes:.1f} TB"


def run_audit(url: str, timeout: int, threshold: float) -> bool:
    """Run the full audit and return True if all checks pass."""
    print(f"\nAuditing {url} ...\n")

    # 1. TTFB
    try:
        resp, ttfb = measure_ttfb(url, timeout)
    except requests.RequestException as exc:
        print(f"FATAL: Could not fetch {url} — {exc}")
        return False

    page_size = len(resp.content)

    # 2. Resources
    resources = collect_resource_urls(resp.text, url)
    res_stats = measure_resources(resources, timeout)

    total_weight = page_size + res_stats["total_size_bytes"]

    # 3. Report
    passed = True

    print(f"{'='*60}")
    print(f"  Performance Audit Report")
    print(f"{'='*60}")
    print(f"  URL                   : {url}")
    print(f"  HTTP Status           : {resp.status_code}")
    print(f"  Time-To-First-Byte    : {ttfb:.3f}s", end="")
    if ttfb > threshold:
        print(f"  [FAIL > {threshold}s]")
        passed = False
    else:
        print(f"  [PASS]")

    print(f"  HTML Document Size    : {human_size(page_size)}")
    print(f"  Total Resources       : {res_stats['total_count']}")
    print(f"  Total Page Weight     : {human_size(total_weight)}", end="")
    if total_weight > 5 * 1024 * 1024:
        print("  [WARN > 5 MB]")
    else:
        print()

    print(f"\n  Resource Breakdown:")
    for cat, urls in resources.items():
        if urls:
            print(f"    {cat:15s}: {len(urls)}")

    if res_stats["slowest_resource"][0]:
        name = urlparse(res_stats["slowest_resource"][0]).path.split("/")[-1] or "/"
        print(f"\n  Slowest resource      : {name} ({res_stats['slowest_resource'][1]:.3f}s)")
    if res_stats["largest_resource"][0]:
        name = urlparse(res_stats["largest_resource"][0]).path.split("/")[-1] or "/"
        print(f"  Largest resource      : {name} ({human_size(res_stats['largest_resource'][1])})")

    if res_stats["errors"]:
        print(f"\n  Resource Errors ({len(res_stats['errors'])}):")
        for err in res_stats["errors"]:
            print(f"    - {err}")
        passed = False

    print(f"\n{'='*60}")
    print(f"  Result: {'PASS' if passed else 'FAIL'}")
    print(f"{'='*60}\n")

    return passed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a performance audit on a web page."
    )
    parser.add_argument("url", help="URL to audit")
    parser.add_argument(
        "--threshold",
        type=float,
        default=3.0,
        help="Maximum acceptable TTFB in seconds (default: 3.0)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=15,
        help="HTTP request timeout in seconds (default: 15)",
    )
    args = parser.parse_args()

    passed = run_audit(args.url, args.timeout, args.threshold)
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
