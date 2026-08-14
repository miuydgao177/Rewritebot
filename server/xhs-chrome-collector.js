import { WebSocket } from "ws";

const DEVTOOLS_LIST_URL = "http://127.0.0.1:9222/json/list";
const SEARCH_BASE_URL = "https://www.xiaohongshu.com/search_result";
const DEFAULT_WAIT_PATTERN_MS = [7000, 5000, 13000, 8000];
const DEFAULT_TARGET_COUNT = 50;
const DEFAULT_MAX_SCAN_ROUNDS = 60;
const FILTERED_SCAN_MULTIPLIER = 14;
const DEFAULT_SEARCH_TIMEOUT_MS = 120000;
const DEFAULT_FILTERED_SEARCH_TIMEOUT_MS = 240000;
const FAST_FILTER_WAIT_PATTERN_MS = [2500, 3000, 3500, 4500];

export async function collectXhsNotesFromChrome({
  keyword,
  contentType = "all",
  minLikes = null,
  targetCount = DEFAULT_TARGET_COUNT,
  waitPatternMs = DEFAULT_WAIT_PATTERN_MS,
  maxStagnantRounds = 10,
  maxScanRounds = DEFAULT_MAX_SCAN_ROUNDS,
  timeoutMs = DEFAULT_SEARCH_TIMEOUT_MS,
}) {
  let client = await connectToXhsChromeTab(keyword);
  const scanBudget = calculateScanBudget({ targetCount, minLikes, maxScanRounds });
  const stagnantLimit = minLikes ? Math.max(maxStagnantRounds, 36) : maxStagnantRounds;
  const startedAt = Date.now();
  const activeWaitPatternMs = minLikes ? FAST_FILTER_WAIT_PATTERN_MS : waitPatternMs;
  const activeTimeoutMs = minLikes ? Math.max(timeoutMs, DEFAULT_FILTERED_SEARCH_TIMEOUT_MS) : timeoutMs;

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url: buildXhsSearchUrl(keyword, contentType) });
    await client.waitForSearchKeyword(keyword, 12000);
    await client.sleep(2500);

    const seen = new Map();
    const scannedUrls = new Set();
    let patternIndex = 0;
    let stagnantRounds = 0;
    let reconnects = 0;
    let scanRounds = 0;

    while (seen.size < targetCount && stagnantRounds < stagnantLimit && scanRounds < scanBudget && Date.now() - startedAt < activeTimeoutMs) {
      let batch = [];
      try {
        batch = await client.collectNotes();
      } catch (error) {
        if (!isTransientDevtoolsError(error) || reconnects >= 3) throw error;
        client = await reconnectXhsChromeTab(client, keyword);
        reconnects += 1;
        continue;
      }

      scanRounds += 1;
      let newlyScanned = 0;
      let beforeScrollState = null;
      let afterScrollState = null;

      for (const note of batch) {
        if (!scannedUrls.has(note.url)) {
          scannedUrls.add(note.url);
          newlyScanned += 1;
        }

        if (minLikes && parseEngagement(note.engagement) < minLikes) continue;

        if (!seen.has(note.url)) {
          seen.set(note.url, normalizeNote(note, seen.size + 1, keyword));
        }
      }

      if (seen.size >= targetCount) break;

      try {
        beforeScrollState = await client.readFeedState();
      } catch (error) {
        if (!isTransientDevtoolsError(error)) throw error;
      }

      try {
        await client.scrollResults(minLikes ? 6 : 2);
      } catch (error) {
        if (!isTransientDevtoolsError(error) || reconnects >= 3) throw error;
        client = await reconnectXhsChromeTab(client, keyword);
        reconnects += 1;
      }
      try {
        await client.waitForMoreNotes(scannedUrls.size, minLikes ? 4500 : 6500);
      } catch (error) {
        if (!isTransientDevtoolsError(error)) throw error;
      }
      await client.sleep(activeWaitPatternMs[patternIndex % activeWaitPatternMs.length]);
      try {
        afterScrollState = await client.readFeedState();
      } catch (error) {
        if (!isTransientDevtoolsError(error)) throw error;
      }

      stagnantRounds = isFeedStagnant({ newlyScanned, beforeScrollState, afterScrollState }) ? stagnantRounds + 1 : 0;
      patternIndex += 1;
    }

    const notes = [...seen.values()].slice(0, targetCount);
    notes.meta = {
      scannedCount: scannedUrls.size,
      matchedCount: notes.length,
      requestedCount: targetCount,
      minLikes,
      timedOut: Date.now() - startedAt >= activeTimeoutMs,
      scanBudget,
      stagnantLimit,
      elapsedMs: Date.now() - startedAt,
    };
    return notes;
  } finally {
    client.close();
  }
}

function calculateScanBudget({ targetCount, minLikes, maxScanRounds }) {
  if (!minLikes) return maxScanRounds;
  return Math.max(maxScanRounds, targetCount * FILTERED_SCAN_MULTIPLIER, 80);
}

function isFeedStagnant({ newlyScanned, beforeScrollState, afterScrollState }) {
  if (newlyScanned > 0) return false;
  if (!beforeScrollState || !afterScrollState) return true;

  const gainedLinks = afterScrollState.noteLinkCount > beforeScrollState.noteLinkCount;
  const movedDown = afterScrollState.maxScrollTop > beforeScrollState.maxScrollTop + 20;
  const grewPage = afterScrollState.maxScrollHeight > beforeScrollState.maxScrollHeight + 20;
  return !gainedLinks && !movedDown && !grewPage;
}

async function reconnectXhsChromeTab(client, keyword) {
  client.close();
  const nextClient = await connectToXhsChromeTab(keyword);
  await nextClient.send("Page.enable");
  await nextClient.send("Runtime.enable");
  await nextClient.waitForSearchKeyword(keyword, 8000);
  await nextClient.sleep(2500);
  return nextClient;
}

async function connectToXhsChromeTab(keyword) {
  const tab = await findXhsChromeTab(keyword);
  const client = new CdpClient(tab.webSocketDebuggerUrl);
  await client.connect();
  return client;
}

async function findXhsChromeTab(keyword) {
  const tabs = await fetchJson(DEVTOOLS_LIST_URL);
  const normalizedKeyword = normalizeKeyword(keyword);
  const tab =
    tabs.find((item) => item.url.includes("xiaohongshu.com/search_result") && normalizeKeyword(readKeywordFromUrl(item.url)) === normalizedKeyword) ||
    tabs.find((item) => item.url.includes("xiaohongshu.com/search_result")) ||
    tabs.find((item) => item.url.includes("xiaohongshu.com"));

  if (!tab) {
    throw new Error("没有找到已打开的小红书 Chrome 标签页。请先用带远程调试端口的 Chrome 登录小红书。");
  }

  return tab;
}

function readKeywordFromUrl(url) {
  try {
    return new URL(url).searchParams.get("keyword") || "";
  } catch {
    return "";
  }
}

function buildXhsSearchUrl(keyword, contentType) {
  const url = new URL(SEARCH_BASE_URL);
  url.searchParams.set("keyword", keyword);
  if (contentType === "video") url.searchParams.set("type", "61");
  else if (contentType === "image") url.searchParams.set("type", "51");
  return url.href;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`无法连接 Chrome DevTools：${response.status}`);
  }
  return response.json();
}

function normalizeNote(note, id, keyword) {
  const type = inferType(note);

  return {
    id,
    type,
    title: note.title,
    creator: note.creator || "小红书用户",
    likes: parseEngagement(note.engagement),
    saves: 0,
    summary: note.title,
    hook: note.title,
    pain: `用户正在围绕“${keyword}”寻找真实经验、态度或决策参考`,
    method: "从小红书真实搜索结果中提炼标题表达、互动点和内容切入角度",
    tags: [keyword, type === "video" ? "视频素材" : "图文素材", "小红书"],
    sourceUrl: note.url,
    sourceLabel: "已登录小红书页面",
    coverImageUrl: note.coverImageUrl || "",
    publishedAt: note.meta || "",
  };
}

function inferType(note) {
  const text = `${note.title} ${note.meta}`;
  return /视频|vlog|拍摄|镜头|短视频/.test(text) ? "video" : "image";
}

function parseEngagement(value) {
  if (!value) return 0;
  if (value.includes("万") || value.toLowerCase().includes("w")) return Math.round(Number(value.replace(/[万w]/gi, "")) * 10000);
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeKeyword(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function isSearchNoteUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith("xiaohongshu.com") && /\/search_result\/[0-9a-f]+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isTransientDevtoolsError(error) {
  const message = error?.message || "";
  return /Inspected target navigated or closed|Cannot find context|Execution context was destroyed|Chrome DevTools 连接已关闭/i.test(message);
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on("open", resolve);
      this.ws.on("message", (buffer) => {
        const message = JSON.parse(buffer.toString());
        if (message.id && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message));
          else pending.resolve(message.result);
        }
      });
      this.ws.on("error", reject);
      this.ws.on("close", () => {
        for (const { reject } of this.pending.values()) reject(new Error("Chrome DevTools 连接已关闭"));
        this.pending.clear();
      });
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }), (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async scrollResults(repeats = 1) {
    await this.evaluate(`(() => {
      const candidates = [
        window,
        document.scrollingElement,
        document.documentElement,
        document.body,
        ...Array.from(document.querySelectorAll('.feeds-page, .search-layout, .search-layout__main, .feeds-container, [class*=scroll], [class*=container]'))
      ].filter(Boolean);
      const targets = candidates.filter((element) => {
        if (element === window) return true;
        return element.scrollHeight > element.clientHeight + 20;
      });
      const repeats = ${Number(repeats)};
      for (let index = 0; index < repeats; index += 1) {
        const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 900;
        const distance = Math.max(1600, viewportHeight * 1.8);
        window.scrollBy({ top: distance, behavior: 'auto' });
        for (const target of targets) {
          if (target === window) continue;
          target.scrollBy({ top: distance, behavior: 'auto' });
          target.dispatchEvent(new WheelEvent('wheel', { deltaY: distance, bubbles: true }));
        }
        document.dispatchEvent(new WheelEvent('wheel', { deltaY: distance, bubbles: true }));
      }
      return true;
    })()`);
  }

  async readFeedState() {
    return this.evaluate(`(() => {
      const isSearchNoteUrl = ${isSearchNoteUrl.toString()};
      const elements = [
        document.scrollingElement,
        document.documentElement,
        document.body,
        ...Array.from(document.querySelectorAll('.feeds-page, .search-layout, .search-layout__main, .feeds-container, [class*=scroll], [class*=container]'))
      ].filter(Boolean);
      const maxScrollTop = Math.max(window.scrollY || 0, ...elements.map((element) => element.scrollTop || 0));
      const maxScrollHeight = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0, ...elements.map((element) => element.scrollHeight || 0));
      const noteLinkCount = new Set(Array.from(document.querySelectorAll('a[href]')).map((a) => a.href || '').filter((href) => isSearchNoteUrl(href))).size;
      return { maxScrollTop, maxScrollHeight, noteLinkCount };
    })()`);
  }

  async waitForMoreNotes(previousCount, timeoutMs) {
    await this.evaluate(`new Promise((resolve) => {
      const isSearchNoteUrl = ${isSearchNoteUrl.toString()};
      const countLinks = () => new Set(Array.from(document.querySelectorAll('a[href]')).map((a) => a.href || '').filter((href) => isSearchNoteUrl(href))).size;
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (countLinks() > ${previousCount} || Date.now() - startedAt > ${timeoutMs}) {
          clearInterval(timer);
          resolve(true);
        }
      }, 500);
    })`);
  }

  async waitForSearchKeyword(keyword, timeoutMs) {
    const expectedKeyword = JSON.stringify(normalizeKeyword(keyword));
    const matched = await this.evaluate(`new Promise((resolve) => {
      const normalizeKeyword = ${normalizeKeyword.toString()};
      const expected = ${expectedKeyword};
      const startedAt = Date.now();
      const readVisibleKeyword = () => {
        const urlKeyword = new URL(location.href).searchParams.get('keyword') || '';
        const inputKeyword = Array.from(document.querySelectorAll('input'))
          .map((input) => input.value || input.getAttribute('value') || '')
          .find(Boolean) || '';
        return normalizeKeyword(urlKeyword || inputKeyword);
      };
      const timer = setInterval(() => {
        const current = readVisibleKeyword();
        if (current === expected || Date.now() - startedAt > ${timeoutMs}) {
          clearInterval(timer);
          resolve(current === expected);
        }
      }, 300);
    })`);

    if (!matched) {
      throw new Error(`小红书页面没有切换到关键词“${keyword}”，已停止读取旧页面结果。`);
    }
  }

  async collectNotes() {
    const result = await this.evaluate(`(() => {
      const isSearchNoteUrl = ${isSearchNoteUrl.toString()};
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => {
          const href = a.href || '';
          const text = (a.innerText || a.textContent || '').replace(/\\s+/g, ' ').trim();
          return { href, text, node: a };
        })
        .filter(({ href }) => isSearchNoteUrl(href));

      const results = [];
      const seen = new Set();
      for (const item of links) {
        if (seen.has(item.href)) continue;
        seen.add(item.href);

        const card = item.node.closest('section, article, .note-item, .feed-card, .card, [class*="note"], [class*="feed"]') || item.node.closest('div') || item.node;
        const cardText = card.innerText || item.text;
        const lines = cardText.split('\\n').map((line) => line.trim()).filter(Boolean);
        const creator = lines.find((line) => line.startsWith('@')) || '';
        const engagement = extractLikeText(cardText, lines);
        const title =
          card.querySelector('[class*="title"]')?.textContent?.trim() ||
          pickBestTitleLine(lines) ||
          item.text ||
          '';
        const coverImageUrl = Array.from(card.querySelectorAll('img'))
          .map((img) => img.currentSrc || img.src || img.getAttribute('src') || '')
          .find((src) => src.includes('xhscdn.com') && !src.includes('sns-avatar') && !src.includes('formula-static')) || '';

        results.push({
          title: title || '未提取到标题的小红书笔记',
          creator,
          meta: '',
          engagement,
          url: item.href,
          coverImageUrl
        });
      }
      return results.filter((note) => note.title && note.title !== '大家都在搜');

      function extractLikeText(text, lines) {
        const matches = Array.from(text.matchAll(/([\\d.]+\\s*万?|[\\d.]+w)\\s*赞/gi));
        const explicitLike = matches.at(-1)?.[1]?.replace(/\\s+/g, '') || '';
        if (explicitLike) return explicitLike;

        const compactLines = lines.filter((line) => !/^\\d{2}-\\d{2}$/.test(line));
        const numericLine = compactLines.findLast((line) => /^[\\d.]+\\s*(万|w)?$/i.test(line));
        return numericLine?.replace(/\\s+/g, '') || '';
      }

      function isLikelyTitleLine(line) {
        if (!line || line.length < 2) return false;
        if (line === '图文' || line === '视频') return false;
        if (line.startsWith('@')) return false;
        if (/^[\\d.]+\\s*(万|w)?\\s*赞/.test(line)) return false;
        if (/收藏|查看来源|已登录|小红书/.test(line)) return false;
        return true;
      }

      function pickBestTitleLine(lines) {
        return lines
          .filter((line) => isLikelyTitleLine(line))
          .sort((a, b) => b.length - a.length)[0] || '';
      }
    })()`);

    return result || [];
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    return result.result.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}
