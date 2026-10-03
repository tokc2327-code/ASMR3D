import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RENDERER_DIR = path.join(ROOT, "renderer");
const MATERIALS_DIR = path.join(ROOT, "materials");
const MOBILE_DIR = path.join(ROOT, "dist", "asmr3d-v0.1-mobile");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ogg": "audio/ogg",
  ".md": "text/markdown; charset=utf-8",
};

function sendJson(response, status, value) {
  const body = JSON.stringify(value, null, 2);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[".json"],
  });
  response.end(body);
}

function safeResolve(base, requestPath) {
  const resolved = path.resolve(base, `.${requestPath}`);
  return resolved.startsWith(base) ? resolved : null;
}

function sendFile(request, response, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const size = fs.statSync(filePath).size;
  const range = request.headers.range;

  if (range && extension === ".ogg") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : size - 1;
      if (start <= end && end < size) {
        response.writeHead(206, {
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Type": mimeTypes[extension] || "application/octet-stream",
        });
        fs.createReadStream(filePath, { start, end }).pipe(response);
        return;
      }
    }
  }

  response.writeHead(200, {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Length": size,
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/api/materials") {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(MATERIALS_DIR, "manifest.json"), "utf8"),
      );
      sendJson(response, 200, {
        generatedAt: manifest.generatedAt,
        source: manifest.source,
        items: manifest.items.map((item) => ({
          ...item,
          mediaUrl: `/media/${item.file.replace(/^materials\//, "")}`,
        })),
      });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname.startsWith("/media/")) {
    const relativePath = decodeURIComponent(url.pathname.slice("/media/".length));
    const filePath = safeResolve(MATERIALS_DIR, `/${relativePath}`);
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    sendFile(request, response, filePath);
    return;
  }

  if (url.pathname === "/mobile") {
    response.writeHead(302, { Location: "/mobile/" });
    response.end();
    return;
  }

  if (url.pathname.startsWith("/mobile/")) {
    const relativePath = decodeURIComponent(
      url.pathname.slice("/mobile/".length) || "index.html",
    );
    const filePath = safeResolve(MOBILE_DIR, `/${relativePath}`);
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    sendFile(request, response, filePath);
    return;
  }

  if (url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestedPath =
    url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = safeResolve(RENDERER_DIR, requestedPath);
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  sendFile(request, response, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`Step 2 renderer: http://127.0.0.1:${PORT}`);
  console.log(`Mobile package: http://127.0.0.1:${PORT}/mobile/`);
  if (HOST === "0.0.0.0") {
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === "IPv4" && !address.internal) {
          console.log(`LAN: http://${address.address}:${PORT}`);
          console.log(`LAN mobile: http://${address.address}:${PORT}/mobile/`);
        }
      }
    }
  }
});
