#!/usr/bin/env python3
"""
Link Checker — Crawls a website and reports broken links.

Finds all anchor tags on each page, follows internal links up to a configurable
depth, and reports any link that returns a non-2xx status code.

Usage:
    python link_checker.py https://example.com
    python link_checker.py https://example.com --depth 3 --timeout 10
"""

import argparse
import sys
import time
from collections import deque
from urllib.parse import urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit(
        "Missing dependencies. Install them with:\n"
        "  pip install requests beautifulsoup4"
    )


def crawl(start_url: str, max_depth: int, timeout: int) -> list[dict]:
    """Crawl *start_url* up to *max_depth* levels and return a list of link results."""
    parsed_start = urlparse(start_url)
    base_domain = parsed_start.netloc

    visited: set[str] = set()
    results: list[dict] = []
    queue: deque[tuple[str, str, int]] = deque()  # (url, source_page, depth)
    queue.append((start_url, "entrypoint", 0))

    session = requests.Session()
    session.headers.update({"User-Agent": "srishti-qa-link-checker/1.0"})

    while queue:
        url, source, depth = queue.popleft()
        if url in visited:
            continue
        visited.add(url)

        try:
            resp = session.get(url, timeout=timeout, allow_redirects=True)
            status = resp.status_code
        except requests.RequestException as exc:
            results.append(
                {"url": url, "source": source, "status": "ERROR", "detail": str(exc)}
            )
            continue

        results.append({"url": url, "source": source, "status": status, "detail": ""})

        # Only parse HTML pages that belong to the target domain
        is_internal = urlparse(url).netloc == base_domain
        is_html = "text/html" in resp.headers.get("Content-Type", "")
        if is_internal and is_html and depth < max_depth:
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup.find_all("a", href=True):
                href = tag["href"].strip()
                if href.startswith(("mailto:", "tel:", "javascript:", "#")):
                    continue
                absolute = urljoin(url, href)
                # Strip fragments
                absolute = absolute.split("#")[0]
                if absolute not in visited:
                    queue.append((absolute, url, depth + 1))

    return results


def print_report(results: list[dict]) -> None:
    broken = [r for r in results if r["status"] != 200]
    ok = [r for r in results if r["status"] == 200]

    print(f"\n{'='*60}")
    print(f"  Link Check Report")
    print(f"{'='*60}")
    print(f"  Total links checked : {len(results)}")
    print(f"  OK (200)            : {len(ok)}")
    print(f"  Broken / Errors     : {len(broken)}")
    print(f"{'='*60}\n")

    if broken:
        print("Broken links:\n")
        for r in broken:
            detail = f" — {r['detail']}" if r["detail"] else ""
            print(f"  [{r['status']}] {r['url']}")
            print(f"        found on: {r['source']}{detail}\n")
    else:
        print("No broken links found.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Check a website for broken links.")
    parser.add_argument("url", help="The starting URL to crawl")
    parser.add_argument(
        "--depth",
        type=int,
        default=2,
        help="Maximum crawl depth for internal links (default: 2)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=8,
        help="HTTP request timeout in seconds (default: 8)",
    )
    args = parser.parse_args()

    print(f"Crawling {args.url} (depth={args.depth}) ...")
    start = time.monotonic()
    results = crawl(args.url, args.depth, args.timeout)
    elapsed = time.monotonic() - start

    print_report(results)
    print(f"Completed in {elapsed:.1f}s")

    # Exit with non-zero status if any links are broken
    if any(r["status"] != 200 for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
