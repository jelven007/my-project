const priceFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** Server prices are integer RMB yuan; render them as compact 万元 amounts. */
export function formatPrice(yuan: number): string {
  if (yuan >= 10000) {
    const wan = yuan / 10000;
    return `${wan.toFixed(wan % 1 === 0 ? 0 : 2)} 万元`;
  }
  return priceFormatter.format(yuan);
}

export function formatDateTime(value: string | Date | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const orderStatusLabels: Record<string, string> = {
  pending_confirmation: "待确认",
  confirmed: "已确认",
  cancelled: "已取消",
  expired: "已过期",
  completed: "已完成",
};

export function orderStatusLabel(status: string): string {
  return orderStatusLabels[status] ?? status;
}

const testDriveStatusLabels: Record<string, string> = {
  submitted: "已提交",
  contacted: "已联系",
  scheduled: "已排期",
  completed: "已完成",
  cancelled: "已取消",
};

export function testDriveStatusLabel(status: string): string {
  return testDriveStatusLabels[status] ?? status;
}
