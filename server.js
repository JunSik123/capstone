const http = require("http");
const https = require("https");
const path = require("path");
const fs = require("fs");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = __dirname;
const MFDS_REMOTE_BASE =
  "https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService02/getMdcinGrnIdntfcInfoList01";
const PROXY_PREFIX = "/proxy/mfds";

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

function handleProxyRequest(req, res) {
  if (req.method && req.method.toUpperCase() !== "GET") {
    res.writeHead(405, {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    res.end("Method not allowed");
    return;
  }

  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const incomingUrl = new URL(req.url || "", `http://${hostHeader}`);
  const targetUrl = new URL(MFDS_REMOTE_BASE);

  incomingUrl.searchParams.forEach((value, key) => {
    if (value !== undefined && value !== null && value !== "") {
      targetUrl.searchParams.set(key, value);
    }
  });

  if (!targetUrl.searchParams.get("serviceKey")) {
    res.writeHead(400, {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    res.end("Missing serviceKey query parameter");
    return;
  }

  const apiRequest = https.get(targetUrl, (apiResponse) => {
    const headers = {
      "content-type": apiResponse.headers["content-type"] || "application/json; charset=utf-8",
      "cache-control": "no-cache",
      "access-control-allow-origin": "*",
    };
    res.writeHead(apiResponse.statusCode || 502, headers);
    apiResponse.on("error", (error) => {
      if (!res.headersSent) {
        res.writeHead(502, {
          "content-type": "text/plain; charset=utf-8",
          "access-control-allow-origin": "*",
        });
      }
      res.end(`MFDS proxy stream error: ${error.message}`);
    });
    apiResponse.pipe(res);
  });

  apiRequest.on("error", (error) => {
    res.writeHead(502, {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*",
    });
    res.end(`MFDS proxy error: ${error.message}`);
  });

  req.on("aborted", () => {
    apiRequest.destroy();
  });
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url || "/";
  if (rawUrl.startsWith(PROXY_PREFIX)) {
    handleProxyRequest(req, res);
    return;
  }

  const urlPath = decodeURIComponent(rawUrl.split("?")[0]);
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
