import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from scrapling.fetchers import DynamicFetcher

from scrapling_site_bridge import (
    add_item,
    attr_of,
    extract_skills_sh_public,
    text_of,
    unique_items,
)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


LOAD_MORE_LABELS = [
    "load more",
    "show more",
    "more results",
    "view more",
    "see more",
    "next page",
    "加载更多",
    "显示更多",
    "查看更多",
    "下一页",
]

DISCOVERABLE_PAGE_PREFIXES = (
    "/topic/",
    "/tag/",
    "/category/",
    "/collection/",
)

DISCOVERABLE_EXACT_PATHS = {
    "/",
    "/trending",
    "/hot",
    "/official",
    "/new",
    "/latest",
    "/popular",
}


def read_state(path):
    if not path:
        return {"seen": [], "runs": [], "pages": {}, "totals": {}}
    file_path = Path(path)
    if not file_path.exists():
        return {"seen": [], "runs": [], "pages": {}, "totals": {}}
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {"seen": [], "runs": [], "pages": {}, "totals": {}}
        data.setdefault("seen", [])
        data.setdefault("runs", [])
        data.setdefault("pages", {})
        data.setdefault("totals", {})
        return data
    except Exception:
        return {"seen": [], "runs": [], "pages": {}, "totals": {}}


def write_state(path, state):
    if not path:
        return
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def skill_key(item):
    source = str(item.get("source") or "").strip("/")
    skill_id = str(item.get("skillId") or "").strip("/")
    if source and skill_id:
        return f"{source}/{skill_id}"
    url = str(item.get("url") or item.get("detailUrl") or "")
    if "officialskills.sh" in url:
        parsed = urlparse(url)
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2:
            return "/".join(parts)
    return (item.get("title") or "").strip().lower()


def extract_visible_skill_links(page, base_url, items, limit):
    for link_node in page.css('a[href]')[: limit * 20]:
        href = attr_of(link_node, "href") or ""
        text = text_of(link_node)
        if not href:
            continue

        full_url = href
        if href.startswith("/"):
            full_url = f"https://www.skills.sh{href}"

        if "officialskills.sh" not in full_url and "/skills/" not in full_url:
            continue

        parsed = urlparse(full_url)
        parts = [part for part in parsed.path.split("/") if part]
        if "officialskills.sh" in full_url and len(parts) >= 2:
            source = "/".join(parts[:-1])
            skill_id = parts[-1]
        elif "/skills/" in full_url and parts:
            source = "skills.sh"
            skill_id = parts[-1]
        else:
            continue

        title = re.sub(r"\s+", " ", text or skill_id.replace("-", " ")).strip()
        if not title or title.lower() in {"skills", "official", "hot", "trending"}:
            continue

        add_item(
            items,
            base_url,
            title,
            full_url,
            "",
            {
                "parser": "skills-sh-browser-link",
                "name": title,
                "source": source,
                "skillId": skill_id,
                "detailUrl": full_url,
            },
        )
        if len(items) >= limit:
            break


def extract_discovered_pages(page, base_url, limit=500):
    discovered = []
    seen = set()
    base_host = urlparse(base_url).netloc or "www.skills.sh"

    for link_node in page.css("a[href]")[: limit * 10]:
        href = attr_of(link_node, "href") or ""
        if not href or href.startswith("#") or href.startswith("mailto:"):
            continue
        full_url = href
        if href.startswith("/"):
            full_url = f"https://{base_host}{href}"

        parsed = urlparse(full_url)
        if parsed.netloc and parsed.netloc not in {"www.skills.sh", "skills.sh"}:
            continue

        path = parsed.path.rstrip("/") or "/"
        if path not in DISCOVERABLE_EXACT_PATHS and not any(path.startswith(prefix) for prefix in DISCOVERABLE_PAGE_PREFIXES):
            continue

        normalized = f"https://www.skills.sh{path}"
        if normalized in seen:
            continue
        seen.add(normalized)
        discovered.append(
            {
                "url": normalized,
                "label": text_of(link_node)[:120],
                "path": path,
            }
        )
        if len(discovered) >= limit:
            break

    return discovered


def browser_action(args, telemetry):
    def action(page):
        page.wait_for_timeout(args.initial_wait_ms)
        last_height = 0
        last_count = 0
        stagnant = 0
        click_budget = args.max_clicks

        for index in range(args.scroll_steps):
            visible_count = page.locator('a[href*="officialskills.sh"], a[href*="/skills/"]').count()
            clicked_items = []
            if args.click_load_more and click_budget > 0:
                clicked_items = page.evaluate(
                    r"""
                    ({ labels, budget }) => {
                      const nodes = Array.from(document.querySelectorAll('button, [role="button"], a[aria-label*="more" i], a[aria-label*="next" i]'));
                      const clicked = [];
                      for (const node of nodes) {
                        if (clicked.length >= budget) break;
                        const text = (node.innerText || node.textContent || '').trim().toLowerCase();
                        const aria = (node.getAttribute('aria-label') || '').trim().toLowerCase();
                        const value = `${text} ${aria}`.trim();
                        const compact = value.replace(/\s+/g, ' ').trim();
                        const disabled = node.disabled || node.getAttribute('aria-disabled') === 'true';
                        const visible = !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
                        const looksLikeLoadControl = labels.some(label => compact === label || compact.startsWith(`${label} `) || compact.endsWith(` ${label}`));
                        const hasLongCardText = compact.length > 90;
                        if (!disabled && visible && !hasLongCardText && looksLikeLoadControl) {
                          node.scrollIntoView({ block: 'center', inline: 'center' });
                          node.click();
                          clicked.push(value.slice(0, 160) || node.tagName.toLowerCase());
                        }
                      }
                      return clicked;
                    }
                    """,
                    {"labels": LOAD_MORE_LABELS, "budget": click_budget},
                )
                click_budget -= len(clicked_items)
                if clicked_items:
                    page.wait_for_timeout(args.click_delay_ms)

            page.evaluate(
                """
                () => {
                  window.scrollBy({ top: Math.max(window.innerHeight * 1.4, 900), behavior: 'instant' });
                }
                """
            )
            page.wait_for_timeout(args.delay_ms)
            height = page.evaluate("() => document.documentElement.scrollHeight || document.body.scrollHeight || 0")

            telemetry["steps"].append(
                {
                    "step": index + 1,
                    "visibleSkillLinks": visible_count,
                    "clicked": len(clicked_items),
                    "clickedLabels": clicked_items[:6],
                    "height": height,
                }
            )

            if height == last_height and visible_count == last_count and len(clicked_items) == 0:
                stagnant += 1
            else:
                stagnant = 0

            last_height = height
            last_count = visible_count
            if stagnant >= args.stagnant_limit:
                break

        telemetry["clickBudgetRemaining"] = click_budget

    return action


def main():
    parser = argparse.ArgumentParser(description="Slow dynamic skills.sh crawler using Scrapling browser automation")
    parser.add_argument("--url", default="https://www.skills.sh/")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--scroll-steps", type=int, default=40)
    parser.add_argument("--delay-ms", type=int, default=900)
    parser.add_argument("--initial-wait-ms", type=int, default=1500)
    parser.add_argument("--stagnant-limit", type=int, default=5)
    parser.add_argument("--timeout-ms", type=int, default=90000)
    parser.add_argument("--state-file", default=".collector-state/skills-sh-browser.json")
    parser.add_argument("--max-clicks", type=int, default=24)
    parser.add_argument("--click-delay-ms", type=int, default=600)
    parser.add_argument("--discover-page-limit", type=int, default=500)
    parser.add_argument("--reset-state", action="store_true")
    parser.add_argument("--headful", action="store_true")
    parser.add_argument("--click-load-more", action="store_true")
    parser.add_argument("--include-seen", action="store_true")
    args = parser.parse_args()

    state = {"seen": [], "runs": [], "pages": {}, "totals": {}} if args.reset_state else read_state(args.state_file)
    seen = set(state.get("seen") or [])
    telemetry = {
        "mode": "dynamic-browser",
        "url": args.url,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "steps": [],
    }

    try:
        page = DynamicFetcher.fetch(
            args.url,
            headless=not args.headful,
            timeout=args.timeout_ms,
            wait=500,
            network_idle=True,
            disable_resources=True,
            block_ads=True,
            page_action=browser_action(args, telemetry),
        )
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc), "meta": telemetry}, ensure_ascii=False))
        sys.exit(1)

    items = []
    meta = {}
    extract_skills_sh_public(page, args.url, items, args.limit)
    meta.update(extract_skills_sh_public(page, args.url, [], args.limit))
    extract_visible_skill_links(page, args.url, items, args.limit)
    discovered_pages = extract_discovered_pages(page, args.url, args.discover_page_limit)

    deduped = unique_items(items)
    fresh_items = []
    fresh_count = 0
    replay_count = 0
    for item in deduped:
        key = skill_key(item)
        item["key"] = key
        already_seen = bool(key and key in seen)
        if args.include_seen or not already_seen:
            item["alreadySeen"] = already_seen
            fresh_items.append(item)
            if already_seen:
                replay_count += 1
            else:
                fresh_count += 1
        if key:
            seen.add(key)
        if len(fresh_items) >= args.limit:
            break

    telemetry.update(
        {
            "finishedAt": datetime.now(timezone.utc).isoformat(),
            "totalParsed": len(deduped),
            "emittedCount": len(fresh_items),
            "freshCount": fresh_count,
            "replayCount": replay_count,
            "seenCount": len(seen),
            "discoveredPageCount": len(discovered_pages),
            "discoveredPages": discovered_pages[:80],
            **meta,
        }
    )

    state["seen"] = sorted(seen)
    state["lastRunAt"] = telemetry["finishedAt"]
    state["lastSeenCount"] = len(seen)
    known_pages = {
        str(page.get("url"))
        for page in state.get("discoveredPages", [])
        if isinstance(page, dict) and page.get("url")
    }
    merged_discovered_pages = [
        page
        for page in state.get("discoveredPages", [])
        if isinstance(page, dict) and page.get("url")
    ]
    for page in discovered_pages:
        if page["url"] in known_pages:
            continue
        known_pages.add(page["url"])
        merged_discovered_pages.append(page)
    state["discoveredPages"] = merged_discovered_pages[-2000:]
    pages = state.get("pages") or {}
    pages[args.url] = {
        "lastRunAt": telemetry["finishedAt"],
        "totalParsed": telemetry["totalParsed"],
        "emittedCount": telemetry["emittedCount"],
        "freshCount": telemetry["freshCount"],
        "replayCount": telemetry["replayCount"],
        "seenCount": telemetry["seenCount"],
        "discoveredPageCount": telemetry["discoveredPageCount"],
        "totalSkills": telemetry.get("totalSkills"),
        "allTimeTotal": telemetry.get("allTimeTotal"),
    }
    state["pages"] = pages
    totals = state.get("totals") or {}
    for key in ("totalSkills", "allTimeTotal"):
        if telemetry.get(key):
            totals[key] = max(int(totals.get(key) or 0), int(telemetry[key]))
    state["totals"] = totals
    runs = state.get("runs") or []
    runs.append({k: v for k, v in telemetry.items() if k != "steps"})
    state["runs"] = runs[-30:]
    write_state(args.state_file, state)

    print(json.dumps({"ok": True, "url": args.url, "count": len(fresh_items), "items": fresh_items, "meta": telemetry}, ensure_ascii=False))


if __name__ == "__main__":
    main()
