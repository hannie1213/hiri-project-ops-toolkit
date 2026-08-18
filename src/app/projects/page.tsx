"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Filter, Plus, RefreshCw, RotateCcw, Search, Users } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import { StatusBadge } from "@/components/ui/badge";
import { evaluate, listProjects, subscribe, TEAM_LABEL, TEAMS, type Project, type TeamKey } from "@/lib/store";
import { confirmationMilestones, upcomingMilestones, type ProjectStatus } from "@/lib/status";
import { fmtDate } from "@/lib/utils";

type StatusFilter = "ALL" | "FOLLOW_UP" | "ACCEPTED_GROUP" | "NORMAL" | ProjectStatus;
type SortKey = "PRIORITY" | "NAME" | "UPDATED";

type ProjectRow = {
  project: Project;
  status: ProjectStatus;
  statusLabel: string;
  warning: string | null;
  managers: string[];
  doneCount: number;
  totalCount: number;
  progress: number;
  reminder: string;
  reminderTone: "danger" | "warning" | "info" | "success" | "muted";
  priority: number;
  needsFollowUp: boolean;
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "全部状态" },
  { value: "FOLLOW_UP", label: "需要跟进" },
  { value: "LATE_RISK", label: "有延期风险" },
  { value: "DATE_ISSUE", label: "日期待核对" },
  { value: "PENDING_ACTUAL", label: "待补实际日期" },
  { value: "ACCEPTED_GROUP", label: "全部已验收" },
  { value: "ACCEPTANCE_LATE", label: "验收延期完成" },
  { value: "ACCEPTANCE_ON_TIME", label: "按时验收" },
  { value: "NORMAL", label: "正常" },
];

const TEAM_OPTIONS = [{ value: "ALL", label: "全部项目组" }, ...TEAMS.map((team) => ({ value: team, label: TEAM_LABEL[team] }))];
const PAGE_SIZES = [15, 30, 50];

function buildRows(): ProjectRow[] {
  return listProjects().map((project) => {
    const info = evaluate(project).statusInfo;
    const milestones = info.milestoneStatus.slice().sort((a, b) => a.order - b.order);
    const doneCount = milestones.filter((item) => !!item.actualDate).length;
    const dateIssue = milestones.find((item) => item.hasDateIssue);
    const riskNodes = milestones.filter((item) => !item.isAcceptance && item.completedLate);
    const confirmations = confirmationMilestones(info);
    const upcoming = upcomingMilestones(info)[60].slice().sort((a, b) => (a.remainingDays ?? 9999) - (b.remainingDays ?? 9999));
    let reminder = "暂无待办";
    let reminderTone: ProjectRow["reminderTone"] = "muted";
    let priority = 6;

    if (info.accepted) {
      reminder = info.acceptanceResult === "验收延期完成" ? "验收已完成 · 晚于计划" : "验收已完成 · 按时";
      reminderTone = info.acceptanceResult === "验收延期完成" ? "danger" : "success";
      priority = info.acceptanceResult === "验收延期完成" ? 4 : 6;
    } else if (dateIssue) {
      reminder = `${dateIssue.name} · ${dateIssue.dateIssueReason || "日期待核对"}`;
      reminderTone = "danger";
      priority = 1;
    } else if (riskNodes.length) {
      reminder = `${riskNodes.map((item) => item.name).join("、")} · 前置节点延期风险`;
      reminderTone = "warning";
      priority = 2;
    } else if (confirmations.length) {
      const item = confirmations[0];
      reminder = `${item.name} · 计划 ${format(item.plannedDate)} · 待确认实际日期`;
      reminderTone = "info";
      priority = 3;
    } else if (upcoming.length) {
      const item = upcoming[0];
      reminder = `${item.name} · ${item.remainingDays === 0 ? "今天到期" : `剩余 ${item.remainingDays} 天`} · ${format(item.plannedDate)}`;
      reminderTone = "warning";
      priority = 4;
    } else {
      const next = milestones.find((item) => item.actualMissing);
      if (next?.plannedDate) reminder = `${next.name} · 计划 ${format(next.plannedDate)}`;
      else if (next) reminder = `${next.name} · 暂无计划日期`;
    }

    return {
      project,
      status: info.status,
      statusLabel: info.label,
      warning: info.warning,
      managers: project.managers,
      doneCount,
      totalCount: milestones.length,
      progress: milestones.length ? Math.round((doneCount / milestones.length) * 100) : 0,
      reminder,
      reminderTone,
      priority,
      needsFollowUp: !info.accepted && (info.hasDateIssue || info.hasLateRisk || confirmations.length > 0 || upcoming.length > 0),
    };
  });
}

export default function ProjectsPage() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-400">正在读取浏览器项目数据…</div>}><ProjectsPageInner /></Suspense>;
}

function ProjectsPageInner() {
  const searchParams = useSearchParams();
  const initialStatus = normalizeStatus(searchParams.get("status"));
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [query, setQuery] = useState("");
  const [manager, setManager] = useState("ALL");
  const [team, setTeam] = useState<TeamKey | "ALL">("ALL");
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [sort, setSort] = useState<SortKey>("PRIORITY");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const refresh = useCallback(() => setRows(buildRows()), []);
  useEffect(() => { refresh(); return subscribe("__all__", refresh); }, [refresh]);
  useEffect(() => setPage(1), [query, manager, team, status, sort, pageSize]);

  const managerOptions = useMemo(() => [...new Set(rows.flatMap((row) => row.managers))].sort((a, b) => a.localeCompare(b, "zh")), [rows]);
  const counts = useMemo(() => ({
    total: rows.length,
    follow: rows.filter((row) => row.needsFollowUp).length,
    risk: rows.filter((row) => row.status === "LATE_RISK").length,
    pending: rows.filter((row) => row.status === "PENDING_ACTUAL").length,
    accepted: rows.filter((row) => row.status === "ACCEPTANCE_LATE" || row.status === "ACCEPTANCE_ON_TIME").length,
  }), [rows]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    const result = rows.filter((row) => {
      if (keyword && !row.project.name.toLocaleLowerCase().includes(keyword) && !(row.project.code || "").toLocaleLowerCase().includes(keyword)) return false;
      if (manager !== "ALL" && !row.managers.includes(manager)) return false;
      if (team !== "ALL" && row.project.team !== team) return false;
      if (status === "FOLLOW_UP" && !row.needsFollowUp) return false;
      if (status === "ACCEPTED_GROUP" && row.status !== "ACCEPTANCE_LATE" && row.status !== "ACCEPTANCE_ON_TIME") return false;
      if (status === "NORMAL" && row.status !== "ON_TRACK" && row.status !== "NOT_STARTED") return false;
      if (!['ALL', 'FOLLOW_UP', 'ACCEPTED_GROUP', 'NORMAL'].includes(status) && row.status !== status) return false;
      return true;
    });
    return result.sort((a, b) => {
      if (sort === "NAME") return a.project.name.localeCompare(b.project.name, "zh");
      if (sort === "UPDATED") return (b.project.updatedAt || "").localeCompare(a.project.updatedAt || "") || a.project.name.localeCompare(b.project.name, "zh");
      return a.priority - b.priority || a.project.name.localeCompare(b.project.name, "zh");
    });
  }, [rows, query, manager, team, status, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const activeFilters = Number(!!query.trim()) + Number(manager !== "ALL") + Number(team !== "ALL") + Number(status !== "ALL");

  function resetFilters() { setQuery(""); setManager("ALL"); setTeam("ALL"); setStatus("ALL"); setSort("PRIORITY"); }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-slate-950">项目管理</h1><p className="mt-1 text-sm text-slate-500">共 {counts.total} 个项目，当前筛选 {filtered.length} 个</p></div>
      <Link href="/projects/new"><Button variant="primary"><Plus className="h-4 w-4"/>新建项目</Button></Link>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <SummaryCard label="全部项目" value={counts.total} active={status === "ALL"} onClick={() => setStatus("ALL")} />
      <SummaryCard label="需要跟进" value={counts.follow} tone="blue" active={status === "FOLLOW_UP"} onClick={() => setStatus("FOLLOW_UP")} />
      <SummaryCard label="延期风险" value={counts.risk} tone="orange" active={status === "LATE_RISK"} onClick={() => setStatus("LATE_RISK")} />
      <SummaryCard label="待补实际日期" value={counts.pending} tone="purple" active={status === "PENDING_ACTUAL"} onClick={() => setStatus("PENDING_ACTUAL")} />
      <SummaryCard label="已验收" value={counts.accepted} tone="green" active={status === "ACCEPTED_GROUP"} onClick={() => setStatus("ACCEPTED_GROUP")} />
    </div>

    <Card className="p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_180px_180px_auto]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Input className="pl-9" value={query} onChange={setQuery} placeholder="搜索项目名称 / 编号"/></div>
        <div className="relative"><Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><Select className="pl-9" value={manager} onChange={setManager} options={[{value:"ALL",label:"全部项目经理"},...managerOptions.map((name) => ({value:name,label:name}))]}/></div>
        <Select value={status} onChange={(value) => setStatus(value as StatusFilter)} options={STATUS_OPTIONS}/>
        <Select value={team} onChange={(value) => setTeam(value as TeamKey | "ALL")} options={TEAM_OPTIONS}/>
        <Button variant="secondary" onClick={refresh}><RefreshCw className="h-4 w-4"/>刷新</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="flex items-center gap-2 text-sm text-slate-500"><Filter className="h-4 w-4"/>已启用 {activeFilters} 个筛选条件{activeFilters > 0 && <button className="ml-1 inline-flex items-center gap-1 text-blue-600 hover:underline" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5"/>清空筛选</button>}</div>
        <Select value={sort} onChange={(value) => setSort(value as SortKey)} options={[{value:"PRIORITY",label:"风险优先"},{value:"NAME",label:"按项目名称"},{value:"UPDATED",label:"最近更新"}]}/>
      </div>
    </Card>

    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] table-fixed text-left text-sm">
          <thead><tr className="border-b bg-slate-50 text-xs text-slate-500"><th className="w-[30%] px-4 py-3 font-medium">项目</th><th className="w-[13%] px-4 py-3 font-medium">项目经理</th><th className="w-[10%] px-4 py-3 font-medium">项目组</th><th className="w-[12%] px-4 py-3 font-medium">监管状态</th><th className="w-[14%] px-4 py-3 font-medium">节点进度</th><th className="w-[21%] px-4 py-3 font-medium">下一步提醒</th></tr></thead>
          <tbody className="divide-y">{pageRows.map((row) => <ProjectTableRow key={row.project.id} row={row}/>)}{!pageRows.length && <tr><td colSpan={6} className="px-4 py-16 text-center"><div className="text-slate-400">没有符合条件的项目</div>{activeFilters > 0 && <button className="mt-2 text-sm text-blue-600 hover:underline" onClick={resetFilters}>清空筛选条件</button>}</td></tr>}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-slate-500">
        <div>显示 {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)}，共 {filtered.length} 个项目</div>
        <div className="flex items-center gap-2"><span>每页</span><select className="rounded-md border border-slate-300 bg-white px-2 py-1" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select><Button size="sm" variant="secondary" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4"/></Button><span>{safePage} / {pageCount}</span><Button size="sm" variant="secondary" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight className="h-4 w-4"/></Button></div>
      </div>
    </Card>
  </div>;
}

function ProjectTableRow({ row }: { row: ProjectRow }) {
  const toneClass = { danger:"text-red-600", warning:"text-orange-600", info:"text-blue-600", success:"text-green-600", muted:"text-slate-500" }[row.reminderTone];
  return <tr className="group transition hover:bg-slate-50/80">
    <td className="px-4 py-4 align-top"><Link href={`/projects/detail?id=${row.project.id}`} className="line-clamp-2 font-semibold leading-5 text-blue-700 hover:underline">{row.project.name}</Link><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>{row.project.code || "无项目编号"}</span>{row.project.currentStatus && <span>业务状态：{row.project.currentStatus}</span>}</div>{row.warning && <div className={`mt-1 line-clamp-1 text-xs ${toneClass}`} title={row.warning}>{row.warning}</div>}</td>
    <td className="px-4 py-4 align-top"><div className="flex flex-wrap gap-1">{row.managers.length ? row.managers.map((name) => <span key={name} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">{name}</span>) : <span className="text-slate-400">未指定</span>}</div></td>
    <td className="px-4 py-4 align-top"><span className="inline-block rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">{row.project.team ? TEAM_LABEL[row.project.team] : "未分组"}</span></td>
    <td className="px-4 py-4 align-top"><StatusBadge status={row.status}/></td>
    <td className="px-4 py-4 align-top"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${row.progress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{width:`${row.progress}%`}}/></div><span className="w-10 text-right text-xs text-slate-500">{row.doneCount}/{row.totalCount}</span></div><div className="mt-1 text-xs text-slate-400">完成 {row.progress}%</div></td>
    <td className={`px-4 py-4 align-top text-xs leading-5 ${toneClass}`}><span title={row.reminder}>{row.reminder}</span><div className="mt-1"><Link className="text-blue-600 opacity-0 transition group-hover:opacity-100 hover:underline" href={`/projects/detail?id=${row.project.id}`}>查看并编辑项目</Link></div></td>
  </tr>;
}

function SummaryCard({ label, value, tone = "slate", active, onClick }: { label: string; value: number; tone?: "slate"|"blue"|"orange"|"purple"|"green"; active?: boolean; onClick?: () => void }) {
  const colors = { slate:"text-slate-800", blue:"text-blue-700", orange:"text-orange-700", purple:"text-purple-700", green:"text-green-700" };
  return <button type="button" onClick={onClick} disabled={!onClick} className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${onClick ? "hover:border-blue-300 hover:shadow" : "cursor-default"} ${active ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-2xl font-bold ${colors[tone]}`}>{value}</div></button>;
}

function normalizeStatus(value: string | null): StatusFilter {
  if (!value) return "ALL";
  if (value === "ACCEPTED") return "ACCEPTANCE_ON_TIME";
  return STATUS_OPTIONS.some((item) => item.value === value) ? value as StatusFilter : "ALL";
}
function format(date: Date | null) { return date ? fmtDate(date) : "—"; }
