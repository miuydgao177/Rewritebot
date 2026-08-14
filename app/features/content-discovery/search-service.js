let currentSearchNotes = [];
let currentSearchMeta = {};
let activeSearchController = null;

export async function searchContentNotes({ keyword, contentType, minLikes, targetCount }) {
  if (activeSearchController) activeSearchController.abort();
  activeSearchController = new AbortController();
  const searchController = activeSearchController;

  const query = new URLSearchParams({
    keyword: keyword.trim(),
    type: contentType,
  });

  if (minLikes) query.set("minLikes", String(minLikes));
  if (targetCount) query.set("targetCount", String(targetCount));

  try {
    const response = await fetch(`/api/search?${query.toString()}`, {
      signal: searchController.signal,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "真实网页搜索失败");
    }

    currentSearchNotes = payload.notes;
    currentSearchMeta = payload.meta || {};
    return currentSearchNotes;
  } finally {
    if (activeSearchController === searchController) activeSearchController = null;
  }
}

export function getContentNotesByIds(noteIds) {
  return currentSearchNotes.filter((note) => noteIds.has(note.id));
}

export function getCurrentSearchMeta() {
  return currentSearchMeta;
}
