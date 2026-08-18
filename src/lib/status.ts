export type ProjectStatus = "ACCEPTANCE_LATE" | "ACCEPTANCE_ON_TIME" | "DATE_ISSUE" | "LATE_RISK" | "PENDING_ACTUAL" | "ON_TRACK" | "NOT_STARTED";

export type MilestoneView = {
  id: string; name: string; order: number; plannedDate: Date | null; actualDate: Date | null;
  isAcceptance: boolean; hasDateIssue: boolean; dateIssueReason: string | null;
  isPlannedPassed: boolean; actualMissing: boolean; lateDays: number | null;
  remainingDays: number | null; completedLate: boolean;
};

export type ProjectStatusInfo = {
  status: ProjectStatus; label: string; milestoneStatus: MilestoneView[]; accepted: boolean;
  acceptanceResult: "验收延期完成" | "按时验收" | "尚未验收";
  hasDateIssue: boolean; hasLateRisk: boolean; hasPendingActual: boolean; warning: string | null;
};

const ACCEPTANCE_NAMES = ["验收", "终验", "结题", "竣工验收", "交付验收"];
export function isAcceptanceNode(name: string): boolean { return ACCEPTANCE_NAMES.some((item) => name.includes(item)); }

export function evaluateMilestone(
  m: { id?: string; name: string; order: number; plannedDate: Date | null; actualDate: Date | null; dateIssueReason?: string | null },
  today: Date = new Date()
): MilestoneView {
  const planned = m.plannedDate ? startOfDay(m.plannedDate) : null;
  const actual = m.actualDate ? startOfDay(m.actualDate) : null;
  const base = startOfDay(today);
  const actualMissing = !actual;
  const isPlannedPassed = !!planned && planned.getTime() < base.getTime();
  return {
    id: m.id || `milestone-${m.name}-${m.order}`, name: m.name || "未命名节点", order: m.order,
    plannedDate: planned, actualDate: actual, isAcceptance: isAcceptanceNode(m.name || ""),
    hasDateIssue: !!m.dateIssueReason, dateIssueReason: m.dateIssueReason ?? null,
    isPlannedPassed, actualMissing,
    lateDays: actualMissing && planned && isPlannedPassed ? diffDays(base, planned) : null,
    remainingDays: actualMissing && planned ? diffDays(planned, base) : null,
    completedLate: !!planned && !!actual && actual.getTime() > planned.getTime(),
  };
}

export function evaluateProject(
  milestones: Array<{ id?: string; name: string; order: number; plannedDate: Date | null; actualDate: Date | null; dateIssueReason?: string | null }>,
  today: Date = new Date()
): ProjectStatusInfo {
  const views = milestones.map((m) => evaluateMilestone(m, today));
  const acceptance = views.find((m) => m.isAcceptance);
  const accepted = !!acceptance?.actualDate;
  const hasDateIssue = views.some((m) => m.hasDateIssue);
  if (accepted) {
    const late = !!acceptance?.completedLate;
    return makeResult(late ? "ACCEPTANCE_LATE" : "ACCEPTANCE_ON_TIME", late ? "验收延期完成" : "按时验收", views, true, late ? "验收延期完成" : "按时验收", hasDateIssue, false, false, late && acceptance?.plannedDate ? `验收实际日期晚于计划日期 ${diffDays(acceptance.actualDate!, acceptance.plannedDate)} 天` : null);
  }
  if (hasDateIssue) {
    const issue = views.find((m) => m.hasDateIssue)!;
    return makeResult("DATE_ISSUE", "日期待核对", views, false, "尚未验收", true, false, false, `节点「${issue.name}」：${issue.dateIssueReason}`);
  }
  // 前置节点只有在实际日期已填写且晚于计划日期时才显示风险。
  const lateNodes = views.filter((m) => !m.isAcceptance && m.completedLate);
  if (lateNodes.length) return makeResult("LATE_RISK", "有延期风险", views, false, "尚未验收", false, true, views.some((m) => m.actualMissing), `前置节点${lateNodes.map((m) => `「${m.name}」`).join("、")}实际完成晚于计划；最终延期仍以验收为准`);
  // 计划已过但实际为空只表示待补，不判断为延期。
  const pending = views.find((m) => m.actualMissing && m.plannedDate);
  if (pending) return makeResult("PENDING_ACTUAL", "待补实际日期", views, false, "尚未验收", false, false, true, pending.isPlannedPassed ? `节点「${pending.name}」计划日期已过，待补实际日期（不代表延期）` : `节点「${pending.name}」实际日期待补`);
  if (!views.length || views.every((m) => !m.plannedDate && !m.actualDate)) return makeResult("NOT_STARTED", "正常", views, false, "尚未验收", false, false, false, null);
  return makeResult("ON_TRACK", "正常", views, false, "尚未验收", false, false, false, null);
}

function makeResult(status: ProjectStatus, label: string, milestoneStatus: MilestoneView[], accepted: boolean, acceptanceResult: ProjectStatusInfo["acceptanceResult"], hasDateIssue: boolean, hasLateRisk: boolean, hasPendingActual: boolean, warning: string | null): ProjectStatusInfo {
  return { status, label, milestoneStatus, accepted, acceptanceResult, hasDateIssue, hasLateRisk, hasPendingActual, warning };
}

export function upcomingMilestones(projectStatus: ProjectStatusInfo, today: Date = new Date()): { 7: MilestoneView[]; 14: MilestoneView[]; 30: MilestoneView[]; 60: MilestoneView[]; noPlan: MilestoneView[] } & Record<number, MilestoneView[]> {
  const output = { 7: [], 14: [], 30: [], 60: [], noPlan: [] } as unknown as { 7: MilestoneView[]; 14: MilestoneView[]; 30: MilestoneView[]; 60: MilestoneView[]; noPlan: MilestoneView[] } & Record<number, MilestoneView[]>;
  if (projectStatus.accepted) return output;
  for (const item of projectStatus.milestoneStatus) {
    if (!item.actualMissing) continue;
    if (!item.plannedDate) { output.noPlan.push(item); continue; }
    const days = diffDays(item.plannedDate, startOfDay(today));
    if (days < 0) continue;
    for (const window of [7, 14, 30, 60]) if (days <= window) output[window].push(item);
  }
  return output;
}

export function confirmationMilestones(info: ProjectStatusInfo): MilestoneView[] {
  if (info.accepted) return [];
  return info.milestoneStatus.filter((m) => m.actualMissing && !!m.plannedDate && m.isPlannedPassed);
}

function startOfDay(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function diffDays(a: Date, b: Date): number { return Math.round((a.getTime() - b.getTime()) / 86400000); }

export const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
  ACCEPTANCE_LATE: { badge: "bg-red-100 text-red-700 border-red-300", dot: "bg-red-500", label: "验收延期完成" },
  ACCEPTANCE_ON_TIME: { badge: "bg-green-100 text-green-700 border-green-300", dot: "bg-green-500", label: "按时验收" },
  DATE_ISSUE: { badge: "bg-purple-100 text-purple-700 border-purple-300", dot: "bg-purple-500", label: "日期待核对" },
  LATE_RISK: { badge: "bg-orange-100 text-orange-700 border-orange-300", dot: "bg-orange-500", label: "有延期风险" },
  PENDING_ACTUAL: { badge: "bg-blue-100 text-blue-700 border-blue-300", dot: "bg-blue-500", label: "待补实际日期" },
  ON_TRACK: { badge: "bg-slate-100 text-slate-700 border-slate-300", dot: "bg-slate-400", label: "正常" },
  NOT_STARTED: { badge: "bg-slate-100 text-slate-600 border-slate-300", dot: "bg-slate-400", label: "正常" },
};
export function statusLabel(status: string): string { return STATUS_STYLE[status]?.label ?? status; }
