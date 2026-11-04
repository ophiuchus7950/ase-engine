"""
Rivela ASE — Scrapling web-scraper sidecar.

Standalone HTTP service built on D4Vinci/Scrapling's stealth headless browser
(Camoufox/Chromium via patchright). Renders JavaScript and bypasses common
anti-bot checks (e.g. Cloudflare interstitial), so it can scrape pages the
engine's plain-HTTP collector cannot.

Endpoints
---------
POST /scrape   {"url": "...", "selector": "..." | null, "max_chars": int|null}
    -> {"ok": true, "raw_text": "...", "source_url": "...", "title": "..." | null}
    -> {"ok": false, "error": "..."}  (400/502 on failure)
GET  /health   -> {"ok": true}

The Node collector worker (web/src and src/pipeline/collection:
scrapling.collector.ts) calls POST /scrape for JS-heavy source types
(g2, capterra, trustradius, job_board) and returns {rawText, sourceUrl} —
the same contract as http.collector.ts.

Feasibility note: released browserforge has Linux/desktop Chrome fingerprints
only up to v141, while released Scrapling hardcodes Chrome 149, which makes
header generation fail. We therefore pin the fingerprint version to 141
(below) — a minimal, well-understood workaround for that upstream gap.
"""

import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# --- Patch the fingerprint Chrome version before importing the fetchers.
# browserforge's bundled Linux/desktop data tops out at Chrome 141; Scrapling
# hardcodes 149, which raises "No headers can be generated". Pinning 141 is
# safe (the real resident browser is still whatever patchright launches).
import scrapling.engines.toolbelt.fingerprints as _fp

_fp.chrome_version = 141
_fp.chromium_version = 141

from scrapling.fetchers import StealthyFetcher  # noqa: E402

HOST = os.environ.get("SCRAPLING_HOST", "0.0.0.0")
PORT = int(os.environ.get("SCRAPLING_PORT", "8410"))
TIMEOUT_MS = int(os.environ.get("SCRAPLING_TIMEOUT_MS", "60000"))

# In-page whitespace / boilerplate collapse for the raw_text we hand the engine.
_WS_RE = re.compile(r"\s+")


def _collapse(text: str) -> str:
    return _WS_RE.sub(" ", text).strip()


def scrape(url: str, selector: str | None = None, max_chars: int | None = None) -> dict:
    response = StealthyFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        timeout=TIMEOUT_MS,
    )
    node = response.css(selector) if selector else response
    if selector and not node:
        raise ValueError(f"no element matched selector '{selector}' on {url}")
    text = _collapse(node.get_all_text())
    if max_chars and len(text) > max_chars:
        text = text[:max_chars]
    title = None
    try:
        title = _collapse(response.css("title::text").get() or "")
    except Exception:  # pragma: no cover - best effort
        title = None
    return {
        "ok": True,
        "raw_text": text,
        "source_url": url,
        "title": title or None,
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A002 - quiet by default
        pass

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (HTTP method)
        if self.path.rstrip("/") == "/health":
            self._json(200, {"ok": True, "service": "scrapling"})
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802 (HTTP method)
        if self.path.rstrip("/") != "/scrape":
            self._json(404, {"ok": False, "error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            url = (payload.get("url") or "").strip()
            if not url:
                self._json(400, {"ok": False, "error": "missing 'url'"})
                return
            result = scrape(
                url,
                selector=(payload.get("selector") or "").strip() or None,
                max_chars=payload.get("max_chars"),
            )
            self._json(200, result)
        except ValueError as exc:
            self._json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - surface as 502
            self._json(502, {"ok": False, "error": str(exc)[:500]})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"[scrapling] listening on {HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
