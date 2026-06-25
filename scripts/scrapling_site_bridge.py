import argparse
import json
import re
import sys
from urllib.parse import urljoin

try:
    from scrapling.fetchers import Fetcher
except Exception as exc:
    print(json.dumps({"ok": False, "error": f"Scrapling import failed: {exc}"}))
    sys.exit(1)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def text_of(node):
    try:
        return re.sub(r"\s+", " ", node.text or "").strip()
    except Exception:
        return ""


def attr_of(node, name):
    try:
        return node.attrib.get(name)
    except Exception:
        return None


def unique_items(items):
    seen = set()
    result = []
    for item in items:
        key = (item.get("url") or "") + "::" + (item.get("title") or "").lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def iter_next_f_arrays(text):
    marker = "self.__next_f.push("
    start = 0
    while True:
        marker_index = text.find(marker, start)
        if marker_index == -1:
            break

        array_start = text.find("[", marker_index + len(marker))
        if array_start == -1:
            break

        depth = 0
        quote = None
        escaped = False
        for index in range(array_start, len(text)):
            char = text[index]
            if quote:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == quote:
                    quote = None
                continue

            if char in ('"', "'"):
                quote = char
            elif char == "[":
                depth += 1
            elif char == "]":
                depth -= 1
                if depth == 0:
                    yield text[array_start : index + 1]
                    start = index + 1
                    break
        else:
            break


def decode_next_f_text(page):
    chunks = []
    for script in page.css("script"):
        text = script.text or ""
        if "self.__next_f.push" not in text:
            continue
        for array_text in iter_next_f_arrays(text):
            try:
                payload = json.loads(array_text)
            except Exception:
                continue
            if not isinstance(payload, list):
                continue
            for part in payload:
                if isinstance(part, str):
                    chunks.append(part)
    return "".join(chunks), len(chunks)


def jsonish_field(text, key):
    pattern = r'"' + re.escape(key) + r'"\s*:\s*("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?)'
    match = re.search(pattern, text)
    if not match:
        return None
    raw = match.group(1)
    try:
        return json.loads(raw)
    except Exception:
        return raw.strip('"')


def iter_skills_sh_objects(text):
    pattern = re.compile(
        r'\{'
        r'[^{}]{0,900}?"source"\s*:\s*"(?P<source>(?:\\.|[^"\\]){2,220})"'
        r'[^{}]{0,900}?"skillId"\s*:\s*"(?P<skillId>(?:\\.|[^"\\]){1,220})"'
        r'[^{}]{0,900}?"name"\s*:\s*"(?P<name>(?:\\.|[^"\\]){1,260})"'
        r'(?P<rest>[^{}]{0,1800})\}',
        re.S,
    )
    for match in pattern.finditer(text):
        object_text = match.group(0)
        try:
            candidate = json.loads(object_text)
            if isinstance(candidate, dict):
                yield candidate
                continue
        except Exception:
            pass

        def group_value(name):
            try:
                return json.loads(f'"{match.group(name)}"')
            except Exception:
                return match.group(name)

        yield {
            "source": group_value("source"),
            "skillId": group_value("skillId"),
            "name": group_value("name"),
            "description": jsonish_field(object_text, "description"),
            "installs": jsonish_field(object_text, "installs"),
            "weeklyInstalls": jsonish_field(object_text, "weeklyInstalls"),
            "isOfficial": jsonish_field(object_text, "isOfficial"),
            "url": jsonish_field(object_text, "url"),
        }


def extract_skills_sh_public(page, base_url, items, limit):
    flight_text, chunk_count = decode_next_f_text(page)
    meta = {"nextFlightChunks": chunk_count}
    if not flight_text:
        return meta

    for key in ("totalSkills", "allTimeTotal"):
        match = re.search(r'"' + key + r'"\s*:\s*(\d+)', flight_text)
        if match:
            meta[key] = int(match.group(1))

    seen = set()
    for candidate in iter_skills_sh_objects(flight_text):
        if not isinstance(candidate, dict):
            continue

        source = str(candidate.get("source") or "").strip("/")
        skill_id = str(candidate.get("skillId") or "").strip("/")
        name = str(candidate.get("name") or candidate.get("title") or "").strip()
        description = str(candidate.get("description") or candidate.get("summary") or "").strip()
        if not source or not skill_id or not name:
            continue

        key = (source, skill_id, name.lower())
        if key in seen:
            continue
        seen.add(key)

        detail_url = candidate.get("url") or f"https://officialskills.sh/{source}/{skill_id}"
        add_item(
            items,
            base_url,
            name,
            detail_url,
            description,
            {
                "parser": "skills-sh-flight",
                "name": name,
                "source": source,
                "skillId": skill_id,
                "installs": candidate.get("installs"),
                "weeklyInstalls": candidate.get("weeklyInstalls"),
                "isOfficial": candidate.get("isOfficial"),
                "detailUrl": detail_url,
            },
        )

        if len(items) >= limit:
            break

    return meta


def add_item(items, base_url, title, link=None, summary="", extra=None):
    title = re.sub(r"\s+", " ", title or "").strip()
    summary = re.sub(r"\s+", " ", summary or "").strip()
    if not title or len(title) < 3:
        return
    if len(title) > 260:
        title = title[:260]
    items.append(
        {
            "title": title,
            "url": urljoin(base_url, link) if link else base_url,
            "summary": summary[:800],
            **(extra or {}),
        }
    )


def extract_jsonld(page, base_url, items, limit):
    for script in page.css('script[type="application/ld+json"]')[:30]:
        try:
            payload = json.loads(script.text or "{}")
        except Exception:
            continue
        nodes = payload if isinstance(payload, list) else [payload]
        for node in nodes:
            graph = node.get("@graph") if isinstance(node, dict) else None
            candidates = graph if isinstance(graph, list) else [node]
            for candidate in candidates:
                if not isinstance(candidate, dict):
                    continue
                title = candidate.get("name") or candidate.get("headline") or candidate.get("title")
                link = candidate.get("url")
                summary = candidate.get("description") or candidate.get("abstract") or ""
                if title:
                    add_item(items, base_url, title, link, summary, {"parser": "json-ld"})
                if len(items) >= limit:
                    return


def extract_next_data(page, base_url, items, limit):
    for script in page.css("script#__NEXT_DATA__")[:1]:
        try:
            payload = json.loads(script.text or "{}")
        except Exception:
            continue

        def walk(value):
            if len(items) >= limit:
                return
            if isinstance(value, dict):
                title = value.get("name") or value.get("title")
                summary = value.get("description") or value.get("summary") or value.get("excerpt") or ""
                link = value.get("url") or value.get("href") or value.get("slug")
                if title and isinstance(title, str):
                    add_item(items, base_url, title, link, summary, {"parser": "next-data"})
                for child in value.values():
                    walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)

        walk(payload)


def main():
    parser = argparse.ArgumentParser(description="Scrapling site-list extractor for AI Hub")
    parser.add_argument("--url", required=True)
    parser.add_argument("--item-selector", default="article, .post, .entry, .item, li, .card")
    parser.add_argument("--title-selector", default="h1, h2, h3, a")
    parser.add_argument("--link-selector", default="a")
    parser.add_argument("--summary-selector", default="p, .summary, .description, .excerpt")
    parser.add_argument("--link-keywords", default="skill,skills,template,templates,workflow,workflows,agent,plugin,plugins")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--skills-sh-public", action="store_true")
    args = parser.parse_args()

    page = Fetcher.get(args.url, stealthy_headers=True)
    items = []
    meta = {}

    extract_jsonld(page, args.url, items, args.limit)
    extract_next_data(page, args.url, items, args.limit)
    if args.skills_sh_public or "skills.sh" in args.url:
        meta.update(extract_skills_sh_public(page, args.url, items, args.limit))

    for node in page.css(args.item_selector)[: args.limit * 3]:
        title_node = next(iter(node.css(args.title_selector)), None)
        link_node = next(iter(node.css(args.link_selector)), None)
        summary_node = next(iter(node.css(args.summary_selector)), None)

        title = text_of(title_node) if title_node is not None else text_of(node)
        link = attr_of(link_node, "href") if link_node is not None else None
        summary = text_of(summary_node) if summary_node is not None else ""

        if not title or len(title) < 3:
            continue

        add_item(items, args.url, title, link, summary, {"parser": "selector"})

        if len(items) >= args.limit:
            break

    keywords = [item.strip().lower() for item in args.link_keywords.split(",") if item.strip()]
    for link_node in page.css("a[href]")[: args.limit * 10]:
        if len(items) >= args.limit:
            break
        href = attr_of(link_node, "href") or ""
        lower_href = href.lower()
        if keywords and not any(keyword in lower_href for keyword in keywords):
            continue
        title = text_of(link_node)
        if not title:
            continue
        add_item(items, args.url, title, href, "", {"parser": "link-scan"})

    items = unique_items(items)[: args.limit]
    print(json.dumps({"ok": True, "url": args.url, "count": len(items), "items": items, "meta": meta}, ensure_ascii=False))


if __name__ == "__main__":
    main()
