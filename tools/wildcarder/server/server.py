#!/usr/bin/env python3
"""Wildcarder local server (Mac / Linux, also works on Windows).

Serves the web page and reads the project's  wildcards/  folder on every
request, so any .txt you edit shows up in the page straight away.
Only listens on this computer (localhost). Close the window to stop it.
"""
import http.server
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WILD = os.path.join(ROOT, "wildcards")
PORTS = range(8765, 8776)


def list_txt():
    out = []
    for d, dirs, files in os.walk(WILD):
        dirs[:] = sorted(x for x in dirs if not x.startswith("."))
        for f in sorted(files):
            if f.lower().endswith(".txt") and not f.startswith("."):
                p = os.path.join(d, f)
                out.append((os.path.relpath(p, WILD).replace(os.sep, "/"), p))
    return out


def signature():
    parts = []
    for rel, p in list_txt():
        try:
            st = os.stat(p)
            parts.append(f"{rel}|{st.st_size}|{st.st_mtime_ns}")
        except OSError:
            pass
    return "\n".join(parts)


def open_in_os(path, folder=False):
    if sys.platform.startswith("win"):
        os.startfile(path)  # noqa
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path] if folder else ["open", "-t", path])
    else:
        subprocess.Popen(["xdg-open", path])


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_body(self, body, ctype, cors=False):
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        if cors:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/__wildcarder/ping":
            return self.send_body("wildcarder", "text/plain; charset=utf-8", cors=True)
        if path == "/__wildcarder/sig":
            return self.send_body(signature(), "text/plain; charset=utf-8")
        if path == "/__wildcarder/files":
            files = []
            for rel, p in list_txt():
                try:
                    with open(p, encoding="utf-8-sig", errors="replace") as fh:
                        files.append({"path": rel, "text": fh.read()})
                except OSError:
                    pass
            body = json.dumps({"folder": WILD, "sig": signature(), "files": files}, ensure_ascii=False)
            return self.send_body(body, "application/json; charset=utf-8")
        return super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        origin = self.headers.get("Origin", "")
        host = self.headers.get("Host", "")
        if path != "/__wildcarder/open" or urllib.parse.urlparse(origin).netloc != host:
            self.send_error(403)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            rel = json.loads(self.rfile.read(n) or b"{}").get("path") or ""
            target = os.path.realpath(os.path.join(WILD, rel))
            if not (target == os.path.realpath(WILD) or target.startswith(os.path.realpath(WILD) + os.sep)):
                raise ValueError("outside wildcards")
            if os.path.isdir(target):
                open_in_os(target, folder=True)
            elif target.lower().endswith(".txt") and os.path.isfile(target):
                open_in_os(target)
            else:
                raise ValueError("not found")
            self.send_body("ok", "text/plain; charset=utf-8")
        except Exception as e:  # noqa
            self.send_error(400, str(e))


def already_running(port):
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
                f"http://127.0.0.1:{port}/__wildcarder/ping", timeout=1.5) as r:
            return r.read().decode() == "wildcarder"
    except Exception:
        return False


def main():
    if not os.path.isdir(WILD):
        print(f"No encuentro la carpeta: {WILD}")
        sys.exit(1)
    no_browser = "--no-browser" in sys.argv
    for port in PORTS:
        url = f"http://localhost:{port}/"
        if already_running(port):
            print(f"Wildcarder ya estaba abierto en {url}")
            if not no_browser:
                webbrowser.open(url)
            return
        try:
            srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
        except OSError:
            continue
        n = len(list_txt())
        print("Wildcarder funcionando")
        print(f"  Web:        {url}")
        print(f"  Wildcards:  {WILD}  ({n} archivos .txt)")
        print("Edita los .txt de esa carpeta y la web se actualiza sola.")
        print("Cierra esta ventana (o pulsa Ctrl+C) para pararlo.")
        if not no_browser:
            webbrowser.open(url)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
        return
    print("Todos los puertos 8765-8775 están ocupados.")
    sys.exit(1)


if __name__ == "__main__":
    main()
