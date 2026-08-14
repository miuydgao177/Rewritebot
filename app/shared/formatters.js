export function formatChineseNumber(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return String(value);
}

export function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}
