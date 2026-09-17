/** Prices are stored as integer RMB yuan; render them as compact 万元 amounts. */
export function formatPriceCents(yuan: number): string {
  if (yuan >= 10000) {
    const wan = yuan / 10000;
    return `${wan.toFixed(wan % 1 === 0 ? 0 : 2)} 万元`;
  }
  return `${yuan} 元`;
}

export function formatDateTime(value: string | undefined | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
