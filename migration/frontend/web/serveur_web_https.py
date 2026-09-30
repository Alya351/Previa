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
    "utilisateurs", "vue-ensemble", "ws", "stream"
}

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

class PreviaWebHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def is_backend_route(self, path: str) -> bool:
        first_segment = path.lstrip("/").split("/")[0].split("?")[0]
        return first_segment in ROUTES_BACKEND

    def proxy_to_backend(self, method: str):
        target_url = f"https://127.0.0.1:8012{self.path}"
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length")}
        
        body = None
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > 0:
            body = self.rfile.read(content_length)

        try:
            req = urllib.request.Request(target_url, data=body, headers=headers, method=method)
            with urllib.request.urlopen(req, context=ssl_ctx, timeout=30) as resp:
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() not in ("transfer-encoding", "content-encoding"):
                        self.send_header(k, v)
                self.end_headers()
                while True:
                    chunk = resp.read(8192)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        break
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in ("transfer-encoding", "content-encoding"):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            try:
                self.send_response(502)
                self.end_headers()
                self.wfile.write(f"Backend proxy error: {e}".encode("utf-8"))
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
        print(f"🔒 Serveur Web HTTPS multithread actif sur https://0.0.0.0:{port}", flush=True)
    else:
        print(f"🌐 Serveur Web HTTP multithread actif sur http://0.0.0.0:{port}", flush=True)
    
    server.serve_forever()

if __name__ == "__main__":
    main()
