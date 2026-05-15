const http = require("http");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const rootDir = __dirname;
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const liveEndpoints = {
  playoffs: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?seasontype=3&limit=1000",
  standings: "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?sort=winPercent%3Adesc"
};

async function serveFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const content = await fs.readFile(filePath);
  response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
  response.end(content);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function proxyJson(response, url, sourceLabel) {
  const upstream = await fetch(url, {
    headers: {
      "User-Agent": "NBA-Playoff-Pulse/1.0"
    }
  });

  if (!upstream.ok) {
    sendJson(response, upstream.status, { error: `Upstream request failed: ${upstream.status}` });
    return;
  }

  const payload = await upstream.json();
  sendJson(response, 200, { ...payload, source: sourceLabel });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "nba-playoff-prediction",
        host,
        port
      });
      return;
    }

    if (url.pathname === "/api/playoffs") {
      await proxyJson(response, liveEndpoints.playoffs, "ESPN scoreboard");
      return;
    }

    if (url.pathname === "/api/standings") {
      await proxyJson(response, liveEndpoints.standings, "ESPN standings");
      return;
    }

    const safePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const resolvedPath = path.join(rootDir, safePath);
    const relativePath = path.relative(rootDir, resolvedPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    await serveFile(response, resolvedPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Server error: ${error.message}`);
  }
});

function getNetworkUrls() {
  const interfaces = os.networkInterfaces();
  const urls = [];

  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    });
  });

  return urls;
}

server.listen(port, host, () => {
  const networkUrls = getNetworkUrls();
  console.log(`NBA Playoff Prediction is running at http://localhost:${port}`);

  if (networkUrls.length) {
    console.log(`Network access enabled on: ${networkUrls.join(", ")}`);
  }
});
