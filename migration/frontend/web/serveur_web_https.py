"""Serveur Web HTTPS autonome pour PREVIA Web Dashboard (Port 5173).
Sert les fichiers statiques compilés de `dist/` et relaie les requêtes API vers le backend FastAPI (Port 8012).
Zéro dépendance NPM/Node requise à l'exécution sur Raspberry Pi.
"""
import os
import sys
import ssl
import http.server
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST_DIR = HERE / "dist"
CERT_FILE = HERE.parent.parent / "backend" / "certs" / "cert.pem"
KEY_FILE = HERE.parent.parent / "backend" / "certs" / "key.pem"

ROUTES_BACKEND = {
    "alarme", "alertes", "batiments", "cameras", "docs", "openapi.json",
    "personnel", "pieces", "profils", "redoc", "static-docs", "systeme",
    "utilisateurs", "vue-ensemble", "ws", "stream", "journal-actions"
}

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

class PreviaWebHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def is_backend_route(self, path: str) -> bool:
        first_segment = path.lstrip("/").split("/")[0].split("?")[0]
        return first_segment in ROUTES_BACKEND

    def proxy_to_backend(self, method: str):
        target_urls = [
            f"https://127.0.0.1:8012{self.path}",
            f"http://127.0.0.1:8012{self.path}",
        ]
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length")}
        headers["Host"] = "127.0.0.1:8012"

        body = None
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = self.rfile.read(content_length)

        dernier_erreur = None
        is_stream = "/flux" in self.path or "/stream" in self.path
        timeout_val = None if is_stream else 30
        for target_url in target_urls:
            try:
                req = urllib.request.Request(target_url, data=body, headers=headers, method=method)
                with urllib.request.urlopen(req, context=ssl_ctx, timeout=timeout_val) as resp:
                    self.send_response(resp.status)
                    for k, v in resp.getheaders():
                        if k.lower() not in ("transfer-encoding", "content-encoding"):
                            self.send_header(k, v)
                    self.end_headers()
                    chunk_size = 65536 if is_stream else 8192
                    read_fn = resp.read1 if hasattr(resp, "read1") else resp.read
                    while True:
                        chunk = read_fn(chunk_size)
                        if not chunk:
                            break
                        try:
                            self.wfile.write(chunk)
                            self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError):
                            break
                    return
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                for k, v in e.headers.items():
                    if k.lower() not in ("transfer-encoding", "content-encoding"):
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(e.read())
                return
            except Exception as e:
                dernier_erreur = e
                continue

        try:
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            import json
            reponse = json.dumps({
                "detail": f"Backend PREVIA en cours de démarrage ou injoignable sur le port 8012 ({dernier_erreur}). Patientez quelques instants."
            })
            self.wfile.write(reponse.encode("utf-8"))
        except Exception:
            pass

    def do_GET(self):
        if self.is_backend_route(self.path):
            self.proxy_to_backend("GET")
        else:
            # SPA Routing: si le fichier n'existe pas, renvoyer index.html
            rel_path = self.path.split("?")[0].lstrip("/")
            file_path = DIST_DIR / rel_path
            if not file_path.exists() or not file_path.is_file():
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        if self.is_backend_route(self.path):
            self.proxy_to_backend("POST")
        else:
            self.send_response(405)
            self.end_headers()

    def do_PUT(self):
        if self.is_backend_route(self.path):
            self.proxy_to_backend("PUT")
        else:
            self.send_response(405)
            self.end_headers()

    def do_DELETE(self):
        if self.is_backend_route(self.path):
            self.proxy_to_backend("DELETE")
        else:
            self.send_response(405)
            self.end_headers()

    def log_message(self, format, *args):
        # Réduire le spam dans les logs
        pass

def main():
    port = 5173
    # Utiliser ThreadingHTTPServer pour traiter toutes les requêtes en parallèle (API + streaming vidéo + assets)
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), PreviaWebHandler)
    server.daemon_threads = True
    if CERT_FILE.exists() and KEY_FILE.exists():
        server_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server_ctx.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
        server.socket = server_ctx.wrap_socket(server.socket, server_side=True)
        print(f"[main] Serveur Web HTTPS multithread actif sur https://0.0.0.0:{port}", flush=True)
    else:
        print(f"[main] Serveur Web HTTP multithread actif sur http://0.0.0.0:{port}", flush=True)

    
    server.serve_forever()

if __name__ == "__main__":
    main()
