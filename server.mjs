import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const HOST = "127.0.0.1";
const PORT = 4173;
const ROOT = process.cwd();
const UPSTREAM = "https://api.simcotools.com";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(body);
}

function getFilePath(urlPath) {
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  return join(ROOT, safePath);
}

async function proxyApi(request, response) {
  const upstreamUrl = `${UPSTREAM}${request.url.slice("/api".length)}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
    });
    const body = await upstreamResponse.arrayBuffer();

    response.writeHead(upstreamResponse.status, {
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(Buffer.from(body));
  } catch (error) {
    sendJson(response, 502, {
      error: "Failed to reach SimCoTools API",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function serveStatic(request, response) {
  const filePath = getFilePath(new URL(request.url, `http://${HOST}:${PORT}`).pathname);

  if (!existsSync(filePath)) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    if (request.method === "HEAD") {
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
      });
      response.end();
      return;
    }

    await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch (error) {
    sendJson(response, 500, {
      error: "Failed to read file",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (!["GET", "HEAD"].includes(request.method || "")) {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (request.url === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url.startsWith("/api/")) {
    await proxyApi(request, response);
    return;
  }

  await serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Serving dashboard proxy at http://${HOST}:${PORT}`);
  console.log(`API proxy active at http://${HOST}:${PORT}/api`);
});
