import { renderDiscoveryInsights, renderSearchResults } from "./features/content-discovery/discovery-view.js";
import { getContentNotesByIds, getCurrentSearchMeta, searchContentNotes } from "./features/content-discovery/search-service.js";
import { createRewritePreviewOutputs, extractDiscoveryInsights, generateRewriteOutputs as requestRewriteOutputs } from "./features/content-rewrite/rewrite-service.js";
import { parseBoundedInteger, parsePositiveInteger } from "./shared/number-utils.js";

const appState = {
  contentType: "all",
  selectedNoteIds: new Set(),
  currentNotes: [],
};

const elements = {
  topicInput: document.querySelector("#topic"),
  minLikesInput: document.querySelector("#minLikes"),
  targetCountInput: document.querySelector("#targetCount"),
  audienceSelect: document.querySelector("#audience"),
  toneSelect: document.querySelector("#tone"),
  contentModeSelect: document.querySelector("#contentMode"),
  storyBriefInput: document.querySelector("#storyBrief"),
  styleGuideInput: document.querySelector("#styleGuide"),
  angleInput: document.querySelector("#angle"),
  searchResults: document.querySelector("#results"),
  discoveryInsights: document.querySelector("#insights"),
  resultCount: document.querySelector("#resultCount"),
  selectedCount: document.querySelector("#selectedCount"),
  outputPanel: document.querySelector(".output-panel"),
  outputDocs: {
    article: document.querySelector("#articleDoc"),
    video: document.querySelector("#videoDoc"),
    brief: document.querySelector("#briefDoc"),
  },
};

function readSearchFilters() {
  return {
    keyword: elements.topicInput.value,
    contentType: appState.contentType,
    minLikes: parsePositiveInteger(elements.minLikesInput.value),
    targetCount: parseBoundedInteger(elements.targetCountInput.value, 50, 1, 100),
  };
}

function readRewriteOptions() {
  return {
    topic: elements.topicInput.value.trim() || "社媒选题",
    audience: elements.audienceSelect.value.trim() || "默认目标人群",
    tone: elements.toneSelect.value,
    contentMode: elements.contentModeSelect.value,
    storyBrief: elements.storyBriefInput.value,
    styleGuide: elements.styleGuideInput.value,
    angle: elements.angleInput.value,
  };
}

async function renderContentDiscovery() {
  setSearchLoadingState();

  try {
    const notes = await searchContentNotes(readSearchFilters());
    appState.currentNotes = notes;
    appState.selectedNoteIds = new Set(notes.slice(0, 3).map((note) => note.id));

    elements.resultCount.textContent = formatResultCount(notes.length, getCurrentSearchMeta());
    elements.selectedCount.textContent = `${appState.selectedNoteIds.size} 已选`;
    renderDiscoveryInsights(elements.discoveryInsights, extractDiscoveryInsights(getContentNotesByIds(appState.selectedNoteIds)));
    renderSearchResults(elements.searchResults, notes, appState.selectedNoteIds);
    renderRewriteOutputs();
  } catch (error) {
    appState.currentNotes = [];
    appState.selectedNoteIds = new Set();
    elements.resultCount.textContent = "搜索失败";
    elements.selectedCount.textContent = "0 已选";
    renderDiscoveryInsights(elements.discoveryInsights, extractDiscoveryInsights([]));
    elements.searchResults.innerHTML = `<p class="empty"><strong>真实网页搜索没有完成。</strong><br>${formatSearchErrorMessage(error)}</p>`;
    renderRewriteOutputs();
  }
}

function formatSearchErrorMessage(error) {
  const message = error?.message || "未知错误";
  if (/关键词/.test(message)) return message;
  if (/时间上限/.test(message) || /扫描上限/.test(message) || /继续下拉中断/.test(message)) return message;
  if (/没有找到已打开的小红书 Chrome 标签页/.test(message)) return "没有检测到已登录的小红书 Chrome 页面，请先打开搜索结果页后再试。";
  return `采集过程中断：${message}`;
}

function renderCurrentDiscovery() {
  const selectedNotes = getContentNotesByIds(appState.selectedNoteIds);
  const insightSource = selectedNotes.length ? selectedNotes : appState.currentNotes;

  elements.resultCount.textContent = `${appState.currentNotes.length} 条素材`;
  elements.selectedCount.textContent = `${appState.selectedNoteIds.size} 已选`;
  renderDiscoveryInsights(elements.discoveryInsights, extractDiscoveryInsights(insightSource));
  renderSearchResults(elements.searchResults, appState.currentNotes, appState.selectedNoteIds);
}

function formatResultCount(noteCount, meta = {}) {
  const parts = [`${noteCount} 条素材`];
  if (meta.scannedCount) parts.push(`扫描 ${meta.scannedCount} 条`);
  if (meta.requestedCount && noteCount < meta.requestedCount) parts.push(`未满 ${meta.requestedCount} 条`);
  if (meta.scanBudget && meta.scannedCount >= meta.scanBudget) parts.push("已到扫描上限");
  else if (meta.stagnantLimit && meta.scannedCount && meta.matchedCount < meta.requestedCount && meta.elapsedMs) parts.push("继续下拉中断");
  if (meta.timedOut) parts.push("已到时间上限");
  return parts.join(" / ");
}

function renderRewriteOutputs() {
  const selectedNotes = getContentNotesByIds(appState.selectedNoteIds);
  const outputs = createRewritePreviewOutputs(selectedNotes);

  setOutputDocs(outputs);
}

async function generateAndShowOutputs() {
  const selectedNotes = getContentNotesByIds(appState.selectedNoteIds);
  if (!selectedNotes.length) {
    renderRewriteOutputs();
    elements.outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  setRewriteLoadingState();
  elements.outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const outputs = await requestRewriteOutputs(selectedNotes, readRewriteOptions());
    setOutputDocs(outputs);
  } catch (error) {
    const message = `<p class="empty"><strong>二创生成没有完成。</strong><br>${formatRewriteErrorMessage(error)}</p>`;
    setOutputDocs({
      article: message,
      video: message,
      brief: message,
    });
  }
}

function formatRewriteErrorMessage(error) {
  if (/terminated|timeout|aborted|fetch failed/i.test(error.message || "")) return "模型接口连接中断或超时，请重新点击生成。";
  return error.message;
}

function setRewriteLoadingState() {
  const message = `<p class="empty">正在根据已选真实素材、故事设定和文风要求生成新内容。</p>`;
  setOutputDocs({
    article: message,
    video: message,
    brief: message,
  });
}

function setOutputDocs(outputs) {
  elements.outputDocs.article.innerHTML = outputs.article;
  elements.outputDocs.video.innerHTML = outputs.video;
  elements.outputDocs.brief.innerHTML = outputs.brief;
}

function toggleSelectedNote(noteId) {
  if (appState.selectedNoteIds.has(noteId)) {
    appState.selectedNoteIds.delete(noteId);
  } else {
    appState.selectedNoteIds.add(noteId);
  }
}

function setSearchLoadingState() {
  elements.resultCount.textContent = "搜索中";
  elements.searchResults.innerHTML = `<p class="empty">正在调用已登录 Chrome 的小红书页面并提取真实内容，请稍候。</p>`;
  elements.discoveryInsights.innerHTML = `
    <div class="insight-card"><span>高频痛点</span><strong>等待真实搜索结果</strong></div>
    <div class="insight-card"><span>可复用表达</span><strong>等待真实搜索结果</strong></div>
    <div class="insight-card"><span>高点击开头</span><strong>等待真实搜索结果</strong></div>
  `;
}

function bindSearchEvents() {
  document.querySelector("#searchBtn").addEventListener("click", renderContentDiscovery);

  elements.topicInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderContentDiscovery();
  });

  elements.minLikesInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderContentDiscovery();
  });

  elements.targetCountInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") renderContentDiscovery();
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((segment) => segment.classList.remove("active"));
      button.classList.add("active");
      appState.contentType = button.dataset.type;
      renderContentDiscovery();
    });
  });

  elements.searchResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-select]");
    if (!button) return;

    toggleSelectedNote(Number(button.dataset.select));
    renderCurrentDiscovery();
    renderRewriteOutputs();
  });
}

function bindRewriteEvents() {
  document.querySelector("#generateBtn").addEventListener("click", generateAndShowOutputs);
  document.querySelector("#quickGenerateBtn").addEventListener("click", generateAndShowOutputs);

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      Object.values(elements.outputDocs).forEach((doc) => doc.classList.remove("active"));
      button.classList.add("active");
      elements.outputDocs[button.dataset.tab].classList.add("active");
    });
  });
}

function startContentAssistant() {
  bindSearchEvents();
  bindRewriteEvents();
  renderRewriteOutputs();
  elements.discoveryInsights.innerHTML = `
    <div class="insight-card"><span>高频痛点</span><strong>输入关键词后开始分析</strong></div>
    <div class="insight-card"><span>可复用方法</span><strong>输入关键词后开始分析</strong></div>
    <div class="insight-card"><span>高点击开头</span><strong>输入关键词后开始分析</strong></div>
  `;
  elements.searchResults.innerHTML = `<p class="empty">输入关键词并点击搜索，系统会从已登录 Chrome 的小红书页面采集真实内容。</p>`;
}

startContentAssistant();
