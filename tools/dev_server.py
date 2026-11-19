#!/usr/bin/env python3
"""Static server for livestream/ that disables browser caching.

Plain `python -m http.server` lets Chrome heuristically cache JS modules, so
edits to lib/*.js or games/*.js could silently not show up after a reload.
"""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):  # keep the terminal quiet (pointer.json polls ~60/s)
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent.parent / "livestream")
    args = parser.parse_args()
    handler = functools.partial(NoCacheHandler, directory=str(args.directory))
    print(f"Serving {args.directory} at http://127.0.0.1:{args.port} (no-cache)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
