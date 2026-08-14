import { formatChineseNumber } from "../../shared/formatters.js";

export function renderDiscoveryInsights(container, insights) {
  container.innerHTML = `
    <div class="insight-card"><span>高频痛点</span><strong>${insights.pains || "暂无素材，请调整关键词"}</strong></div>
    <div class="insight-card"><span>可复用方法</span><strong>${insights.methods || "选择素材后自动归纳"}</strong></div>
    <div class="insight-card"><span>高点击开头</span><strong>${insights.hooks || "等待搜索结果"}</strong></div>
  `;
}

export function renderSearchResults(container, notes, selectedNoteIds) {
  if (!notes.length) {
    container.innerHTML = `<p class="empty">没有抓取到与当前关键词明显相关的小红书结果。请确认小红书页面已切到该关键词，或放宽内容类型、点赞数和采集数量后重试。</p>`;
    return;
  }

  const columns = [[], [], []];
  notes.forEach((note, index) => {
    columns[index % columns.length].push(createNoteCard(note, selectedNoteIds));
  });

  container.innerHTML = columns
    .map((column) => `<div class="masonry-column">${column.join("")}</div>`)
    .join("");
}

function createNoteCard(note, selectedNoteIds) {
  const isSelected = selectedNoteIds.has(note.id);
  const typeText = note.type === "video" ? "视频" : "图文";
  const tags = (note.tags || []).slice(0, 3);
  const coverImage = note.coverImageUrl
    ? `<img class="thumb-image" src="${createImageProxyUrl(note.coverImageUrl)}" alt="${note.title}" loading="lazy">`
    : "";
  const summary = note.summary && note.summary !== note.title ? `<p class="card-summary">${note.summary}</p>` : "";

  return `
    <article class="content-card">
      <div class="thumb ${note.type}">
        ${coverImage}
        <span class="type-badge">${typeText}</span>
      </div>
      <div class="card-body">
        <div class="meta">
          <span>@${note.creator}</span>
          <span>${formatChineseNumber(note.likes)} 赞</span>
          <span>${formatChineseNumber(note.saves)} 收藏</span>
        </div>
        <h3 class="card-title">${note.title}</h3>
        ${summary}
        <div class="tags">${tags.map((tag) => `<span>#${tag}</span>`).join("")}</div>
        <div class="select-row">
          <small class="card-hook">${note.hook}</small>
          <button class="${isSelected ? "selected" : ""}" data-select="${note.id}" type="button">${isSelected ? "已选" : "选择"}</button>
        </div>
        ${note.sourceUrl ? `<a class="source-link" href="${note.sourceUrl}" target="_blank" rel="noreferrer">查看来源：${note.sourceLabel || "已登录小红书页面"}</a>` : ""}
      </div>
    </article>
  `;
}

function createImageProxyUrl(imageUrl) {
  return `/api/xhs-image?url=${encodeURIComponent(imageUrl)}`;
}
