#!/usr/bin/env python3
"""Minimal OpenAI-compatible HTTP bridge for FastVLM-0.5B.litertlm.

Requires Python 3.10+ and: pip install litert-lm pillow

Usage:
  python fastvlm-bridge.py /path/to/FastVLM-0.5B.litertlm
  python fastvlm-bridge.py /path/to/FastVLM-0.5B.litertlm --port 8765 --bind-all

Official alternative (also needs Python 3.10+):
  pip install --upgrade litert-lm
  litert-lm import "I:\\Models\\FastVLM-0.5B.litertlm" fastvlm-0.5b
  litert-lm serve --host 0.0.0.0 --port 8765
  # Extension base URL: http://<PC-LAN-IP>:8765/v1  model id: fastvlm-0.5b

On Android (model on phone): the browser extension cannot load .litertlm itself.
Run a local OpenAI-compatible server ON the phone, then set the extension to
http://127.0.0.1:8080/v1 — see docs/FASTVLM-SETUP.md.

Download the model from:
  https://huggingface.co/litert-community/FastVLM-0.5B
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if sys.version_info < (3, 10):
    raise SystemExit(
        "Python 3.10+ is required (litert_lm uses dataclass kw_only).\n"
        f"You are running {sys.version.split()[0]}.\n\n"
        "Upgrade with pyenv:\n"
        "  pyenv install 3.12.7\n"
        "  pyenv local 3.12.7\n"
        "  pyenv exec python -m pip install litert-lm pillow\n\n"
        "Or use the official CLI after upgrading Python:\n"
        "  litert-lm serve --host 0.0.0.0 --port 8765"
    )

try:
    from litert_lm import Backend, Content, Contents, Engine
except ImportError as exc:
    raise SystemExit(
        "Install LiteRT-LM into the same Python you run this script with:\n"
        "  pyenv exec python -m pip install litert-lm pillow\n"
        f"Original error: {exc}"
    ) from exc

try:
    from PIL import Image
except ImportError as exc:
    raise SystemExit("Install Pillow: pip install pillow") from exc

ENGINE = None
CONVERSATION = None


def decode_image(data_url: str) -> str:
    """Writes a base64 data URL to a temp file; returns the path."""
    match = re.match(r"data:image/[^;]+;base64,(.+)", data_url, re.I | re.S)
    if not match:
        raise ValueError("Expected data:image/...;base64,...")
    raw = base64.b64decode(match.group(1))
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    path = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False).name
    img.save(path, "JPEG", quality=85)
    return path


def extract_text_and_image(messages: list) -> tuple[str, str | None]:
    """Pulls plain text and optional image path from OpenAI-style messages."""
    parts: list[str] = []
    image_path: str | None = None
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = msg.get("content")
            if isinstance(content, str):
                parts.insert(0, content)
            elif isinstance(content, list):
                for block in content:
                    if block.get("type") == "text":
                        parts.insert(0, block.get("text", ""))
                    elif block.get("type") == "image_url":
                        url = block.get("image_url", {}).get("url", "")
                        if url.startswith("data:"):
                            image_path = decode_image(url)
            break
    return "\n".join(parts).strip(), image_path


def text_from_response(response: dict) -> str:
    """Extracts assistant text from a LiteRT-LM send_message response."""
    content = response.get("content", [])
    chunks: list[str] = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text":
            chunks.append(item.get("text", ""))
        elif isinstance(item, str):
            chunks.append(item)
    return "".join(chunks).strip()


def run_inference(prompt: str, image_path: str | None) -> str:
    global CONVERSATION
    if CONVERSATION is None:
        CONVERSATION = ENGINE.create_conversation()
    if image_path:
        msg = Contents.of(
            Content.Text(prompt),
            Content.ImageFile(absolute_path=image_path),
        )
    else:
        msg = prompt
    response = CONVERSATION.send_message(msg)
    return text_from_response(response)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print(f"[fastvlm] {self.address_string()} {fmt % args}")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _sse(self, text: str, model: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        # Chunked deltas so the extension's readOpenAiSse() emits tokens.
        chunk_size = 20
        for i in range(0, max(1, len(text)), chunk_size):
            delta = text[i : i + chunk_size]
            payload = {
                "id": "chatcmpl-fastvlm",
                "object": "chat.completion.chunk",
                "model": model,
                "choices": [{"index": 0, "delta": {"content": delta}}],
            }
            self.wfile.write(f"data: {json.dumps(payload)}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/v1/models":
            self._json(
                200,
                {"object": "list", "data": [{"id": "fastvlm-0.5b", "object": "model"}]},
            )
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if not self.path.endswith("/v1/chat/completions"):
            self._json(404, {"error": "not found"})
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
            messages = body.get("messages") or []
            prompt, image_path = extract_text_and_image(messages)
            if not prompt:
                raise ValueError("No user message found")
            text = run_inference(prompt, image_path)
            model = body.get("model") or "fastvlm-0.5b"
            if body.get("stream"):
                self._sse(text, model)
                return
            self._json(
                200,
                {
                    "choices": [{"message": {"role": "assistant", "content": text}}],
                },
            )
        except Exception as exc:
            self._json(500, {"error": str(exc)})


def main() -> None:
    global ENGINE
    parser = argparse.ArgumentParser(description="FastVLM OpenAI-compatible bridge")
    parser.add_argument("model", type=Path, help="Path to FastVLM-0.5B.litertlm")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind address (use 0.0.0.0 with --bind-all for LAN/phone access)",
    )
    parser.add_argument(
        "--cpu-only",
        action="store_true",
        help="Use CPU for both text and vision (slower, no GPU required)",
    )
    parser.add_argument(
        "--bind-all",
        action="store_true",
        help="Listen on 0.0.0.0 (all interfaces) for phone/LAN clients",
    )
    args = parser.parse_args()
    if not args.model.is_file():
        raise SystemExit(f"Model not found: {args.model}")

    host = "0.0.0.0" if args.bind_all else args.host
    vision_backend = Backend.CPU() if args.cpu_only else Backend.GPU()

    ENGINE = Engine(
        str(args.model),
        backend=Backend.CPU(),
        vision_backend=vision_backend,
    )
    print(f"FastVLM ready on http://{host}:{args.port}/v1")
    print("Extension Settings → FastVLM → base URL above; enable Vision in panel.")
    if host == "0.0.0.0":
        print("Wireless debugging: use http://<your-PC-LAN-IP>:8765/v1 on the phone.")
        print("Allow port 8765 in Windows Firewall if the phone cannot connect.")
    elif host == "127.0.0.1":
        print(
            "USB debugging: adb reverse tcp:8765 tcp:8765 then use http://127.0.0.1:8765/v1"
        )
    server = ThreadingHTTPServer((host, args.port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
