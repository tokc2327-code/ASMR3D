// 原型开发服务器：服务本目录静态文件 + 复刻 renderer/server.mjs 的
// /api/materials 与 /media/* 接口，让原型直接使用真实素材库。
// 用法：node design/prototype/dev-server.mjs  →  http://127.0.0.1:4183/
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTOTYPE_DIR = __dirname;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const MATERIALS_DIR = path.join(PROJECT_ROOT, "materials");
const PORT = Number(process.env.PORT || 4183);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[".json"],
  });
  response.end(JSON.stringify(value, null, 2));
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
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? Number(match[1]) : 0;
    const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    response.writeHead(206, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Content-Length": size,
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);

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
    const resolved = safeResolve(MATERIALS_DIR, `/${relativePath}`);
    if (!resolved) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    sendFile(request, response, resolved);
    return;
  }

  const filePath = safeResolve(PROTOTYPE_DIR, url.pathname === "/" ? "/index.html" : url.pathname);
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  sendFile(request, response, filePath);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`asmr3d UI 原型: http://127.0.0.1:${PORT}/`);
});
