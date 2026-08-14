import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generateRewriteOutputs } from "./content-rewrite-generator.js";
import { loadLocalEnv } from "./env-loader.js";
import { collectXhsNotesFromChrome } from "./xhs-chrome-collector.js";
import { parseBoundedInteger, parsePositiveInteger } from "../app/shared/number-utils.js";

const PORT = Number(process.env.PORT || 3001);
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP_ROOT = join(PROJECT_ROOT, "app");

loadLocalEnv(PROJECT_ROOT);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname === "/api/search") {
      await handleSearchRequest(requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/xhs-image") {
      await handleXhsImageRequest(requestUrl, response);
      return;
    }

    if (requestUrl.pathname === "/api/rewrite") {
      await handleRewriteRequest(request, response);
      return;
    }

    await serveStaticFile(requestUrl.pathname, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error.message || "服务器处理失败",
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Content assistant running at http://127.0.0.1:${PORT}`);
});

async function handleRewriteRequest(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "只支持 POST 请求" });
    return;
  }

  const body = await readJsonBody(request);
  const notes = Array.isArray(body.notes) ? body.notes : [];
  const options = body.options || {};

  if (!notes.length) {
    sendJson(response, 400, { error: "请先选择至少 1 条素材，再生成二创内容。" });
    return;
  }

  const outputs = await generateRewriteOutputs({ notes, options });
  sendJson(response, 200, { outputs });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleSearchRequest(requestUrl, response) {
  const keyword = requestUrl.searchParams.get("keyword")?.trim();
  const contentType = requestUrl.searchParams.get("type") || "all";
  const minLikes = parsePositiveInteger(requestUrl.searchParams.get("minLikes"));
  const targetCount = parseBoundedInteger(requestUrl.searchParams.get("targetCount"), 50, 1, 100);

  if (!keyword) {
    sendJson(response, 400, { error: "请输入选题关键词" });
    return;
  }

  const notes = await collectXhsNotesFromChrome({ keyword, contentType, minLikes, targetCount });

  sendJson(response, 200, {
    source: "xhs-chrome-session",
    meta: notes.meta || {},
    notes,
  });
}

async function handleXhsImageRequest(requestUrl, response) {
  const rawImageUrl = requestUrl.searchParams.get("url");

  if (!rawImageUrl) {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Missing image url");
    return;
  }

  let imageUrl;
  try {
    imageUrl = new URL(rawImageUrl);
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Invalid image url");
    return;
  }

  if (!isAllowedXhsImageHost(imageUrl.hostname)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Unsupported image host");
    return;
  }

  const upstream = await fetch(imageUrl.href, {
    headers: {
      "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "referer": "https://www.xiaohongshu.com/",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });

  if (!upstream.ok) {
    response.writeHead(upstream.status, { "content-type": "text/plain; charset=utf-8" });
    response.end("Image request failed");
    return;
  }

  response.writeHead(200, {
    "cache-control": "public, max-age=86400",
    "content-type": upstream.headers.get("content-type") || "image/webp",
  });

  const body = Buffer.from(await upstream.arrayBuffer());
  response.end(body);
}

function isAllowedXhsImageHost(hostname) {
  return /(^|\.)xhscdn\.com$/i.test(hostname);
}

async function serveStaticFile(pathname, response) {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(APP_ROOT, safePath);

  if (!filePath.startsWith(APP_ROOT) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
