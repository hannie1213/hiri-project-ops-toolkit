"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Plus, Search } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { evaluate, listProjects, subscribe, TEAM_LABEL, TEAMS, type Project, type TeamKey } from "@/lib/store";
import { confirmationMilestones, projectPhaseLabel, upcomingMilestones, type MilestoneView, type ProjectStatus } from "@/lib/status";
import { fmtDate } from "@/lib/utils";

type StatusFilter = "ALL" | "FOLLOW_UP" | "ACCEPTED_GROUP" | "NORMAL" | ProjectStatus;

type ProjectRow = {
  project: Project;
  status: ProjectStatus;
  statusLabel: string;
  phaseLabel: string;
  managers: string[];
  priority: number;
  needsFollowUp: boolean;
  reminderNode: string;
  reminderDetail: string;
  plannedDate: Date | null;
  openPlannedDates: Date[];
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "FOLLOW_UP", label: "需要跟进" },
  { value: "ALL", label: "全部状态" },
  { value: "LATE_RISK", label: "有延期风险" },
  { value: "DATE_ISSUE", label: "日期待核对" },
  { value: "PENDING_ACTUAL", label: "待补实际日期" },
  { value: "ACCEPTED_GROUP", label: "全部已验收" },
  { value: "ACCEPTANCE_LATE", label: "验收延期完成" },
  { value: "ACCEPTANCE_ON_TIME", label: "按时验收" },
  { value: "NORMAL", label: "正常" },
];

const TEAM_OPTIONS = [{ value: "ALL", label: "全部项目组" }, ...TEAMS.map((team) => ({ value: team, label: TEAM_LABEL[team] }))];

function buildRows(): ProjectRow[] {
  return listProjects().map((project) => {
    const info = evaluate(project).statusInfo;
    const milestones = info.milestoneStatus.slice().sort((a, b) => a.order - b.order);
    const dateIssue = milestones.find((item) => item.hasDateIssue);
    const riskNodes = milestones.filter((item) => !item.isAcceptance && item.completedLate);
    const confirmations = confirmationMilestones(info);
    const upcoming = upcomingMilestones(info)[60].slice().sort((a, b) => (a.remainingDays ?? 9999) - (b.remainingDays ?? 9999));
    const openNodes = milestones.filter((item) => item.actualMissing);
    const openPlannedDates = openNodes.flatMap((item) => item.plannedDate ? [item.plannedDate] : []);
    let node: MilestoneView | null = openNodes[0] ?? null;
    let reminderDetail = "暂无待办";
    let priority = 7;

    if (info.accepted) {
      node = milestones.find((item) => item.isAcceptance) ?? milestones.at(-1) ?? null;
      reminderDetail = info.acceptanceResult === "验收延期完成" ? "验收已完成，实际日期晚于计划" : "项目已按计划完成验收";
      priority = info.acceptanceResult === "验收延期完成" ? 5 : 8;
    } else if (dateIssue) {
      node = dateIssue;
      reminderDetail = dateIssue.dateIssueReason || "节点日期需要人工核对";
      priority = 1;
    } else if (riskNodes.length) {
      node = riskNodes[0];
      reminderDetail = riskNodes.length > 1 ? `另有 ${riskNodes.length - 1} 个前置节点存在延期风险` : "前置节点实际完成晚于计划";
      priority = 2;
    } else if (confirmations.length) {
      node = confirmations[0];
      reminderDetail = confirmations.length > 1 ? `另有 ${confirmations.length - 1} 个节点待补实际日期` : "计划日期已过，待补实际日期";
      priority = 3;
    } else if (upcoming.length) {
      node = upcoming[0];
      reminderDetail = upcoming[0].remainingDays === 0 ? "今天到期" : `剩余 ${upcoming[0].remainingDays} 天`;
      priority = 4;
    } else if (node) {
      reminderDetail = node.plannedDate ? `计划 ${fmtDate(node.plannedDate)}` : "计划日期待补";
      priority = 6;
    }

    return {
      project,
      status: info.status,
      statusLabel: info.label,
      phaseLabel: projectPhaseLabel(info),
      managers: project.managers,
      priority,
      needsFollowUp: !info.accepted && (info.hasDateIssue || info.hasLateRisk || confirmations.length > 0 || upcoming.length > 0),
      reminderNode: node?.name || "暂无节点",
      reminderDetail,
      plannedDate: node?.plannedDate ?? null,
      openPlannedDates,
    };
  });
}

export default function ProjectsPage() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-400">正在读取浏览器项目数据…</div>}><ProjectsPageInner /></Suspense>;
}

function ProjectsPageInner() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [query, setQuery] = useState("");
  const [manager, setManager] = useState("ALL");
  const [team, setTeam] = useState<TeamKey | "ALL">("ALL");
  const [status, setStatus] = useState<StatusFilter>(() => normalizeStatus(searchParams.get("status")));

  const refresh = useCallback(() => setRows(buildRows()), []);
  useEffect(() => { refresh(); return subscribe("__all__", refresh); }, [refresh]);

  const managerOptions = useMemo(() => [...new Set(rows.flatMap((row) => row.managers))].sort((a, b) => a.localeCompare(b, "zh")), [rows]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (keyword && ![row.project.name, row.project.code || "", row.project.pmRaw || ""].some((value) => value.toLocaleLowerCase().includes(keyword))) return false;
      if (manager !== "ALL" && !row.managers.includes(manager)) return false;
      if (team !== "ALL" && row.project.team !== team) return false;
      if (status === "FOLLOW_UP" && !row.needsFollowUp) return false;
      if (status === "ACCEPTED_GROUP" && row.status !== "ACCEPTANCE_LATE" && row.status !== "ACCEPTANCE_ON_TIME") return false;
      if (status === "NORMAL" && row.status !== "ON_TRACK" && row.status !== "NOT_STARTED") return false;
      if (!["ALL", "FOLLOW_UP", "ACCEPTED_GROUP", "NORMAL"].includes(status) && row.status !== status) return false;
      return true;
    }).sort((a, b) => a.priority - b.priority || a.project.name.localeCompare(b.project.name, "zh"));
  }, [rows, query, manager, team, status]);

  const monthStats = useMemo(() => buildMonthStats(rows), [rows]);
  const workload = useMemo(() => buildWorkload(rows), [rows]);

  return (
    <div className="project-monitor -mx-4 -my-6 min-h-[calc(100vh-3.5rem)] bg-[#f2f7f3] px-5 py-6 text-[#10291f] sm:px-7">
      <div className="mx-auto max-w-[1760px] space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div><div className="flex flex-wrap items-baseline gap-x-5"><h1 className="text-3xl font-black tracking-tight text-[#09271d]">监管清单</h1><p className="text-lg text-[#6f837b]">共显示 {filtered.length} / {rows.length} 个项目</p></div><p className="mt-1 text-sm text-[#6f837b]">完整项目库：用于查看全部项目、组合筛选、分组管理并逐项维护资料与节点。</p></div>
            <Link href="/projects/new" className="inline-flex items-center gap-1 rounded-full bg-[#dfece5] px-3 py-1.5 text-sm font-semibold text-[#146b50] transition hover:bg-[#d2e5db]"><Plus className="h-4 w-4"/>新建项目</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_180px_180px_180px]">
            <div className="relative"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#82958e]"/><Input className="h-12 rounded-xl border-[#d6e2dc] bg-white pl-11 text-base focus:border-[#2b8768] focus:ring-[#dceee5]" value={query} onChange={setQuery} placeholder="搜索项目、编号、负责人…"/></div>
            <Select className="h-12 w-full rounded-xl border-[#d6e2dc] px-4 text-base" value={manager} onChange={setManager} options={[{value:"ALL",label:"全部项目经理"},...managerOptions.map((name) => ({value:name,label:name}))]}/>
            <Select className="h-12 w-full rounded-xl border-[#d6e2dc] px-4 text-base" value={team} onChange={(value) => setTeam(value as TeamKey | "ALL")} options={TEAM_OPTIONS}/>
            <Select className="h-12 w-full rounded-xl border-[#d6e2dc] px-4 text-base" value={status} onChange={(value) => setStatus(value as StatusFilter)} options={STATUS_OPTIONS}/>
          </div>
        </div>

        <div className="grid items-start gap-5 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-2xl border border-[#dbe6e0] bg-white shadow-[0_12px_35px_rgba(31,72,56,0.06)]">
            <div className="monitor-grid hidden border-b border-[#d9e5df] bg-[#f2f7f4] px-4 py-4 text-sm font-bold text-[#526b61] lg:grid">
              <span>优先级</span><span>项目</span><span>项目经理</span><span>当前阶段</span><span>提醒节点</span><span>计划日期</span><span>时间状态</span><span/>
            </div>
            <div className="max-h-[calc(100vh-14rem)] min-h-[470px] overflow-y-auto">
              {filtered.map((row) => <MonitorRow key={row.project.id} row={row}/>)}
              {!filtered.length && <div className="flex min-h-[420px] items-center justify-center text-[#82958e]">没有符合条件的项目</div>}
            </div>
          </section>
          <aside className="rounded-2xl border border-[#dbe6e0] bg-white p-6 shadow-[0_12px_35px_rgba(31,72,56,0.06)] min-[1700px]:sticky min-[1700px]:top-20">
            <div className="flex items-baseline justify-between gap-3"><h2 className="text-xl font-black">未来 6 个月节点</h2><span className="text-sm text-[#82958e]">未完成计划节点</span></div>
            <div className="mt-7 space-y-5">{monthStats.map((item) => <MonthBar key={item.key} item={item}/>)}</div>
            <div className="my-7 border-t border-[#dbe6e0]"/>
            <h2 className="text-lg font-black">跟进负荷最高</h2>
            <div className="mt-5 space-y-3.5">{workload.slice(0, 6).map((item, index) => <div key={item.name} className="grid grid-cols-[28px_1fr_auto] items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e4efe9] text-sm font-bold text-[#147154]">{index + 1}</span><span className="truncate font-medium">{item.name}</span><span className="font-bold text-[#cf4338]">{item.count} 项</span></div>)}{!workload.length && <p className="text-sm text-[#82958e]">暂无需要跟进的项目</p>}</div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MonitorRow({ row }: { row: ProjectRow }) {
  const visual = rowVisual(row.status, row.needsFollowUp);
  return (
    <article className={`monitor-grid group relative border-b border-[#dbe6e0] px-4 py-5 transition last:border-b-0 lg:grid ${visual.row}`}>
      <div className="flex items-center gap-2 lg:block"><span className={`inline-block h-2.5 w-2.5 rounded-full ring-4 ${visual.dot}`}/><span className={`ml-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold lg:mt-3 ${visual.badge}`}>{visual.priorityLabel}</span></div>
      <div className="min-w-0"><Link href={`/projects/detail?id=${row.project.id}`} className="line-clamp-2 text-base font-black leading-6 text-[#09271d] hover:text-[#147154] hover:underline">{row.project.name}</Link><div className="mt-2 truncate text-sm text-[#7b8e86]">{row.project.code || "无项目编号"}{row.project.category ? ` · ${row.project.category}` : ""}</div></div>
      <div className="min-w-0"><div className="flex flex-wrap gap-x-2 font-bold">{row.managers.length ? row.managers.map((name) => <span key={name}>{name}</span>) : <span className="text-[#82958e]">未指定</span>}</div></div>
      <div><div className="font-medium">{row.phaseLabel}</div><div className="mt-2 text-sm text-[#82958e]">{row.project.team ? TEAM_LABEL[row.project.team] : "未分组"}</div></div>
      <div className="min-w-0"><div className="font-bold">{row.reminderNode}</div><div className="mt-2 line-clamp-2 text-sm leading-5 text-[#2874a6]">{row.reminderDetail}</div></div>
      <div className="font-medium tabular-nums">{formatPlanDate(row.plannedDate)}</div>
      <div className={`font-bold ${visual.time}`}>{row.statusLabel}</div>
      <Link aria-label={`查看${row.project.name}`} href={`/projects/detail?id=${row.project.id}`} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f2ed] text-[#0b3c2d] transition group-hover:bg-[#cfe6da]"><ArrowRight className="h-5 w-5"/></Link>
    </article>
  );
}

function MonthBar({ item }: { item: { key: string; label: string; count: number; percent: number } }) {
  return <div className="grid grid-cols-[48px_1fr_34px] items-center gap-3"><span className="text-sm text-[#6f837b]">{item.label}</span><div className="h-2.5 overflow-hidden rounded-full bg-[#edf1ee]"><div className="h-full rounded-full bg-gradient-to-r from-[#0e7857] to-[#64ad89]" style={{width:`${item.percent}%`}}/></div><span className="text-right text-sm font-bold">{item.count}</span></div>;
}

function buildMonthStats(rows: ProjectRow[]) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: `${date.getMonth() + 1}月`, count: 0 };
  });
  const byKey = new Map(months.map((item) => [item.key, item]));
  rows.forEach((row) => row.openPlannedDates.forEach((date) => {
    const item = byKey.get(`${date.getFullYear()}-${date.getMonth()}`);
    if (item) item.count += 1;
  }));
  const max = Math.max(1, ...months.map((item) => item.count));
  return months.map((item) => ({ ...item, percent: item.count ? Math.max(8, Math.round(item.count / max * 100)) : 0 }));
}

function buildWorkload(rows: ProjectRow[]) {
  const counts = new Map<string, number>();
  rows.filter((row) => row.needsFollowUp).forEach((row) => row.managers.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1)));
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));
}

function rowVisual(status: ProjectStatus, needsFollowUp: boolean) {
  if (status === "ACCEPTANCE_LATE") return { row:"bg-[#fff5f3] border-l-4 border-l-[#d9534f]", dot:"bg-[#d9534f] ring-[#fde4e1]", badge:"bg-[#fee9e6] text-[#b92d2a]", time:"text-[#d1433b]", priorityLabel:"验收延期" };
  if (status === "LATE_RISK") return { row:"bg-[#fff7f5] border-l-4 border-l-[#d9534f]", dot:"bg-[#d9534f] ring-[#fde4e1]", badge:"bg-[#fee9e6] text-[#b92d2a]", time:"text-[#d1433b]", priorityLabel:"延期风险" };
  if (status === "DATE_ISSUE") return { row:"bg-[#fbf7ff] border-l-4 border-l-[#8b5fbf]", dot:"bg-[#8b5fbf] ring-[#eee3f8]", badge:"bg-[#f0e8f8] text-[#72449f]", time:"text-[#7b4baa]", priorityLabel:"日期核对" };
  if (status === "PENDING_ACTUAL") return { row:"bg-[#f7fbff] border-l-4 border-l-[#4384bf]", dot:"bg-[#4384bf] ring-[#dfeefa]", badge:"bg-[#e7f2fb] text-[#286b9f]", time:"text-[#3379ad]", priorityLabel:"待补日期" };
  if (status === "ACCEPTANCE_ON_TIME") return { row:"bg-[#f6fbf8] border-l-4 border-l-[#319166]", dot:"bg-[#319166] ring-[#dcefe5]", badge:"bg-[#e2f2e9] text-[#1f7852]", time:"text-[#27815b]", priorityLabel:"已验收" };
  if (needsFollowUp) return { row:"bg-[#fffbf4] border-l-4 border-l-[#d99831]", dot:"bg-[#d99831] ring-[#f7ead2]", badge:"bg-[#f9edd8] text-[#986514]", time:"text-[#a86c11]", priorityLabel:"临期" };
  return { row:"bg-white border-l-4 border-l-transparent", dot:"bg-[#8da097] ring-[#e7eeea]", badge:"bg-[#edf2ef] text-[#587066]", time:"text-[#587066]", priorityLabel:"常规" };
}

function normalizeStatus(value: string | null): StatusFilter {
  if (!value) return "FOLLOW_UP";
  if (value === "ACCEPTED") return "ACCEPTANCE_ON_TIME";
  return STATUS_OPTIONS.some((item) => item.value === value) ? value as StatusFilter : "FOLLOW_UP";
}

function formatPlanDate(date: Date | null) { return date ? fmtDate(date).replaceAll("-", ".") : "—"; }
