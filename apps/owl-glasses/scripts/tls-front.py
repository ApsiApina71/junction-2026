"""A local https front for owl-api, for the simulator fallback (JUN-109).

The glasses' video player plays clips over https only, also in the simulator, while owl-api
runs on plain http on the laptop. This forwards https://localhost:<port> to the owl-api URL,
unchanged, with a certificate from a CA that only the simulator trusts.

    python3 tls-front.py <cert.pem> <key.pem> <port> <owl-api url>
"""

import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ssl

CERT, KEY, PORT, UPSTREAM = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4].rstrip("/")
SKIP = {"host", "content-length", "accept-encoding", "connection"}


class Front(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _forward(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in SKIP}
        request = urllib.request.Request(UPSTREAM + self.path, data=body, headers=headers, method=self.command)
        try:
            response = urllib.request.urlopen(request, timeout=120)
            status, data, reply = response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            status, data, reply = error.code, error.read(), error.headers
        except OSError as error:
            status, data, reply = 502, f"owl-api not reachable: {error}".encode(), None
        self.send_response(status)
        for key, value in (reply.items() if reply else []):
            if key.lower() not in ("content-length", "transfer-encoding", "connection"):
                self.send_header(key, value)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = _forward

    def log_message(self, *args) -> None:
        pass


server = ThreadingHTTPServer(("127.0.0.1", PORT), Front)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(CERT, KEY)
server.socket = context.wrap_socket(server.socket, server_side=True)
print(f"https://localhost:{PORT} -> {UPSTREAM}", flush=True)
server.serve_forever()
