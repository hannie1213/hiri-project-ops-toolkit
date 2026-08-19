"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { ChevronRight, FilePlus2, Search } from "lucide-react";
import { Button, Card, Input, Select } from "@/components/ui";
import { StatusBadge } from "@/components/ui/badge";
import { evaluate, getSettings, listProjects, saveSettings, subscribe, TEAM_LABEL, TEAMS, type TeamKey } from "@/lib/store";
import { confirmationMilestones, projectPhaseLabel, upcomingMilestones } from "@/lib/status";
import { fmtDate } from "@/lib/utils";

type Row = ReturnType<typeof makeRows>[number];
const windows = [7, 14, 30, 60] as const;

function makeRows(windowDays: number) {
  return listProjects().map((project) => {
    const info = evaluate(project).statusInfo;
    const upcoming = upcomingMilestones(info)[windowDays];
    const confirm = confirmationMilestones(info);
    const riskNodes = info.milestoneStatus.filter((m) => !m.isAcceptance && m.completedLate);
    const dateNodes = info.milestoneStatus.filter((m) => m.hasDateIssue);
    const reminder = dateNodes[0] ?? riskNodes[0] ?? confirm[0] ?? upcoming[0] ?? info.milestoneStatus.find((m) => m.actualMissing);
    const days = reminder?.remainingDays ?? null;
    const priority = info.hasDateIssue ? 1 : info.hasLateRisk ? 2 : confirm.length ? 3 : upcoming.length ? 4 : 5;
    return {
      id: project.id, code: project.code || "—", name: project.name, pm: project.pmRaw || "—", managers: project.managers,
      team: project.team, phaseLabel: projectPhaseLabel(info), computedStatus: info.status,
      priority, reminderNode: reminder?.name || "—", plannedDate: reminder?.plannedDate ? fmtDate(reminder.plannedDate) : "—",
      timeStatus: info.accepted ? info.acceptanceResult : reminder?.hasDateIssue ? "日期待核对" : reminder?.completedLate ? "有延期风险" : days === 0 ? "今天到期" : days != null && days > 0 ? `剩余 ${days} 天` : reminder?.isPlannedPassed ? "待补实际日期" : "正常",
      riskNodes: riskNodes.map((m) => m.name).join("、"), pendingNodes: confirm.map((m) => m.name).join("、"), upcomingNodes: upcoming.map((m) => m.name).join("、"),
      nextNode: info.milestoneStatus.find((m) => m.actualMissing)?.name || "—", remainingDays: days,
      follow: !info.accepted && (info.hasDateIssue || info.hasLateRisk || confirm.length > 0 || upcoming.length > 0),
      near: !info.accepted && upcoming.length > 0, confirm: confirm.length > 0,
    };
  }).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "zh"));
}

export default function DashboardPage() {
  const [windowDays, setWindowDays] = useState<7 | 14 | 30 | 60>(() => getSettings().reminderWindow ?? 14);
  const [rows, setRows] = useState<Row[]>([]); const [query, setQuery] = useState(""); const [manager, setManager] = useState("ALL");
  const [team, setTeam] = useState("ALL"); const [status, setStatus] = useState("ALL"); const [showHelp, setShowHelp] = useState(false);
  const refresh = useCallback(() => setRows(makeRows(windowDays)), [windowDays]);
  useEffect(() => { refresh(); if (!getSettings().firstVisitSeen) setShowHelp(true); return subscribe("__all__", refresh); }, [refresh]);
  const managers = useMemo(() => [...new Set(rows.flatMap((r) => r.managers))].sort((a,b) => a.localeCompare(b,"zh")), [rows]);
  const filtered = rows.filter((row) => (query === "" || row.name.includes(query) || row.code.includes(query)) && (manager === "ALL" || row.managers.includes(manager)) && (team === "ALL" || row.team === team) && (status === "ALL" || row.computedStatus === status));
  const stats = { follow: rows.filter((r) => r.follow).length, risk: rows.filter((r) => r.computedStatus === "LATE_RISK").length, near: rows.filter((r) => r.near).length, issue: rows.filter((r) => r.computedStatus === "DATE_ISSUE").length };
  function setWindow(value: string) { const next = Number(value) as 7|14|30|60; setWindowDays(next); saveSettings({ reminderWindow: next }); }
  async function exportRows(kind: "xlsx"|"csv") {
    const header = ["优先级","项目编号","项目名称","项目经理","当前状态","延期风险节点","待补实际日期节点","临期节点","下一节点","计划日期","剩余天数"];
    const data = filtered.map((r) => [r.priority,r.code,r.name,r.pm,r.phaseLabel,r.riskNodes,r.pendingNodes,r.upcomingNodes,r.nextNode,r.plannedDate,r.remainingDays ?? ""]);
    if (kind === "csv") { const csv = "\ufeff" + [header,...data].map((line) => line.map((v) => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n"); download(new Blob([csv],{type:"text/csv;charset=utf-8"}),"项目提醒清单.csv"); return; }
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("提醒清单"); ws.addRow(header); data.forEach((r) => ws.addRow(r)); ws.getRow(1).font = {bold:true}; ws.columns.forEach((c) => c.width = 18); download(new Blob([new Uint8Array(await wb.xlsx.writeBuffer()) as BlobPart]),"项目提醒清单.xlsx");
  }
  return <div className="space-y-5">
    {showHelp && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10291f]/40 p-4"><Card className="max-w-lg p-6"><h2 className="text-lg font-bold text-[#10291f]">首次使用</h2><p className="mt-3 text-sm leading-6 text-[#587066]">请先进入“导入 Excel/CSV”，选择包含“所有项目进度计划情况”工作表的文件。文件只在浏览器本地解析，不会上传服务器。</p><p className="mt-2 text-sm font-semibold text-[#147154]">本工具数据保存在当前浏览器，不会自动同步到其他电脑。</p><Button className="mt-5" variant="primary" onClick={() => { saveSettings({firstVisitSeen:true}); setShowHelp(false); }}>我知道了</Button></Card></div>}
    <div className="page-heading flex flex-col gap-3 rounded-2xl border border-[#dbe6e0] bg-white/75 p-5 shadow-[0_10px_30px_rgba(31,72,56,0.05)] lg:flex-row lg:items-center lg:justify-between"><div><h1>仪表盘</h1><p className="mt-1 text-sm">总览与快速处置：聚合需要跟进、延期风险、临期和日期待核对项目。共 {rows.length} 个项目。</p></div><Link className="text-sm font-semibold text-[#147154] hover:underline" href="/projects">进入完整项目管理 →</Link></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["需要跟进",stats.follow,"text-red-700"],["存在延期风险",stats.risk,"text-orange-700"],[`${windowDays}天内临期`,stats.near,"text-orange-700"],["日期待核对",stats.issue,"text-purple-700"]].map(([label,value,color]) => <Card key={String(label)} className="p-4"><div className="text-sm text-slate-500">{label}</div><div className={`mt-2 text-3xl font-bold ${color}`}>{value}</div></Card>)}</div>
    <div><Link href="/projects/new"><Button variant="secondary"><FilePlus2 className="h-4 w-4"/>人工录入项目</Button></Link></div>
    <Card className="p-4"><div className="grid gap-3 md:grid-cols-5"><div className="relative md:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><Input className="pl-9" value={query} onChange={setQuery} placeholder="搜索项目名称 / 编号"/></div><Select value={manager} onChange={setManager} options={[{value:"ALL",label:"全部项目经理"},...managers.map((m) => ({value:m,label:m}))]}/><Select value={team} onChange={setTeam} options={[{value:"ALL",label:"全部项目组"},...TEAMS.map((t) => ({value:t,label:TEAM_LABEL[t]}))]}/><Select value={status} onChange={setStatus} options={[{value:"ALL",label:"全部状态"},{value:"LATE_RISK",label:"有延期风险"},{value:"DATE_ISSUE",label:"日期待核对"},{value:"PENDING_ACTUAL",label:"待补实际日期"},{value:"ACCEPTANCE_LATE",label:"验收延期完成"},{value:"ACCEPTANCE_ON_TIME",label:"按时验收"}]}/></div><div className="mt-3 flex items-center justify-between"><label className="text-sm text-slate-600">临期范围 <select className="ml-2 rounded border px-2 py-1" value={windowDays} onChange={(e) => setWindow(e.target.value)}>{windows.map((w) => <option key={w}>{w}</option>)}</select> 天</label><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => exportRows("xlsx")}>Excel</Button><Button size="sm" variant="secondary" onClick={() => exportRows("csv")}>CSV</Button></div></div></Card>
    <Card><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-slate-50 text-xs text-slate-500">{["优先级","项目编号","项目名称","项目经理","当前状态","提醒节点","计划日期","时间状态","详情"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y">{filtered.map((row) => <tr key={row.id} className="hover:bg-slate-50"><td className="px-3 py-3">P{row.priority}</td><td className="px-3 py-3">{row.code}</td><td className="px-3 py-3 font-medium">{row.name}</td><td className="px-3 py-3">{row.pm}</td><td className="px-3 py-3"><StatusBadge status={row.computedStatus}/></td><td className="px-3 py-3">{row.reminderNode}</td><td className="px-3 py-3">{row.plannedDate}</td><td className="px-3 py-3">{row.timeStatus}</td><td className="px-3 py-3"><Link aria-label={`查看${row.name}详情`} title="查看详情" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#edf5f1] text-[#147154] transition hover:bg-[#dcece5]" href={`/projects/detail?id=${row.id}`}><ChevronRight className="h-5 w-5"/></Link></td></tr>)}{!filtered.length && <tr><td colSpan={9} className="p-10 text-center text-slate-400">暂无符合条件的项目</td></tr>}</tbody></table></div></Card>
  </div>;
}
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
