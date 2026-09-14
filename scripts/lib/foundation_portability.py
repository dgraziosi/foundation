#!/usr/bin/env python3
"""One-shot vault export and import over localhost MCP.

Host scripts call this file. It is not an MCP tool. tools/list stays 16.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
import zipfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SEARCH_PAGE = 100
EXPORT_VERSION = 1
ADAPTERS = ("obsidian", "notion", "apple-notes", "google-tasks")
SCALAR_KINDS = frozenset({"string", "date", "number", "enum"})
READ_TOOLS = frozenset({"inspect_ontology", "search", "get"})
WRITE_TOOLS = frozenset({"upsert"})
ALLOWED_TOOLS = READ_TOOLS | WRITE_TOOLS
DAILY_NOTE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")
ISO_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")
SECRET_KEY_RE = re.compile(r"(api_?key|secret|token|password|authorization)", re.I)
SKIP_DIR_NAMES = frozenset({".obsidian", ".trash", ".git", "__macosx", "node_modules"})
NOTE_SUFFIXES = (".md", ".markdown", ".html", ".htm")
HTML_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
HTML_H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")
FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?(.*)\Z", re.S)


@dataclass
class ImportDraft:
    adapter: str
    source_ref: str
    type: str
    title: str
    body: str = ""
    status: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""

    def __post_init__(self) -> None:
        if not self.idempotency_key:
            self.idempotency_key = make_idempotency_key(self.adapter, self.source_ref)


def make_idempotency_key(adapter: str, source_ref: str) -> str:
    digest = hashlib.sha256(f"{adapter}:{source_ref}".encode()).hexdigest()[:32]
    return f"imp:{adapter}:{digest}"


def redact_mapping(value: Any) -> Any:
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            if SECRET_KEY_RE.search(str(key)):
                continue
            out[str(key)] = redact_mapping(item)
        return out
    if isinstance(value, list):
        return [redact_mapping(item) for item in value]
    return value


def sanitize_payload(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    media_type = payload.get("media_type")
    storage = payload.get("storage")
    out: dict[str, Any] = {}
    if isinstance(media_type, str):
        out["media_type"] = media_type
    if isinstance(storage, str):
        out["storage"] = storage
    if storage == "blob":
        blob_id = payload.get("blob_id")
        if isinstance(blob_id, str):
            out["blob_id"] = blob_id
        relative = payload.get("relative_path") or payload.get("path")
        if isinstance(relative, str):
            out["path"] = relative
        return out
    body = payload.get("body")
    if isinstance(body, str):
        out["body"] = body
    return out


def scalar_field_names(type_row: dict[str, Any]) -> list[str]:
    fields = type_row.get("fields")
    if not isinstance(fields, list):
        return []
    names: list[str] = []
    for row in fields:
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        kind = row.get("kind")
        if isinstance(name, str) and kind in SCALAR_KINDS:
            names.append(name)
    return names


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
        raise SystemExit("foundation-portability: MCP body is not JSON-RPC")
    if obj.get("error"):
        raise SystemExit("foundation-portability: MCP JSON-RPC error")
    result = obj.get("result")
    if not isinstance(result, dict):
        raise SystemExit("foundation-portability: MCP result missing")
    if result.get("isError"):
        text = ""
        content = result.get("content")
        if isinstance(content, list) and content and isinstance(content[0], dict):
            text = str(content[0].get("text") or "")
        raise SystemExit(f"foundation-portability: MCP tool error {text}".rstrip())
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
    raise SystemExit("foundation-portability: MCP tool result has no object")


def mcp_call(url: str, key: str, name: str, arguments: dict[str, Any], req_id: int) -> dict[str, Any]:
    if name not in ALLOWED_TOOLS:
        raise SystemExit(f"foundation-portability: refused tool {name}")
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
        raise SystemExit(f"foundation-portability: MCP HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"foundation-portability: MCP unreachable ({exc.reason})") from exc
    return parse_mcp_body(raw)


def mcp_list_tools(url: str, key: str) -> list[str]:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}).encode()
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
        raise SystemExit(f"foundation-portability: MCP HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"foundation-portability: MCP unreachable ({exc.reason})") from exc
    obj: Any = None
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        for line in raw.splitlines():
            if line.startswith("data:"):
                obj = json.loads(line[5:].strip())
                break
    if not isinstance(obj, dict) or obj.get("error"):
        raise SystemExit("foundation-portability: tools/list failed")
    result = obj.get("result")
    if not isinstance(result, dict):
        raise SystemExit("foundation-portability: tools/list result missing")
    tools = result.get("tools")
    if not isinstance(tools, list):
        return []
    names: list[str] = []
    for row in tools:
        if isinstance(row, dict) and isinstance(row.get("name"), str):
            names.append(row["name"])
    return names


def load_key() -> str:
    raw = os.environ.get("FOUNDATION_API_KEY", "").strip()
    if raw:
        return raw
    raise SystemExit("foundation-portability: FOUNDATION_API_KEY is unset")


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


def collect_snapshot(url: str, key: str) -> dict[str, Any]:
    ontology = mcp_call(url, key, "inspect_ontology", {}, 1)
    types = ontology.get("types")
    relations = ontology.get("relations")
    if not isinstance(types, list):
        raise SystemExit("foundation-portability: inspect_ontology types missing")
    type_rows = [row for row in types if isinstance(row, dict) and isinstance(row.get("slug"), str)]
    req_id = 1
    nodes: list[dict[str, Any]] = []
    edges_by_id: dict[str, dict[str, Any]] = {}
    for type_row in type_rows:
        hits, req_id = page_search(url, key, str(type_row["slug"]), req_id)
        for hit in hits:
            node_id = hit.get("id")
            if not isinstance(node_id, str):
                continue
            req_id += 1
            got = mcp_call(url, key, "get", {"id": node_id}, req_id)
            record = got.get("node") if isinstance(got.get("node"), dict) else got
            if not isinstance(record, dict):
                continue
            payload = sanitize_payload(record.get("payload"))
            nodes.append(
                {
                    "id": record.get("id"),
                    "type": record.get("type"),
                    "title": record.get("title"),
                    "status": record.get("status"),
                    "data": redact_mapping(record.get("data") or {}),
                    "payload": payload,
                    "created_at": record.get("created_at"),
                    "updated_at": record.get("updated_at"),
                }
            )
            incident = got.get("edges")
            if not isinstance(incident, list):
                continue
            for edge in incident:
                if not isinstance(edge, dict):
                    continue
                edge_id = edge.get("id")
                relation = edge.get("relation_type")
                from_id = edge.get("from_id")
                to_id = edge.get("to_id")
                if not isinstance(edge_id, str) or not isinstance(relation, str):
                    continue
                if not isinstance(from_id, str) or not isinstance(to_id, str):
                    continue
                edges_by_id[edge_id] = {
                    "id": edge_id,
                    "relation_type": relation,
                    "from_id": from_id,
                    "to_id": to_id,
                }
    ontology_ctx = {
        "types": [
            {
                "slug": row.get("slug"),
                "label": row.get("label"),
                "fields": row.get("fields") or [],
            }
            for row in type_rows
        ],
        "relations": [
            {"slug": row.get("slug"), "kind": row.get("kind")}
            for row in (relations if isinstance(relations, list) else [])
            if isinstance(row, dict)
        ],
    }
    return {
        "format": "foundation-export",
        "version": EXPORT_VERSION,
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "include_deleted": False,
        "page_size": SEARCH_PAGE,
        "ontology": ontology_ctx,
        "nodes": nodes,
        "edges": list(edges_by_id.values()),
    }


def safe_filename(title: str, node_id: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")
    short = node_id.replace("-", "")[:8] if node_id else "node"
    if not slug:
        return f"{short}.md"
    return f"{slug[:60]}-{short}.md"


def yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    text = str(value)
    if text == "" or re.search(r"[:#\n\"']", text) or text[:1] in " -":
        return json.dumps(text)
    return text


def markdown_for_node(node: dict[str, Any], scalar_names: list[str]) -> str:
    lines = ["---"]
    for key in ("id", "status", "updated_at"):
        raw = node.get(key)
        if raw is not None:
            lines.append(f"{key}: {yaml_scalar(raw)}")
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    for name in scalar_names:
        if name in data:
            lines.append(f"{name}: {yaml_scalar(data[name])}")
    payload = node.get("payload") if isinstance(node.get("payload"), dict) else {}
    if payload.get("storage") == "blob":
        if payload.get("blob_id"):
            lines.append(f"blob_id: {yaml_scalar(payload['blob_id'])}")
        if payload.get("path"):
            lines.append(f"blob_path: {yaml_scalar(payload['path'])}")
        if payload.get("media_type"):
            lines.append(f"media_type: {yaml_scalar(payload['media_type'])}")
        lines.append("storage: blob")
    lines.append("---")
    title = str(node.get("title") or "Untitled")
    lines.append(f"# {title}")
    body = ""
    if payload.get("storage") != "blob" and isinstance(payload.get("body"), str):
        body = payload["body"]
    if body:
        lines.append("")
        lines.append(body.rstrip())
    lines.append("")
    return "\n".join(lines)


def write_export(snapshot: dict[str, Any], out_dir: Path, formats: set[str]) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    types = snapshot.get("ontology", {}).get("types") if isinstance(snapshot.get("ontology"), dict) else []
    type_rows = [row for row in types if isinstance(row, dict)] if isinstance(types, list) else []
    by_slug = {str(row["slug"]): row for row in type_rows if isinstance(row.get("slug"), str)}
    nodes = [row for row in snapshot.get("nodes", []) if isinstance(row, dict)]
    written: dict[str, Any] = {"out": str(out_dir), "formats": sorted(formats)}
    if "json" in formats:
        path = out_dir / "foundation.json"
        path.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
        written["json"] = str(path)
    if "markdown" in formats:
        md_root = out_dir / "markdown"
        count = 0
        for node in nodes:
            slug = str(node.get("type") or "unknown")
            folder = md_root / slug
            folder.mkdir(parents=True, exist_ok=True)
            scalars = scalar_field_names(by_slug.get(slug, {}))
            name = safe_filename(str(node.get("title") or ""), str(node.get("id") or ""))
            (folder / name).write_text(markdown_for_node(node, scalars), encoding="utf-8")
            count += 1
        written["markdown_files"] = count
        written["markdown"] = str(md_root)
    if "csv" in formats:
        csv_root = out_dir / "csv"
        csv_root.mkdir(parents=True, exist_ok=True)
        grouped: dict[str, list[dict[str, Any]]] = {}
        for node in nodes:
            grouped.setdefault(str(node.get("type") or "unknown"), []).append(node)
        csv_files: list[str] = []
        for slug, rows in grouped.items():
            scalars = scalar_field_names(by_slug.get(slug, {}))
            header = ["id", "title", "status", "updated_at", *scalars]
            path = csv_root / f"{slug}.csv"
            with path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=header, extrasaction="ignore")
                writer.writeheader()
                for node in rows:
                    data = node.get("data") if isinstance(node.get("data"), dict) else {}
                    row = {
                        "id": node.get("id") or "",
                        "title": node.get("title") or "",
                        "status": node.get("status") or "",
                        "updated_at": node.get("updated_at") or "",
                    }
                    for name in scalars:
                        value = data.get(name)
                        row[name] = "" if value is None else value
                    writer.writerow(row)
            csv_files.append(str(path))
        written["csv"] = csv_files
    return written


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    raw_meta, body = match.group(1), match.group(2)
    meta: dict[str, Any] = {}
    for line in raw_meta.splitlines():
        if ":" not in line or line.startswith("#"):
            continue
        key, value = line.split(":", 1)
        name = key.strip()
        if not name or not re.match(r"^[A-Za-z][A-Za-z0-9_]*$", name):
            continue
        item = value.strip()
        if item in ("", "null", "~"):
            continue
        if item in ("true", "false"):
            meta[name] = item == "true"
            continue
        if re.fullmatch(r"-?\d+", item):
            meta[name] = int(item)
            continue
        if re.fullmatch(r"-?\d+\.\d+", item):
            meta[name] = float(item)
            continue
        if (item.startswith('"') and item.endswith('"')) or (item.startswith("'") and item.endswith("'")):
            meta[name] = item[1:-1]
            continue
        meta[name] = item
    return meta, body


def strip_tags(raw: str) -> str:
    text = TAG_RE.sub(" ", raw)
    text = html.unescape(text)
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"[ \t]{2,}", " ", text)).strip()


def html_title_and_body(raw: str, fallback: str) -> tuple[str, str]:
    title_match = HTML_TITLE_RE.search(raw)
    h1_match = HTML_H1_RE.search(raw)
    title = fallback
    if title_match:
        title = strip_tags(title_match.group(1)) or fallback
    elif h1_match:
        title = strip_tags(h1_match.group(1)) or fallback
    body_source = raw
    if h1_match:
        body_source = raw[h1_match.end() :]
    body = strip_tags(body_source)
    return title, body


def heading_title_and_body(text: str, fallback: str) -> tuple[str, str]:
    lines = text.splitlines()
    title = fallback
    start = 0
    if lines and lines[0].startswith("# "):
        title = lines[0][2:].strip() or fallback
        start = 1
        if start < len(lines) and lines[start] == "":
            start += 1
    return title, "\n".join(lines[start:]).strip()


def skip_dir(name: str) -> bool:
    return name.casefold() in SKIP_DIR_NAMES or name.startswith(".")


def iter_note_files(root: Path) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    if root.is_file() and root.suffix.lower() in {".zip"}:
        with zipfile.ZipFile(root) as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                name = info.filename
                parts = Path(name).parts
                if any(skip_dir(part) for part in parts):
                    continue
                if Path(name).suffix.lower() not in NOTE_SUFFIXES:
                    continue
                found.append((name, archive.read(info).decode("utf-8", errors="replace")))
        return found
    if root.is_file():
        return [(root.name, root.read_text(encoding="utf-8", errors="replace"))]
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(skip_dir(part) for part in path.relative_to(root).parts):
            continue
        if path.suffix.lower() not in NOTE_SUFFIXES:
            continue
        rel = str(path.relative_to(root))
        found.append((rel, path.read_text(encoding="utf-8", errors="replace")))
    return found


def draft_from_note_text(adapter: str, source_ref: str, text: str, *, prefer_journal: bool) -> ImportDraft:
    suffix = Path(source_ref).suffix.lower()
    fallback = Path(source_ref).stem.replace("_", " ").strip() or "Imported note"
    if suffix in {".html", ".htm"}:
        title, body = html_title_and_body(text, fallback)
        meta: dict[str, Any] = {}
    else:
        meta, remainder = parse_frontmatter(text)
        title_from_meta = meta.pop("title", None)
        heading, body = heading_title_and_body(remainder, fallback)
        title = str(title_from_meta).strip() if title_from_meta else heading
    daily = DAILY_NOTE_RE.match(Path(source_ref).name)
    node_type = "journal" if prefer_journal and daily else "note"
    data: dict[str, Any] = {}
    for key, value in meta.items():
        if key in {"id", "type", "payload", "url", "repo", "receipt"}:
            continue
        if SECRET_KEY_RE.search(key):
            continue
        if isinstance(value, (str, int, float, bool)):
            data[key] = value
    data["import_ref"] = f"{adapter}:{source_ref}"
    return ImportDraft(
        adapter=adapter,
        source_ref=source_ref,
        type=node_type,
        title=title or fallback,
        body=body,
        data=data,
    )


def parse_obsidian(source: Path) -> list[ImportDraft]:
    drafts: list[ImportDraft] = []
    for ref, text in iter_note_files(source):
        drafts.append(draft_from_note_text("obsidian", ref, text, prefer_journal=True))
    return drafts


def parse_notion(source: Path) -> list[ImportDraft]:
    return [
        draft_from_note_text("notion", ref, text, prefer_journal=False)
        for ref, text in iter_note_files(source)
    ]


def parse_apple_notes(source: Path) -> list[ImportDraft]:
    return [
        draft_from_note_text("apple-notes", ref, text, prefer_journal=False)
        for ref, text in iter_note_files(source)
    ]


def normalize_task_status(raw: Any) -> str:
    text = str(raw or "").strip().casefold()
    if text in {"completed", "complete", "done", "closed"}:
        return "completed"
    return "active"


def normalize_due(raw: Any) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    match = ISO_DATE_RE.match(text)
    if match:
        return match.group(1)
    return None


def drafts_from_task_rows(rows: list[dict[str, Any]], source_ref: str) -> list[ImportDraft]:
    drafts: list[ImportDraft] = []
    for index, row in enumerate(rows):
        title = str(row.get("title") or row.get("name") or "").strip()
        if not title:
            continue
        task_id = str(row.get("id") or row.get("task_id") or f"{source_ref}:{index}")
        due = normalize_due(row.get("due") or row.get("due_date"))
        data: dict[str, Any] = {"import_ref": f"google-tasks:{task_id}"}
        if due:
            data["due"] = due
        drafts.append(
            ImportDraft(
                adapter="google-tasks",
                source_ref=task_id,
                type="task",
                title=title,
                status=normalize_task_status(row.get("status")),
                data=data,
            )
        )
    return drafts


def flatten_google_tasks(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        rows: list[dict[str, Any]] = []
        for item in payload:
            if isinstance(item, dict):
                if isinstance(item.get("items"), list):
                    rows.extend(flatten_google_tasks(item["items"]))
                elif item.get("title"):
                    rows.append(item)
        return rows
    if isinstance(payload, dict):
        for key in ("items", "tasks"):
            if isinstance(payload.get(key), list):
                return flatten_google_tasks(payload[key])
        if payload.get("title"):
            return [payload]
    return []


def parse_google_tasks(source: Path) -> list[ImportDraft]:
    if source.is_dir():
        drafts: list[ImportDraft] = []
        for path in sorted(source.rglob("*")):
            if path.is_file() and path.suffix.lower() in {".json", ".csv"}:
                drafts.extend(parse_google_tasks(path))
        return drafts
    if source.suffix.lower() == ".csv":
        with source.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            rows = [dict(row) for row in reader]
        return drafts_from_task_rows(rows, source.name)
    payload = json.loads(source.read_text(encoding="utf-8"))
    return drafts_from_task_rows(flatten_google_tasks(payload), source.name)


ADAPTER_PARSERS = {
    "obsidian": parse_obsidian,
    "notion": parse_notion,
    "apple-notes": parse_apple_notes,
    "google-tasks": parse_google_tasks,
}


def drafts_to_json(drafts: list[ImportDraft]) -> list[dict[str, Any]]:
    return [asdict(draft) for draft in drafts]


def apply_import(
    url: str,
    key: str,
    drafts: list[ImportDraft],
    *,
    dry_run: bool,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    req_id = 1
    for draft in drafts:
        req_id += 1
        arguments: dict[str, Any] = {
            "type": draft.type,
            "title": draft.title,
            "idempotency_key": draft.idempotency_key,
            "data": draft.data,
        }
        if draft.status:
            arguments["status"] = draft.status
        if draft.body:
            arguments["payload"] = {
                "media_type": "text/markdown",
                "storage": "inline",
                "body": draft.body,
            }
        if dry_run:
            arguments["dry_run"] = True
        got = mcp_call(url, key, "upsert", arguments, req_id)
        node = got.get("node") if isinstance(got.get("node"), dict) else None
        if node is None and isinstance(got.get("nodes"), list) and got["nodes"]:
            first = got["nodes"][0]
            if isinstance(first, dict) and isinstance(first.get("node"), dict):
                node = first["node"]
        results.append(
            {
                "source_ref": draft.source_ref,
                "idempotency_key": draft.idempotency_key,
                "type": draft.type,
                "title": draft.title,
                "id": node.get("id") if node else None,
                "dry_run": bool(got.get("dry_run") or dry_run),
            }
        )
    return {"count": len(results), "dry_run": dry_run, "nodes": results}


def parse_formats(raw: str | None) -> set[str]:
    if not raw:
        return {"json", "markdown", "csv"}
    items = {part.strip().casefold() for part in raw.split(",") if part.strip()}
    unknown = items - {"json", "markdown", "csv"}
    if unknown:
        raise SystemExit(f"foundation-export: unknown format {', '.join(sorted(unknown))}")
    return items


def cmd_export(args: argparse.Namespace) -> int:
    formats = parse_formats(args.format)
    out_dir = Path(args.out)
    if args.from_snapshot:
        snapshot = json.loads(Path(args.from_snapshot).read_text(encoding="utf-8"))
        if not isinstance(snapshot, dict):
            raise SystemExit("foundation-export: snapshot must be an object")
    else:
        snapshot = collect_snapshot(args.mcp_url, load_key())
    written = write_export(snapshot, out_dir, formats)
    json.dump(written, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    adapter = args.from_adapter
    if adapter not in ADAPTER_PARSERS:
        raise SystemExit(f"foundation-import: unknown adapter {adapter}")
    source = Path(args.source)
    if not source.exists():
        raise SystemExit(f"foundation-import: source missing: {source}")
    drafts = ADAPTER_PARSERS[adapter](source)
    if args.print_drafts:
        json.dump(drafts_to_json(drafts), sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0
    if not drafts:
        raise SystemExit("foundation-import: no records in source")
    result = apply_import(args.mcp_url, load_key(), drafts, dry_run=bool(args.dry_run))
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="One-shot Foundation export and import.")
    sub = parser.add_subparsers(dest="command", required=True)

    export_p = sub.add_parser("export", help="Write JSON, Markdown, and CSV under --out")
    export_p.add_argument("--out", required=True, help="Output directory")
    export_p.add_argument(
        "--format",
        default="json,markdown,csv",
        help="Comma list: json, markdown, csv. Default all three",
    )
    export_p.add_argument(
        "--from-snapshot",
        help="Write formats from a JSON snapshot. Skips MCP",
    )
    export_p.add_argument(
        "--mcp-url",
        default=os.environ.get("FOUNDATION_MCP_URL", "http://127.0.0.1:8787/mcp"),
    )

    import_p = sub.add_parser("import", help="Create live records from a foreign export")
    import_p.add_argument(
        "--from",
        dest="from_adapter",
        required=True,
        choices=ADAPTERS,
        help="obsidian | notion | apple-notes | google-tasks",
    )
    import_p.add_argument("--source", required=True, help="Folder, zip, JSON, or CSV")
    import_p.add_argument("--dry-run", action="store_true", help="Call upsert with dry_run: true")
    import_p.add_argument(
        "--print-drafts",
        action="store_true",
        help="Print parsed records. Skips MCP",
    )
    import_p.add_argument(
        "--mcp-url",
        default=os.environ.get("FOUNDATION_MCP_URL", "http://127.0.0.1:8787/mcp"),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "export":
        return cmd_export(args)
    if args.command == "import":
        return cmd_import(args)
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
