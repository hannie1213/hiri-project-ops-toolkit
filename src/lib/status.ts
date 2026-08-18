// ============================================================
// 核心状态规则引擎（纯函数，无副作用，便于单元测试）
//
// 验收规则（20条）要点：
//   R1  实际日期为空 ≠ 逾期，节点展示"待补实际日期"
//   R2  非验收节点计划日期已过且无实际日期 → 项目"有延期风险"
//   R3  项目是否完成只看"验收"节点实际日期（验收终审）
//   R4  已验收项目从跟进/提醒中排除
//   R5  7/14/30/60 天临近窗口提醒
//   R6  数据错误（实际日期早于计划日期、无计划日期却有实际日期等）→ "日期待核对"
//   R7  多PM按分隔符拆分
// ============================================================

export type MilestoneView = {
  id: string;
  name: string;
  order: number;
  plannedDate: Date | null;
  actualDate: Date | null;
  remark?: string | null;
  isAcceptance: boolean; // 是否验收节点
  hasDateIssue: boolean; // 是否日期待核对
  dateIssueReason: string | null;
  isPlannedPassed: boolean; // 计划日期已过（且无实际日期）
  actualMissing: boolean; // 实际日期为空
  lateDays: number | null; // 延期天数（计划日期已过且无实际日期）
  remainingDays: number | null; // 距计划日期剩余天数
};

export type ProjectStatusInfo = {
  status: "ACCEPTED" | "DATE_ISSUE" | "LATE_RISK" | "PENDING_ACTUAL" | "ON_TRACK" | "NOT_STARTED";
  label: string;
  milestoneStatus: MilestoneView[];
  accepted: boolean; // 已验收（被排除在跟进之外）
  hasDateIssue: boolean;
  hasLateRisk: boolean;
  hasPendingActual: boolean;
  warning: string | null;
};

/** 验收节点名集合（含别名） */
const ACCEPTANCE_NAMES = ["验收", "终验", "结题", "竣工验收", "交付验收"];

export function isAcceptanceNode(name: string): boolean {
  return ACCEPTANCE_NAMES.some((a) => name.includes(a));
}

/** 计算单节点状态 */
export function evaluateMilestone(
  m: { id?: string; name: string; order: number; plannedDate: Date | null; actualDate: Date | null; remark?: string | null },
  today: Date = new Date()
): MilestoneView {
  const name = m.name || "";
  const isAcceptance = isAcceptanceNode(name);

  // 日期核对规则
  let hasDateIssue = false;
  let dateIssueReason: string | null = null;
  if (m.actualDate && m.plannedDate) {
    if (m.actualDate.getTime() < m.plannedDate.getTime()) {
      hasDateIssue = true;
      dateIssueReason = "实际日期早于计划日期";
    }
  }
  if (m.actualDate && !m.plannedDate) {
    hasDateIssue = true;
    dateIssueReason = "有实际日期但无计划日期";
  }
  // 未来实际日期也视为可疑（提前录入超过合理范围，这里仅标记提醒）
  if (m.actualDate && m.actualDate.getTime() > today.getTime()) {
    hasDateIssue = true;
    dateIssueReason = "实际日期晚于今天";
  }

  const actualMissing = !m.actualDate;
  const isPlannedPassed = !!m.plannedDate && m.plannedDate.getTime() < startOfDay(today).getTime();
  const lateDays =
    actualMissing && m.plannedDate && isPlannedPassed ? diffDays(startOfDay(today), startOfDay(m.plannedDate)) : null;
  const remainingDays =
    !actualMissing || !m.plannedDate ? null : diffDays(startOfDay(m.plannedDate), startOfDay(today));

  return {
    id: m.id || `milestone-${name}-${m.order}`,
    name,
    order: m.order,
    plannedDate: m.plannedDate,
    actualDate: m.actualDate,
    remark: m.remark ?? null,
    isAcceptance,
    hasDateIssue,
    dateIssueReason,
    isPlannedPassed,
    actualMissing,
    lateDays,
    remainingDays,
  };
}

/** 计算项目整体状态 */
export function evaluateProject(
  milestones: Array<{ name: string; order: number; plannedDate: Date | null; actualDate: Date | null; remark?: string | null }>,
  today: Date = new Date()
): ProjectStatusInfo {
  const views = milestones.map((m) => evaluateMilestone(m, today));
  const hasDateIssue = views.some((v) => v.hasDateIssue);

  // R3 验收终审：只看验收节点实际日期
  const acceptanceNode = views.find((v) => v.isAcceptance);
  const accepted = !!acceptanceNode?.actualDate;

  // 已验收项目若存在数据问题仍标"日期待核对"
  if (hasDateIssue) {
    return {
      status: "DATE_ISSUE",
      label: "日期待核对",
      milestoneStatus: views,
      accepted,
      hasDateIssue,
      hasLateRisk: false,
      hasPendingActual: false,
      warning: firstIssueReason(views),
    };
  }

  if (accepted) {
    return {
      status: "ACCEPTED",
      label: "已验收",
      milestoneStatus: views,
      accepted: true,
      hasDateIssue: false,
      hasLateRisk: false,
      hasPendingActual: false,
      warning: null,
    };
  }

  // R2 非验收节点计划日期已过且无实际日期 → 有延期风险
  const lateNode = views.find((v) => !v.isAcceptance && v.isPlannedPassed && v.actualMissing);
  if (lateNode) {
    return {
      status: "LATE_RISK",
      label: "有延期风险",
      milestoneStatus: views,
      accepted: false,
      hasDateIssue: false,
      hasLateRisk: true,
      hasPendingActual: true,
      warning: `节点「${lateNode.name}」计划 ${fmt(lateNode.plannedDate)}，已逾期 ${lateNode.lateDays ?? 0} 天，实际日期待补`,
    };
  }

  // R1 实际日期为空 → 待补实际日期（计划未过期也提示）
  const pendingNode = views.find((v) => v.actualMissing);
  if (pendingNode) {
    return {
      status: "PENDING_ACTUAL",
      label: "待补实际日期",
      milestoneStatus: views,
      accepted: false,
      hasDateIssue: false,
      hasLateRisk: false,
      hasPendingActual: true,
      warning: `节点「${pendingNode.name}」实际日期待补`,
    };
  }

  // 全部节点均无计划日期（空项目）
  if (views.length === 0 || views.every((v) => !v.plannedDate && !v.actualDate)) {
    return {
      status: "NOT_STARTED",
      label: "未开始",
      milestoneStatus: views,
      accepted: false,
      hasDateIssue: false,
      hasLateRisk: false,
      hasPendingActual: false,
      warning: null,
    };
  }

  return {
    status: "ON_TRACK",
    label: "正常推进",
    milestoneStatus: views,
    accepted: false,
    hasDateIssue: false,
    hasLateRisk: false,
    hasPendingActual: false,
    warning: null,
  };
}

/** 按提醒窗口计算临近节点（已验收项目排除） */
export function upcomingMilestones(
  projectStatus: ProjectStatusInfo,
  today: Date = new Date()
): Record<number, MilestoneView[]> {
  const windows = [7, 14, 30, 60];
  const result: Record<number, MilestoneView[]> = { 7: [], 14: [], 30: [], 60: [] };
  if (projectStatus.accepted) return result; // R4 已验收排除
  for (const v of projectStatus.milestoneStatus) {
    if (v.actualMissing && v.plannedDate) {
      const days = diffDays(startOfDay(v.plannedDate), startOfDay(today));
      if (days < 0) continue; // 已过期由延期风险处理
      for (const w of windows) {
        if (days <= w) result[w].push(v);
      }
    }
  }
  return result;
}

function firstIssueReason(views: MilestoneView[]): string {
  const v = views.find((x) => x.hasDateIssue);
  return v ? `节点「${v.name}」：${v.dateIssueReason}` : "存在日期数据错误";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function fmt(d: Date | null): string {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================================================
// 展示辅助
// ============================================================

export const STATUS_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
  ACCEPTED: { badge: "bg-green-100 text-green-700 border-green-300", dot: "bg-green-500", label: "已验收" },
  DATE_ISSUE: { badge: "bg-red-100 text-red-700 border-red-300", dot: "bg-red-500", label: "日期待核对" },
  LATE_RISK: { badge: "bg-orange-100 text-orange-700 border-orange-300", dot: "bg-orange-500", label: "有延期风险" },
  PENDING_ACTUAL: { badge: "bg-amber-100 text-amber-700 border-amber-300", dot: "bg-amber-500", label: "待补实际日期" },
  ON_TRACK: { badge: "bg-blue-100 text-blue-700 border-blue-300", dot: "bg-blue-500", label: "正常推进" },
  NOT_STARTED: { badge: "bg-gray-100 text-gray-600 border-gray-300", dot: "bg-gray-400", label: "未开始" },
};

export function statusLabel(status: string): string {
  return STATUS_STYLE[status]?.label ?? status;
}
