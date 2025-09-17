const http = require("http");
const path = require("path");
const fs = require("fs");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function resolveFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      if (fs.existsSync(indexPath)) {
        return indexPath;
      }
      return null;
    }
    return filePath;
  } catch (error) {
    return null;
  }
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let relativePath = urlPath;
  if (relativePath.endsWith("/")) {
    relativePath = path.join(relativePath, "index.html");
  }
  if (relativePath.startsWith("..")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = path.join(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const resolved = resolveFile(filePath);
  if (!resolved) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-cache",
  });

  const stream = fs.createReadStream(resolved);
  stream.on("error", (error) => {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Server error: ${error.message}`);
  });
  stream.pipe(res);
});

server.listen(PORT, () => {
  console.log(`Static server running at http://localhost:${PORT}`);
});
