#!/usr/bin/env python3
"""Daemon — local chat browser for any LLM conversation.

Supports: LM Studio, ChatGPT exports, OpenAI-compatible JSON,
Open WebUI exports, Claude Code sessions, and generic imports.

Drop JSON/ZIP files into data/imports/ to add conversations.

Usage:
    python3 server.py [--port 8432]
"""

import http.server
import json
import os
import re
import zipfile
import argparse
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from collections import defaultdict
from typing import TypedDict

CLAUDE_DIR = Path.home() / ".claude"
LMSTUDIO_DIR = Path.home() / ".lmstudio" / "conversations"
DATA_DIR = Path(__file__).parent / "data"
IMPORTS_DIR = DATA_DIR / "imports"
TITLES_PATH = DATA_DIR / "session-titles.json"


class Message(TypedDict, total=False):
    role: str
    content: str
    timestamp: str


class Conversation(TypedDict, total=False):
    id: str
    title: str
    source: str
    model: str
    messages: list[Message]
    message_count: int
    user_messages: int
    assistant_messages: int
    created: str
    updated: str
    project: str
    project_short: str
    cwd: str
    has_transcript: bool


# ── Format detection & parsing ──────────────────────────────────────


def detect_and_parse(data: dict | list, file_path: Path) -> list[Conversation]:
    """Auto-detect JSON chat format and parse into Conversation list."""
    if isinstance(data, list):
        if len(data) > 0:
            first = data[0]
            if isinstance(first, dict):
                if "mapping" in first:
                    return parse_chatgpt_export(data)
                if "chat" in first and isinstance(first.get("chat"), dict):
                    return parse_open_webui(data)
                if "messages" in first:
                    return [parse_openai_compat(item, i) for i, item in enumerate(data)]
        return []

    if isinstance(data, dict):
        if "mapping" in data:
            return parse_chatgpt_export([data])
        if "messages" in data:
            return [parse_openai_compat(data)]
        if "chat" in data and isinstance(data.get("chat"), dict):
            return parse_open_webui([data])

    return []


def parse_openai_compat(data: dict, index: int = 0) -> Conversation:
    """Parse OpenAI-compatible format (LM Studio, Ollama UIs, generic)."""
    messages = data.get("messages", [])
    user_msgs = [m for m in messages if m.get("role") == "user"]
    asst_msgs = [m for m in messages if m.get("role") == "assistant"]

    title = data.get("title", "")
    if not title and user_msgs:
        first = user_msgs[0].get("content", "")
        title = first[:77] + "…" if len(first) > 80 else first

    conv_id = data.get("id", data.get("conversation_id", f"import-{index}"))
    created = data.get("created", data.get("create_time", ""))
    if isinstance(created, (int, float)):
        created = datetime.fromtimestamp(created, tz=timezone.utc).isoformat()

    return Conversation(
        id=str(conv_id),
        title=title,
        source=_guess_source(data),
        model=data.get("model", ""),
        messages=[Message(role=m.get("role", ""), content=m.get("content", ""))
                  for m in messages if m.get("role") in ("user", "assistant", "system")],
        message_count=len(user_msgs) + len(asst_msgs),
        user_messages=len(user_msgs),
        assistant_messages=len(asst_msgs),
        created=str(created) if created else "",
        updated=str(created) if created else "",
    )


def _guess_source(data: dict) -> str:
    model = data.get("model", "")
    if model:
        m = model.lower()
        if any(k in m for k in ("llama", "mistral", "gemma", "phi", "qwen", "deepseek")):
            return "lm-studio"
        if any(k in m for k in ("gpt", "o1", "o3", "chatgpt")):
            return "chatgpt"
        if "claude" in m:
            return "claude"
    return "import"


def parse_chatgpt_export(conversations: list[dict]) -> list[Conversation]:
    """Parse ChatGPT's tree-based export format."""
    results = []
    for conv in conversations:
        mapping = conv.get("mapping", {})
        messages = _linearize_chatgpt_tree(mapping)
        user_msgs = [m for m in messages if m["role"] == "user"]
        asst_msgs = [m for m in messages if m["role"] == "assistant"]

        created = conv.get("create_time", "")
        if isinstance(created, (int, float)):
            created = datetime.fromtimestamp(created, tz=timezone.utc).isoformat()
        updated = conv.get("update_time", "")
        if isinstance(updated, (int, float)):
            updated = datetime.fromtimestamp(updated, tz=timezone.utc).isoformat()

        results.append(Conversation(
            id=conv.get("conversation_id", conv.get("id", "")),
            title=conv.get("title", ""),
            source="chatgpt",
            model=_extract_chatgpt_model(mapping),
            messages=messages,
            message_count=len(user_msgs) + len(asst_msgs),
            user_messages=len(user_msgs),
            assistant_messages=len(asst_msgs),
            created=str(created) if created else "",
            updated=str(updated) if updated else "",
        ))
    return results


def _linearize_chatgpt_tree(mapping: dict) -> list[Message]:
    """Walk the ChatGPT mapping tree to produce a linear message list."""
    root = None
    for node_id, node in mapping.items():
        if node.get("parent") is None or node.get("parent") not in mapping:
            root = node_id
            break
    if not root:
        return []

    messages: list[Message] = []
    queue = [root]
    visited = set()
    while queue:
        nid = queue.pop(0)
        if nid in visited:
            continue
        visited.add(nid)
        node = mapping.get(nid, {})
        msg = node.get("message")
        if msg:
            author = msg.get("author", {}).get("role", "")
            content_obj = msg.get("content", {})
            parts = content_obj.get("parts", []) if isinstance(content_obj, dict) else []
            text = " ".join(str(p) for p in parts if isinstance(p, str))
            if author in ("user", "assistant") and text.strip():
                messages.append(Message(role=author, content=text))
        for child_id in node.get("children", []):
            queue.append(child_id)
    return messages


def _extract_chatgpt_model(mapping: dict) -> str:
    for node in mapping.values():
        msg = node.get("message", {})
        if msg:
            meta = msg.get("metadata", {})
            model = meta.get("model_slug", "")
            if model:
                return model
    return ""


def parse_open_webui(items: list[dict]) -> list[Conversation]:
    """Parse Open WebUI export format."""
    results = []
    for item in items:
        chat = item.get("chat", {})
        messages = chat.get("messages", [])
        user_msgs = [m for m in messages if m.get("role") == "user"]
        asst_msgs = [m for m in messages if m.get("role") == "assistant"]

        results.append(Conversation(
            id=item.get("id", ""),
            title=item.get("title", ""),
            source="open-webui",
            model=chat.get("model", item.get("model", "")),
            messages=[Message(role=m.get("role", ""), content=m.get("content", ""))
                      for m in messages if m.get("role") in ("user", "assistant")],
            message_count=len(user_msgs) + len(asst_msgs),
            user_messages=len(user_msgs),
            assistant_messages=len(asst_msgs),
        ))
    return results


# ── Source scanners ─────────────────────────────────────────────────


def scan_lmstudio() -> list[Conversation]:
    """Scan LM Studio conversation files (real versioned format)."""
    if not LMSTUDIO_DIR.exists():
        return []
    results = []
    for json_path in LMSTUDIO_DIR.rglob("*.conversation.json"):
        try:
            with open(json_path) as f:
                data = json.load(f)
            conv = _parse_lmstudio_native(data, json_path)
            if conv:
                results.append(conv)
        except (json.JSONDecodeError, OSError):
            continue
    return results


def _parse_lmstudio_native(data: dict, path: Path) -> Conversation | None:
    """Parse LM Studio's native versioned conversation format."""
    raw_msgs = data.get("messages", [])
    messages: list[Message] = []

    for m in raw_msgs:
        versions = m.get("versions", [])
        sel = m.get("currentlySelected", 0)
        if not versions or sel >= len(versions):
            continue
        ver = versions[sel]
        role = ver.get("role", "")
        if role not in ("user", "assistant"):
            continue

        text_parts: list[str] = []
        if role == "user":
            content = ver.get("content", [])
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        text_parts.append(part.get("text", ""))
            elif isinstance(content, str):
                text_parts.append(content)
        else:
            for step in ver.get("steps", []):
                content = step.get("content", [])
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            text_parts.append(part.get("text", ""))
                elif isinstance(content, str):
                    text_parts.append(content)

        text = "\n".join(text_parts).strip()
        if text:
            messages.append(Message(role=role, content=text))

    user_msgs = [m for m in messages if m["role"] == "user"]
    asst_msgs = [m for m in messages if m["role"] == "assistant"]

    title = data.get("name", "")
    if not title and user_msgs:
        first = user_msgs[0]["content"]
        title = first[:77] + "…" if len(first) > 80 else first

    model_info = data.get("lastUsedModel", {})
    model = model_info.get("identifier", "") if isinstance(model_info, dict) else ""

    created_ms = data.get("createdAt", 0)
    created = ""
    if created_ms:
        created = datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc).isoformat()

    folder = path.parent.name
    project = folder if folder != "conversations" else ""

    return Conversation(
        id=f"lms-{path.stem.split('.')[0]}",
        title=title,
        source="lm-studio",
        model=model.split("/")[-1] if "/" in model else model,
        messages=messages,
        message_count=len(user_msgs) + len(asst_msgs),
        user_messages=len(user_msgs),
        assistant_messages=len(asst_msgs),
        created=created,
        updated=created,
        project_short=project,
    )


def scan_imports() -> list[Conversation]:
    """Scan data/imports/ for JSON and ZIP files."""
    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    for path in IMPORTS_DIR.iterdir():
        try:
            if path.suffix == ".zip":
                results.extend(_import_zip(path))
            elif path.suffix == ".json":
                with open(path) as f:
                    data = json.load(f)
                convos = detect_and_parse(data, path)
                for c in convos:
                    if not c.get("id") or c["id"].startswith("import-"):
                        c["id"] = f"imp-{path.stem}-{convos.index(c)}"
                results.extend(convos)
        except (json.JSONDecodeError, OSError, zipfile.BadZipFile):
            continue
    return results


def _import_zip(zip_path: Path) -> list[Conversation]:
    """Extract conversations from a ZIP (ChatGPT export format)."""
    with zipfile.ZipFile(zip_path) as z:
        for name in z.namelist():
            if name.endswith(".json"):
                content = z.read(name).decode("utf-8", errors="replace")
                try:
                    data = json.loads(content)
                    return detect_and_parse(data, zip_path)
                except json.JSONDecodeError:
                    continue
    return []


def scan_claude_code() -> list[Conversation]:
    """Scan Claude Code session metadata (existing behavior)."""
    projects_dir = CLAUDE_DIR / "projects"
    sessions_dir = CLAUDE_DIR / "sessions"
    history_path = CLAUDE_DIR / "history.jsonl"

    if not projects_dir.exists():
        return []

    sessions: dict[str, Conversation] = {}
    title_cache = _read_title_cache()

    for jsonl_path in projects_dir.glob("*/*.jsonl"):
        session_id = jsonl_path.stem
        project_dir = jsonl_path.parent.name
        project_path = project_dir.replace("-", "/", 1).replace("-", "/")

        meta = _read_jsonl_metadata(jsonl_path)
        sessions[session_id] = Conversation(
            id=session_id,
            source="claude-code",
            project=project_path,
            project_short=Path(project_path).name if project_path else "",
            **meta,
        )

    if sessions_dir.exists():
        for json_path in sessions_dir.glob("*.json"):
            try:
                with open(json_path) as f:
                    meta = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue
            sid = meta.get("sessionId", "")
            if sid in sessions:
                name = meta.get("name", "").strip('"')
                if name:
                    sessions[sid]["title"] = sessions[sid].get("title") or name
                cwd = meta.get("cwd", "")
                if cwd:
                    sessions[sid]["cwd"] = cwd
                    sessions[sid]["project_short"] = Path(cwd).name
                sessions[sid]["created"] = meta.get("procStart", "")
                sessions[sid]["model"] = meta.get("model", "")

    for key, info in title_cache.items():
        sid = key.replace("local_", "")
        if sid in sessions:
            if info.get("title") and not sessions[sid].get("title"):
                sessions[sid]["title"] = info["title"]
            cwd = info.get("cwd", "")
            if cwd and not sessions[sid].get("cwd"):
                sessions[sid]["cwd"] = cwd
                sessions[sid]["project_short"] = Path(cwd).name

    # Fallback titles from history
    if history_path.exists():
        project_first_prompts: dict[str, str] = {}
        try:
            with open(history_path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        project = obj.get("project", "")
                        display = obj.get("display", "").strip()
                        if project and display and project not in project_first_prompts:
                            project_first_prompts[project] = display
                    except json.JSONDecodeError:
                        continue
        except OSError:
            pass

        for sid, session in sessions.items():
            if not session.get("title"):
                cwd = session.get("cwd") or session.get("project", "")
                if cwd in project_first_prompts:
                    prompt = project_first_prompts[cwd]
                    session["title"] = prompt[:77] + "…" if len(prompt) > 80 else prompt
                else:
                    proj = session.get("project_short", "")
                    if proj:
                        session["title"] = f"{proj} session"

    return list(sessions.values())


def _read_jsonl_metadata(jsonl_path: Path) -> dict:
    """Extract metadata from a Claude Code JSONL file."""
    timestamps: list[str] = []
    titles: list[str] = []
    user_count = 0
    assistant_count = 0

    with open(jsonl_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = obj.get("type", "")
            if "timestamp" in obj:
                timestamps.append(obj["timestamp"])
            if t == "ai-title" and obj.get("content"):
                titles.append(obj["content"])
            if t == "user":
                user_count += 1
            if t == "assistant":
                assistant_count += 1

    return {
        "message_count": user_count + assistant_count,
        "user_messages": user_count,
        "assistant_messages": assistant_count,
        "title": titles[-1] if titles else "",
        "created": min(timestamps) if timestamps else "",
        "updated": max(timestamps) if timestamps else "",
    }


def _read_title_cache() -> dict:
    if not TITLES_PATH.exists():
        return {}
    try:
        with open(TITLES_PATH) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


# ── Aggregator ──────────────────────────────────────────────────────


def get_all_conversations() -> list[Conversation]:
    """Aggregate conversations from all sources."""
    all_convos: list[Conversation] = []
    # all_convos.extend(scan_claude_code())  # TODO: re-enable when ready
    # all_convos.extend(scan_lmstudio())     # TODO: re-enable when ready
    all_convos.extend(scan_imports())
    all_convos.sort(
        key=lambda c: c.get("updated") or c.get("created") or "",
        reverse=True,
    )
    return all_convos


# ── HTTP server ─────────────────────────────────────────────────────


class DaemonHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.directory = str(Path(__file__).parent)
        super().__init__(*args, directory=self.directory, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/sessions":
            convos = get_all_conversations()
            for c in convos:
                c.pop("messages", None)
            self._json(convos)
        elif path == "/api/session":
            sid = parse_qs(parsed.query).get("id", [""])[0]
            convos = get_all_conversations()
            match = next((c for c in convos if c["id"] == sid), None)
            self._json(match)
        elif path == "/api/stats":
            convos = get_all_conversations()
            sources = defaultdict(int)
            for c in convos:
                sources[c.get("source", "unknown")] += 1
            projects = sorted(set(
                c.get("project_short", "") for c in convos if c.get("project_short")
            ))
            self._json({
                "total": len(convos),
                "messages": sum(c.get("message_count", 0) for c in convos),
                "sources": dict(sources),
                "projects": projects,
            })
        elif path == "/" or path == "":
            self.path = "/index.html"
            super().do_GET()
        else:
            super().do_GET()

    def _json(self, data):
        body = json.dumps(data, indent=2, default=str).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description="Daemon — local chat browser")
    parser.add_argument("--port", type=int, default=8432)
    args = parser.parse_args()

    IMPORTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Daemon → http://localhost:{args.port}")
    print(f"  Sources: Claude Code, LM Studio, imports ({IMPORTS_DIR})")
    server = http.server.HTTPServer(("127.0.0.1", args.port), DaemonHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
