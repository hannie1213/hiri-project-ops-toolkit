"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleAlert, ClipboardList, FilePlus2, FolderKanban, ShieldCheck } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { StatusBadge } from "@/components/ui/badge";
import { evaluate, getSettings, listProjects, saveSettings, subscribe } from "@/lib/store";
import { confirmationMilestones, projectPhaseLabel, upcomingMilestones, type ProjectStatus } from "@/lib/status";
import { fmtDate } from "@/lib/utils";

type DashboardRow = ReturnType<typeof buildDashboardRows>[number];

function buildDashboardRows() {
  return listProjects().map((project) => {
    const info = evaluate(project).statusInfo;
    const confirmations = confirmationMilestones(info);
    const upcoming = upcomingMilestones(info);
    const riskNode = info.milestoneStatus.find((item) => !item.isAcceptance && item.completedLate);
    const issueNode = info.milestoneStatus.find((item) => item.hasDateIssue);
    const nextNode = info.milestoneStatus.slice().sort((a, b) => a.order - b.order).find((item) => item.actualMissing);
    const reminder = issueNode ?? riskNode ?? confirmations[0] ?? upcoming[14][0] ?? nextNode;
    const priority = info.hasDateIssue ? 1 : info.hasLateRisk ? 2 : confirmations.length ? 3 : upcoming[14].length ? 4 : 5;
    const needsFollowUp = !info.accepted && priority < 5;
    const timeLabel = issueNode ? "日期待核对" : riskNode ? "存在延期风险" : confirmations.length ? "计划已过，待补实际日期" : reminder?.remainingDays === 0 ? "今天到期" : reminder?.remainingDays != null && reminder.remainingDays > 0 ? `剩余 ${reminder.remainingDays} 天` : info.accepted ? info.acceptanceResult : "正常推进";

    return {
      id: project.id,
      code: project.code || "无编号",
      name: project.name,
      managers: project.managers,
      phaseLabel: projectPhaseLabel(info),
      status: info.status,
      accepted: info.accepted,
      needsFollowUp,
      priority,
      reminderNode: reminder?.name || "暂无待办节点",
      plannedDate: reminder?.plannedDate ? fmtDate(reminder.plannedDate) : "未排期",
      timeLabel,
      upcomingCounts: { 7: upcoming[7].length, 14: upcoming[14].length, 30: upcoming[30].length, 60: upcoming[60].length },
    };
  }).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "zh"));
}

export default function DashboardPage() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const refresh = useCallback(() => setRows(buildDashboardRows()), []);

  useEffect(() => {
    refresh();
    if (!getSettings().firstVisitSeen) setShowHelp(true);
    return subscribe("__all__", refresh);
  }, [refresh]);

  const stats = useMemo(() => ({
    total: rows.length,
    follow: rows.filter((row) => row.needsFollowUp).length,
    risk: rows.filter((row) => row.status === "LATE_RISK" || row.status === "ACCEPTANCE_LATE").length,
    accepted: rows.filter((row) => row.accepted).length,
  }), [rows]);
  const focusRows = useMemo(() => rows.filter((row) => row.needsFollowUp).slice(0, 6), [rows]);
  const structure = useMemo(() => buildStructure(rows), [rows]);
  const windows = useMemo(() => [7, 14, 30, 60].map((days) => ({ days, count: rows.reduce((sum, row) => sum + row.upcomingCounts[days as 7 | 14 | 30 | 60], 0) })), [rows]);

  return (
    <div className="mx-auto max-w-[1760px] space-y-5">
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10291f]/40 p-4">
          <Card className="max-w-lg p-6">
            <h2 className="text-lg font-bold text-[#10291f]">首次使用</h2>
            <p className="mt-3 text-sm leading-6 text-[#587066]">请先导入项目表格，或直接人工录入项目。数据只保存在当前浏览器，不会上传服务器。</p>
            <Button className="mt-5" variant="primary" onClick={() => { saveSettings({ firstVisitSeen: true }); setShowHelp(false); }}>我知道了</Button>
          </Card>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-[#d7e4dd] bg-gradient-to-br from-[#0d6f52] via-[#147b5b] to-[#2e8d6c] px-6 py-7 text-white shadow-[0_18px_45px_rgba(20,92,68,0.16)] sm:px-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-sm text-white/85"><ShieldCheck className="h-4 w-4"/>项目运行总览</div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">仪表盘</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/78 sm:text-base">聚焦需要处理的异常与临期节点；完整查询、筛选、分组和项目维护统一在项目管理中完成。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/projects/new"><Button className="border-white/25 bg-white text-[#126b50] hover:bg-[#eff8f3]" variant="secondary"><FilePlus2 className="h-4 w-4"/>人工录入</Button></Link>
            <Link href="/projects" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/18">进入项目管理<ArrowRight className="h-4 w-4"/></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={FolderKanban} label="全部项目" value={stats.total} note="当前项目库" tone="green" />
        <MetricCard icon={ClipboardList} label="需要处理" value={stats.follow} note="异常、过期或 14 天内临期" tone="red" />
        <MetricCard icon={AlertTriangle} label="延期风险" value={stats.risk} note="含前置节点风险与验收延期" tone="orange" />
        <MetricCard icon={CheckCircle2} label="已验收" value={stats.accepted} note={stats.total ? `占全部项目 ${Math.round(stats.accepted / stats.total * 100)}%` : "暂无项目"} tone="teal" />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,.75fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#dbe6e0] px-5 py-4 sm:px-6">
            <div><h2 className="text-lg font-black text-[#10291f]">优先处理</h2><p className="mt-1 text-sm text-[#73867e]">仅展示优先级最高的 6 个项目</p></div>
            <Link href="/projects?status=FOLLOW_UP" className="inline-flex items-center gap-1 text-sm font-semibold text-[#147154] hover:underline">查看全部<ArrowRight className="h-4 w-4"/></Link>
          </div>
          <div className="divide-y divide-[#e1e9e5]">
            {focusRows.map((row) => <FocusRow key={row.id} row={row}/>) }
            {!focusRows.length && <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center"><CheckCircle2 className="h-10 w-10 text-[#54a27f]"/><p className="mt-3 font-bold text-[#23473a]">当前没有需要优先处理的项目</p><p className="mt-1 text-sm text-[#82958e]">新增或修改节点后，这里会自动重新计算。</p></div>}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2"><CircleAlert className="h-5 w-5 text-[#147154]"/><h2 className="text-lg font-black text-[#10291f]">项目健康结构</h2></div>
            <div className="mt-6 space-y-4">{structure.map((item) => <HealthBar key={item.label} item={item} total={stats.total}/>)}</div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-[#147154]"/><h2 className="text-lg font-black text-[#10291f]">近期节点压力</h2></div>
            <p className="mt-1 text-sm text-[#82958e]">统计尚未完成且已有计划日期的节点</p>
            <div className="mt-5 grid grid-cols-2 gap-3">{windows.map((item) => <div key={item.days} className="rounded-2xl bg-[#f2f7f4] p-4"><div className="text-sm text-[#70847b]">{item.days} 天内</div><div className="mt-1 text-2xl font-black text-[#123d2e]">{item.count}</div></div>)}</div>
          </Card>

          <div className="rounded-2xl border border-[#cfe1d8] bg-[#edf6f1] p-5 text-sm leading-6 text-[#416358]"><div className="font-bold text-[#174f3b]">数据口径已统一</div>人工录入、Excel 导入或编辑节点后，仪表盘、项目管理、提醒清单、状态确认和项目详情都会使用同一套节点与日期规则立即重算。</div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, note, tone }: { icon: typeof FolderKanban; label: string; value: number; note: string; tone: "green" | "red" | "orange" | "teal" }) {
  const styles = { green: "bg-[#e6f2ec] text-[#147154]", red: "bg-[#fdeceb] text-[#c94038]", orange: "bg-[#fff0e5] text-[#ca5b24]", teal: "bg-[#e5f3f0] text-[#217f69]" }[tone];
  return <Card className="p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-medium text-[#698078]">{label}</div><div className="mt-3 text-3xl font-black text-[#10291f]">{value}</div><div className="mt-2 text-xs text-[#8a9c95]">{note}</div></div><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${styles}`}><Icon className="h-5 w-5"/></span></div></Card>;
}

function FocusRow({ row }: { row: DashboardRow }) {
  return <Link href={`/projects/detail?id=${row.id}`} className="group grid gap-3 px-5 py-4 transition hover:bg-[#f6faf8] sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_130px_minmax(180px,.8fr)_36px] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={row.status}/><span className="truncate font-bold text-[#10291f] group-hover:text-[#147154]">{row.name}</span></div><div className="mt-1.5 truncate text-xs text-[#82958e]">{row.code} · {row.managers.join(" / ") || "未指定项目经理"}</div></div><div><div className="text-xs text-[#8b9c95]">当前阶段</div><div className="mt-1 text-sm font-semibold text-[#315548]">{row.phaseLabel}</div></div><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#23473a]">{row.reminderNode} · {row.plannedDate}</div><div className="mt-1 truncate text-xs text-[#c25b32]">{row.timeLabel}</div></div><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#edf5f1] text-[#147154] transition group-hover:bg-[#d8ebe1]"><ArrowRight className="h-4 w-4"/></span></Link>;
}

function HealthBar({ item, total }: { item: { label: string; count: number; color: string }; total: number }) {
  const percent = total ? Math.round(item.count / total * 100) : 0;
  return <div><div className="mb-1.5 flex items-center justify-between text-sm"><span className="text-[#526b61]">{item.label}</span><span className="font-bold text-[#1b4032]">{item.count} <span className="font-normal text-[#93a29c]">· {percent}%</span></span></div><div className="h-2 overflow-hidden rounded-full bg-[#edf1ee]"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${percent}%` }}/></div></div>;
}

function buildStructure(rows: DashboardRow[]) {
  const groups: Array<{ label: string; statuses: ProjectStatus[]; color: string }> = [
    { label: "正常推进", statuses: ["ON_TRACK", "NOT_STARTED"], color: "bg-[#69aa89]" },
    { label: "待补实际日期", statuses: ["PENDING_ACTUAL"], color: "bg-[#4d8ec8]" },
    { label: "延期风险", statuses: ["LATE_RISK", "ACCEPTANCE_LATE"], color: "bg-[#df7040]" },
    { label: "日期待核对", statuses: ["DATE_ISSUE"], color: "bg-[#8b63b4]" },
    { label: "按时验收", statuses: ["ACCEPTANCE_ON_TIME"], color: "bg-[#21805e]" },
  ];
  return groups.map((group) => ({ ...group, count: rows.filter((row) => group.statuses.includes(row.status)).length }));
}
