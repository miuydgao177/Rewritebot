import { buildModelCandidates, getModelProvider } from "./model-provider.js";
import { buildRewritePrompt } from "./rewrite-prompt.js";

export async function generateRewriteOutputs({ notes, options }) {
  const provider = getModelProvider();
  if (!provider) throw new Error("二创生成未激活：请先配置 DEEPSEEK_API_KEY、OPENROUTER_API_KEY 或 OPENAI_API_KEY，然后重启本地服务。");

  const outputs = await requestModelCompletion(provider, notes, options);
  return normalizeRewriteOutputs(outputs);
}

async function requestModelCompletion(provider, notes, options) {
  const models = buildModelCandidates(provider);
  let lastError = null;

  for (const model of [...new Set(models)]) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const payload = await requestModelCompletionWithModel(provider, model, notes, options);
        const outputs = parseRewriteContent(readCompletionContent(payload));
        validateRewriteOutputs(outputs);
        return outputs;
      } catch (error) {
        lastError = error;
        if (!isRetryableModelError(error)) throw normalizeModelError(error);
        await sleep(900 * attempt);
      }
    }
  }

  throw normalizeModelError(lastError || new Error("模型生成失败"));
}

function validateRewriteOutputs(outputs) {
  if (!isUsefulArticle(outputs.article)) {
    throw new Error("模型返回内容过短或结构不完整，请重新生成。");
  }
}

function readCompletionContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("模型没有返回正文内容，请重新生成。");
  }

  return content;
}

async function requestModelCompletionWithModel(provider, model, notes, options) {
  const timeoutSignal = AbortSignal.timeout(90000);
  const response = await fetch(provider.url, {
    method: "POST",
    signal: timeoutSignal,
    headers: {
      ...provider.headers,
      "authorization": `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 1200,
      ...provider.extraBody,
      messages: [
        {
          role: "system",
          content: "你是成熟的小红书成稿写手。只输出最终成稿，不输出分析过程、推理过程、提示词复述、规则讨论或安全标签。你的交付物必须是可以直接发布或直接拍摄的完成稿，不是内容总结、选题分析、创作思路或运营框架。你不编造亲身经历、产品参数、价格、效果、测试结果、用户身份或未提供的具体场景。",
        },
        {
          role: "user",
          content: buildRewritePrompt(notes, options),
        },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.error || "模型生成失败");
  }

  return payload;
}

function isRetryableModelError(error) {
  return /provider returned error|rate limit|temporarily|overloaded|terminated|timeout|aborted|fetch failed|socket|network|unavailable for free|paid version|model.*unavailable|no endpoints|没有返回正文|内容过短|结构不完整|没有按要求返回|没有返回可用|分析过程/i.test(error.message || "");
}

function normalizeModelError(error) {
  const message = error?.message || "";
  if (/terminated|timeout|aborted|fetch failed|socket|network/i.test(message)) {
    return new Error("模型接口连接中断或超时，请稍后重试，或换成更稳定的模型配置。");
  }

  if (/provider returned error|rate limit|temporarily|overloaded/i.test(message)) {
    return new Error("模型服务暂时不可用，请重新生成；如果配置了备用模型，系统会自动继续尝试。");
  }

  return error;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRewriteContent(content) {
  const cleanedContent = sanitizeModelHtml(content);
  if (isBoilerplateOnly(cleanedContent)) {
    return {
      article: "<p class=\"empty\">模型没有返回可用的文章二创，请重新生成。</p>",
      video: "<p class=\"empty\">模型没有返回可用的视频脚本，请重新生成。</p>",
      brief: "<p class=\"empty\">模型没有返回可用的运营简报，请重新生成。</p>",
    };
  }
  const article = extractSection(cleanedContent, "ARTICLE", "VIDEO");
  const video = extractSection(cleanedContent, "VIDEO", "BRIEF");
  const brief = extractSection(cleanedContent, "BRIEF");

  if (article || video || brief) {
    if (looksLikeAnalysisDump(article || video || brief)) {
      return {
        article: "<p class=\"empty\">模型返回了分析过程，不是成稿，请重新生成。</p>",
        video: "<p class=\"empty\">模型返回了分析过程，不是脚本，请重新生成。</p>",
        brief: "<p class=\"empty\">模型返回了分析过程，不是简报，请重新生成。</p>",
      };
    }

    return {
      article: article ? polishArticleDraft(article) : "<p class=\"empty\">模型没有返回文章二创。</p>",
      video: video || "<p class=\"empty\">模型没有返回视频脚本。</p>",
      brief: brief || "<p class=\"empty\">模型没有返回运营简报。</p>",
    };
  }

  return {
    article: "<p class=\"empty\">模型没有按要求返回文章成稿，请重新生成。</p>",
    video: "<p class=\"empty\">模型没有按要求返回视频脚本，请重新生成。</p>",
    brief: "<p class=\"empty\">模型没有按要求返回运营简报，请重新生成。</p>",
  };
}

function isUsefulArticle(html) {
  const text = stripHtml(String(html || ""));
  return text.length >= 80 && /<h3[\s>]/i.test(html) && /<p[\s>]/i.test(html);
}

function isUsefulVideo(html) {
  const text = stripHtml(String(html || ""));
  return text.length >= 80 && /<ol[\s>]|<ul[\s>]/i.test(html);
}

function isUsefulBrief(html) {
  const text = stripHtml(String(html || ""));
  return text.length >= 40 && /<ul[\s>]|<ol[\s>]/i.test(html);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRewriteOutputs(outputs) {
  return {
    article: isUsefulArticle(outputs.article)
      ? outputs.article
      : "<p class=\"empty\">模型没有返回可用的文章二创，请重新生成。</p>",
    video: isUsefulVideo(outputs.video)
      ? outputs.video
      : "<p class=\"empty\">模型没有返回可用的视频脚本，请切换到视频脚本后重新生成。</p>",
    brief: isUsefulBrief(outputs.brief)
      ? outputs.brief
      : "<p class=\"empty\">模型没有返回可用的运营简报，请重新生成。</p>",
  };
}

function polishArticleDraft(article) {
  return article
    .replace(/<p>\s*<strong>\s*(标题|选题判断|素材分析|创作思路|素材共性|案例拆解)[:：]\s*<\/strong>\s*/g, "<p>")
    .replace(/<strong>\s*(标题|选题判断|素材分析|创作思路|素材共性|案例拆解)[:：]\s*<\/strong>/g, "")
    .replace(/^(标题|选题判断|素材分析|创作思路|素材共性|案例拆解)[:：]\s*/gm, "")
    .replace(/本文/g, "这个故事")
    .replace(/国感/g, "外国人对中国生活的真实感受")
    .replace(/松弛感/g, "让人觉得舒服的感觉")
    .replace(/氛围感/g, "现场给人的感觉")
    .replace(/情绪价值/g, "让人感到被理解和安慰");
}

function sanitizeModelHtml(content) {
  return String(content || "")
    .replace(/```(?:html)?/g, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*User Safety:\s*.*$/gim, "")
    .replace(/^\s*System Safety:\s*.*$/gim, "")
    .replace(/^\s*Model Safety:\s*.*$/gim, "")
    .replace(/^\s*Safety:\s*.*$/gim, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeAnalysisDump(content) {
  const text = String(content || "").toLowerCase();
  if (!text) return true;

  return (
    /the instruction says|we need to|could we|but we can|must not|must be included|let's aim|however/.test(text) &&
    !/</.test(text)
  );
}

function isBoilerplateOnly(content) {
  const normalized = content
    .replace(/^\s*(User|System|Model)\s+Safety:\s*.*$/gim, "")
    .replace(/^\s*Safety:\s*.*$/gim, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return !normalized || normalized === "safe" || normalized === "unsafe" || normalized === "user safety: safe";
}

function extractSection(content, startName, endName) {
  const startToken = `===${startName}===`;
  const startIndex = content.indexOf(startToken);
  if (startIndex === -1) return "";

  const sectionStart = startIndex + startToken.length;
  const endIndex = endName ? content.indexOf(`===${endName}===`, sectionStart) : -1;
  const section = endIndex === -1 ? content.slice(sectionStart) : content.slice(sectionStart, endIndex);
  return section.trim();
}
