import { formatChineseNumber, uniqueValues } from "../../shared/formatters.js";

export function createRewritePreviewOutputs(notes) {
  if (!notes.length) {
    const emptyMessage = `<p class="empty">请先选择至少 1 条素材，再生成二创内容。</p>`;

    return {
      article: emptyMessage,
      video: emptyMessage,
      brief: emptyMessage,
    };
  }

  const previewMessage = `<p class="empty">已选择 ${notes.length} 条素材。请填写二创方向后点击“生成二创”，系统才会请求模型生成文章和视频脚本。</p>`;

  return {
    article: previewMessage,
    video: previewMessage,
    brief: buildOperationBrief(notes),
  };
}

export async function generateRewriteOutputs(notes, rewriteOptions) {
  const response = await fetch("/api/rewrite", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      notes,
      options: rewriteOptions,
    }),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "二创生成失败");
  }

  return payload.outputs;
}

export function extractDiscoveryInsights(notes) {
  return {
    pains: uniqueValues(notes.map((note) => note.pain)).slice(0, 2).join("；"),
    methods: uniqueValues(notes.map((note) => note.method)).slice(0, 2).join("；"),
    hooks: uniqueValues(notes.map((note) => note.hook)).slice(0, 2).join("；"),
  };
}

function buildOperationBrief(notes) {
  const totalLikes = notes.reduce((sum, note) => sum + note.likes, 0);
  const totalSaves = notes.reduce((sum, note) => sum + note.saves, 0);
  const tags = uniqueValues(notes.flatMap((note) => note.tags)).slice(0, 8);

  return `
    <h3 class="draft-title">运营简报</h3>
    <ul>
      <li><strong>已选素材：</strong>${notes.length} 条，合计 ${formatChineseNumber(totalLikes)} 赞、${formatChineseNumber(totalSaves)} 收藏。</li>
      <li><strong>高潜主题：</strong>${tags.map((tag) => `#${tag}`).join(" ")}</li>
      <li><strong>内容机会：</strong>“避雷 + 快手方案 + 真实记录”组合最适合二创，既有冲突也有可执行方法。</li>
      <li><strong>发布建议：</strong>先发图文清单测试收藏率，再用视频脚本复用同一套观点测试完播率。</li>
      <li><strong>合规提醒：</strong>保留事实洞察，重写结构、案例、标题和表达，不使用原作者图片、字幕和完整文案。</li>
    </ul>
  `;
}
