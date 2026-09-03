#!/usr/bin/env python3
"""Classify graph drift from a snapshot, or scan a vault through MCP reads.

Does not write. The only MCP tools this file may call are inspect_ontology,
search, and get.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from typing import Any

READ_TOOLS = frozenset({"inspect_ontology", "search", "get"})
RETIRED_IDENTITY_DATA_KEYS = ("living", "code", "origin", "link")
SEARCH_PAGE = 100
BUCKETS = (
    "missing_needed",
    "zero_edge",
    "dangling_refs",
    "retired_keys",
    "duplicate_titles",
)


def empty_report() -> dict[str, list[Any]]:
    return {name: [] for name in BUCKETS}


def _fields_of(type_row: dict[str, Any]) -> list[dict[str, Any]]:
    fields = type_row.get("fields")
    if not isinstance(fields, list):
        return []
    return [row for row in fields if isinstance(row, dict)]


def _data_of(record: dict[str, Any]) -> dict[str, Any]:
    data = record.get("data")
    if isinstance(data, dict):
        return data
    node = record.get("node")
    if isinstance(node, dict) and isinstance(node.get("data"), dict):
        return node["data"]
    return {}


def _record_id(record: dict[str, Any]) -> str:
    node = record.get("node")
    if isinstance(node, dict) and isinstance(node.get("id"), str):
        return node["id"]
    raw = record.get("id")
    return raw if isinstance(raw, str) else ""


def _record_type(record: dict[str, Any]) -> str:
    node = record.get("node")
    if isinstance(node, dict) and isinstance(node.get("type"), str):
        return node["type"]
    raw = record.get("type")
    return raw if isinstance(raw, str) else ""


def _record_title(record: dict[str, Any]) -> str:
    node = record.get("node")
    if isinstance(node, dict) and isinstance(node.get("title"), str):
        return node["title"]
    raw = record.get("title")
    return raw if isinstance(raw, str) else ""


def _edge_count(record: dict[str, Any]) -> int:
    edges = record.get("edges")
    if isinstance(edges, list):
        return len(edges)
    return 0


def _is_missing_needed(value: Any) -> bool:
    return value is None or value == ""


def classify(
    types: list[dict[str, Any]],
    records: list[dict[str, Any]],
    live_ids: set[str] | None = None,
) -> dict[str, list[Any]]:
    report = empty_report()
    by_slug = {
        row["slug"]: row
        for row in types
        if isinstance(row, dict) and isinstance(row.get("slug"), str)
    }
    live = set(live_ids) if live_ids is not None else set()
    if live_ids is None:
        for record in records:
            node_id = _record_id(record)
            if node_id:
                live.add(node_id)

    title_groups: dict[str, list[dict[str, str]]] = defaultdict(list)

    for record in records:
        node_id = _record_id(record)
        node_type = _record_type(record)
        title = _record_title(record)
        if not node_id:
            continue
        data = _data_of(record)
        type_row = by_slug.get(node_type, {})
        fields = _fields_of(type_row)

        missing = [
            str(field["name"])
            for field in fields
            if field.get("needed") is True
            and isinstance(field.get("name"), str)
            and _is_missing_needed(data.get(field["name"]))
        ]
        if missing:
            report["missing_needed"].append(
                {"id": node_id, "type": node_type, "title": title, "fields": missing}
            )

        if _edge_count(record) == 0:
            report["zero_edge"].append({"id": node_id, "type": node_type, "title": title})

        for field in fields:
            if field.get("kind") != "ref" or not isinstance(field.get("name"), str):
                continue
            value = data.get(field["name"])
            if not isinstance(value, str) or value == "":
                continue
            if value not in live:
                report["dangling_refs"].append(
                    {
                        "id": node_id,
                        "type": node_type,
                        "title": title,
                        "field": field["name"],
                        "target": value,
                    }
                )

        leftover = [key for key in RETIRED_IDENTITY_DATA_KEYS if key in data]
        if leftover:
            report["retired_keys"].append(
                {"id": node_id, "type": node_type, "title": title, "keys": leftover}
            )

        title_groups[title.casefold()].append(
            {"id": node_id, "type": node_type, "title": title}
        )

    for nodes in title_groups.values():
        if len(nodes) > 1:
            report["duplicate_titles"].append(
                {"title": nodes[0]["title"], "nodes": nodes}
            )

    for name in BUCKETS:
        report[name] = sorted(report[name], key=_sort_key)
    return report


def _sort_key(item: dict[str, Any]) -> tuple[str, ...]:
    if "nodes" in item:
        return (str(item.get("title", "")),)
    return (
        str(item.get("type", "")),
        str(item.get("title", "")),
        str(item.get("field", "")),
        str(item.get("id", "")),
    )


def parse_mcp_body(raw: str) -> dict[str, Any]:
    obj: Any = None
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        for line in raw.splitlines():
            if line.startswith("data:"):
                payload = line[5:].strip()
                if not payload:
                    continue
                obj = json.loads(payload)
                break
    if not isinstance(obj, dict):
        raise SystemExit("drift-read: MCP body is not JSON-RPC")
    if obj.get("error"):
        raise SystemExit("drift-read: MCP JSON-RPC error")
    result = obj.get("result")
    if not isinstance(result, dict):
        raise SystemExit("drift-read: MCP result missing")
    if result.get("isError"):
        text = ""
        content = result.get("content")
        if isinstance(content, list) and content and isinstance(content[0], dict):
            text = str(content[0].get("text") or "")
        raise SystemExit(f"drift-read: MCP tool error {text}".rstrip())
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        return structured
    content = result.get("content")
    if isinstance(content, list) and content and isinstance(content[0], dict):
        text = content[0].get("text")
        if isinstance(text, str) and text:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
    raise SystemExit("drift-read: MCP tool result has no object")


def mcp_call(url: str, key: str, name: str, arguments: dict[str, Any], req_id: int) -> dict[str, Any]:
    if name not in READ_TOOLS:
        raise SystemExit(f"drift-read: refused non-read tool {name}")
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
    ).encode()
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"ApiKey {key}",
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read().decode()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"drift-read: MCP HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"drift-read: MCP unreachable ({exc.reason})") from exc
    return parse_mcp_body(raw)


def page_search(url: str, key: str, type_slug: str, req_id: int) -> tuple[list[dict[str, Any]], int]:
    hits: list[dict[str, Any]] = []
    cursor: str | None = None
    last_id = req_id
    while True:
        arguments: dict[str, Any] = {"type": type_slug, "limit": SEARCH_PAGE}
        if cursor:
            arguments["cursor"] = cursor
        last_id += 1
        page = mcp_call(url, key, "search", arguments, last_id)
        nodes = page.get("nodes")
        if isinstance(nodes, list):
            hits.extend(row for row in nodes if isinstance(row, dict))
        next_cursor = page.get("next")
        if not isinstance(next_cursor, str) or not next_cursor:
            return hits, last_id
        cursor = next_cursor


def scan_vault(url: str, key: str) -> dict[str, list[Any]]:
    ontology = mcp_call(url, key, "inspect_ontology", {}, 1)
    types = ontology.get("types")
    if not isinstance(types, list):
        raise SystemExit("drift-read: inspect_ontology types missing")
    type_rows = [row for row in types if isinstance(row, dict) and isinstance(row.get("slug"), str)]
    hits: list[dict[str, Any]] = []
    req_id = 1
    for type_row in type_rows:
        page, req_id = page_search(url, key, str(type_row["slug"]), req_id)
        hits.extend(page)
    live_ids = {str(row["id"]) for row in hits if isinstance(row.get("id"), str)}
    records: list[dict[str, Any]] = []
    for hit in hits:
        node_id = hit.get("id")
        if not isinstance(node_id, str):
            continue
        req_id += 1
        got = mcp_call(url, key, "get", {"id": node_id}, req_id)
        records.append(got)
    return classify(type_rows, records, live_ids)


def load_key() -> str:
    raw = os.environ.get("FOUNDATION_API_KEY", "").strip()
    if raw:
        return raw
    raise SystemExit("drift-read: FOUNDATION_API_KEY is unset")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Report-only graph drift. Does not write.")
    parser.add_argument(
        "--classify-only",
        action="store_true",
        help="Classify a JSON snapshot from stdin. No MCP.",
    )
    parser.add_argument(
        "--mcp-url",
        default=os.environ.get("FOUNDATION_MCP_URL", "http://127.0.0.1:8787/mcp"),
    )
    args = parser.parse_args(argv)

    if args.classify_only:
        snapshot = json.load(sys.stdin)
        if not isinstance(snapshot, dict):
            raise SystemExit("drift-read: snapshot must be an object")
        types = snapshot.get("types") or []
        records = snapshot.get("records") or []
        live = snapshot.get("live_ids")
        live_ids = {str(item) for item in live} if isinstance(live, list) else None
        if not isinstance(types, list) or not isinstance(records, list):
            raise SystemExit("drift-read: snapshot types and records must be arrays")
        report = classify(types, records, live_ids)
    else:
        report = scan_vault(args.mcp_url, load_key())

    json.dump(report, sys.stdout, indent=2, sort_keys=False)
    sys.stdout.write("\n")
    if all(len(report[name]) == 0 for name in BUCKETS):
        sys.stderr.write("drift-read: quiet\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
