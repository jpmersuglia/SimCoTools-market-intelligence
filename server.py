from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json
import ssl


UPSTREAM = "https://api.simcotools.com"


class DashboardHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print("dashboard-proxy:", format % args)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Accept, Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if self.path.startswith("/api/"):
            self.proxy_api()
            return

        super().do_GET()

    def proxy_api(self):
        upstream_path = self.path[len("/api") :]
        url = f"{UPSTREAM}{upstream_path}"
        request = Request(url, headers={"Accept": "application/json"})

        try:
            context = ssl.create_default_context()
            with urlopen(request, timeout=30, context=context) as response:
                body = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
        except HTTPError as error:
            body = error.read()
            self.send_response(error.code)
            self.send_header("Content-Type", error.headers.get("Content-Type", "application/json"))
            self.end_headers()
            self.wfile.write(body)
        except (TimeoutError, URLError, OSError) as error:
            body = json.dumps({"error": str(error)}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 4173), DashboardHandler)
    except OSError as error:
        print(f"Could not start on port 4173: {error}")
        print("Stop the old server with Ctrl+C, then run: python server.py")
        raise

    print("Serving dashboard proxy at http://127.0.0.1:4173")
    print("API proxy active at http://127.0.0.1:4173/api")
    server.serve_forever()


if __name__ == "__main__":
    main()
