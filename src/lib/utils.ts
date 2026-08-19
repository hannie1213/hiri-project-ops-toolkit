import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 将 Date 格式化为 YYYY-MM-DD（本地时区） */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 解析 YYYY-MM-DD / YYYY/MM/DD / 中文日期 为 Date（本地时区零点），失败返回 null */
export function parseDate(input: string | Date | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  const s = String(input).trim();
  if (!s) return null;
  // 中文日期：2026年8月10日 / 2026年8月
  let m = s.match(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // 标准/常见分隔
  m = s.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Excel 序列号（整数）
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Excel 日期列中常见的空值或阶段说明，不应被判定为日期格式错误。 */
export function isBlankDateMarker(input: string | null | undefined): boolean {
  const value = String(input ?? "").trim().replace(/\s+/g, "");
  if (!value) return true;
  return /^(?:[-—/]|无|暂无|待定|未定|待补|待填写|未填写|未计划|未排期|未完成|未验收|进行中|在建|计划中|施工中|调试中|试运行中|待验收|不涉及|无需)$/.test(value);
}

/** 将 Date 格式化为 M.D（如 8.10） */
export function fmtShortDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const m = date.getMonth() + 1;
  const day = date.getDate();
  return `${m}.${day}`;
}

/** 返回本周（周一）的日期字符串 YYYY-MM-DD */
export function mondayOf(d: Date = new Date()): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay() === 0 ? 7 : date.getDay();
  const diff = day - 1;
  date.setDate(date.getDate() - diff);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day2 = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day2}`;
}

/** 两个日期相差的天数（date - base，按自然日） */
export function diffDays(date: Date, base: Date): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

/** 多 PM 分隔符拆分 */
export function splitPm(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[/／、，,;；\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 随机字符串 */
export function uid(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 10);
}
