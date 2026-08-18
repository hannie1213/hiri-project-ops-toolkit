"use client";

// 周报合并/导出纯函数（从原 weekly/merge API 路由迁移，去掉 Prisma 依赖）

import { fmtDate, fmtShortDate } from "@/lib/utils";
import { TEAMS, TEAM_LABEL, type TeamKey, type WeeklyReport } from "@/lib/store";

const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

type ReportRow = {
  staff: { name: string; team: TeamKey };
  content: string;
  planned: string | null;
  issues: string | null;
};

function pad(value: string): string {
  return value.trim().replace(/\n+/g, "\n").replace(/^/gm, "  ");
}

function weekRangeShort(weekKey: string): string {
  const start = new Date(weekKey + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${fmtShortDate(start)}-${fmtShortDate(end)}`;
}

function weekRangeCompact(weekKey: string): string {
  const start = new Date(weekKey + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${fmtDate(start).replace(/-/g, "")}-${fmtDate(end).replace(/-/g, "")}`;
}

function buildTeamText(team: TeamKey, weekKey: string, reports: ReportRow[]): string {
  const lines: string[] = [];
  const range = weekRangeShort(weekKey);
  lines.push(`【${TEAM_LABEL[team]}周报】(${range})`);
  lines.push("");
  for (const r of reports) {
    lines.push(`【${r.staff.name}】`);
    if (r.content.trim()) {
      lines.push("本周工作：");
      lines.push(pad(r.content));
    }
    if (r.planned?.trim()) {
      lines.push("下周计划：");
      lines.push(pad(r.planned));
    }
    if (r.issues?.trim()) {
      lines.push("问题风险：");
      lines.push(pad(r.issues));
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export interface MergeResult {
  weekKey: string;
  submitted: number;
  teamTexts: Record<string, string>;
  allText: string;
  fileName: string;
}

/** 实时生成三组 + 全部合并文本（管理员本地维护的周报） */
export function buildMerge(weekKey: string, reports: WeeklyReport[]): MergeResult {
  const byTeam = new Map<TeamKey, ReportRow[]>();
  for (const t of TEAMS) byTeam.set(t, []);

  const rows: ReportRow[] = reports.map((r) => ({
    staff: { name: r.memberName, team: r.team },
    content: r.content,
    planned: r.planned,
    issues: r.issues,
  }));

  for (const r of rows) {
    if (TEAMS.includes(r.staff.team)) byTeam.get(r.staff.team)!.push(r);
  }

  const teamTexts: Record<string, string> = {};
  for (const t of TEAMS) {
    teamTexts[t] = buildTeamText(t, weekKey, byTeam.get(t) || []);
  }
  const allText = TEAMS.map((t) => teamTexts[t]).filter((x) => x.length > 0).join("\n\n");

  return {
    weekKey,
    submitted: rows.length,
    teamTexts,
    allText,
    fileName: `周报合并(${weekRangeCompact(weekKey)}).txt`,
  };
}

export function isValidWeekKey(weekKey: string): boolean {
  return WEEK_KEY_RE.test(weekKey);
}

export function mergeFileName(weekKey: string): string {
  return `周报合并(${weekRangeCompact(weekKey)}).txt`;
}

/** 触发浏览器下载文本文件 */
export function downloadText(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
