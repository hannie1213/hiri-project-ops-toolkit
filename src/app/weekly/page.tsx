"use client";

import { useMemo, useState } from "react";
import { Copy, Download, FileSpreadsheet, Upload, Users } from "lucide-react";
import { Button, Card, CardHeader, Input } from "@/components/ui";
import { buildWeeklyGroupWorkbooks, recognizeWeeklyMember, weeklyGroupForMember, WEEKLY_GROUP_LABELS, WEEKLY_GROUPS, type WeeklyGroupKey } from "@/lib/excel";

type Selected = { file: File; member: string | null };

export default function WeeklyPage() {
  const [selected, setSelected] = useState<Selected[]>([]);
  const [dateLabel, setDateLabel] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const recognized = selected.filter((item): item is Selected & { member: string } => !!item.member);
  const counts = useMemo(() => recognized.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.member]: (acc[item.member] ?? 0) + 1 }), {}), [recognized]);
  const duplicates = Object.entries(counts).filter(([, count]) => count > 1).map(([name]) => name);
  const allMembers = Object.values(WEEKLY_GROUPS).flat();
  const missing = allMembers.filter((name) => !counts[name]);
  const groupOverview = (Object.keys(WEEKLY_GROUPS) as WeeklyGroupKey[]).map((group) => {
    const members = [...WEEKLY_GROUPS[group]];
    const selectedMembers = members.filter((name) => !!counts[name]);
    return { group, members, selectedMembers, missingMembers: members.filter((name) => !counts[name]) };
  });

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    setSelected(Array.from(event.target.files ?? []).map((file) => ({ file, member: recognizeWeeklyMember(file.name) })));
    setMessage("");
  }
  async function merge() {
    const invalid = selected.filter((item) => !item.member);
    if (!selected.length) return setMessage("请先选择个人周报 Excel 文件");
    if (invalid.length) return setMessage(`以下文件无法识别人员，请将文件名改为本人姓名后重选：${invalid.map((item) => item.file.name).join("、")}`);
    if (duplicates.length) return setMessage(`同一人员选择了多个文件，已停止合成：${duplicates.join("、")}`);
    setBusy(true); setMessage("");
    try {
      const inputs = await Promise.all(recognized.map(async (item) => ({ fileName: item.file.name, memberName: item.member, buffer: new Uint8Array(await item.file.arrayBuffer()) })));
      const outputs = await buildWeeklyGroupWorkbooks(inputs, dateLabel.replaceAll("-", ""));
      for (const output of outputs) {
        const url = URL.createObjectURL(new Blob([output.buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        const a = document.createElement("a"); a.href = url; a.download = output.fileName; a.click(); URL.revokeObjectURL(url);
      }
      setMessage("已生成并下载三个分组周报文件，原始文件未被修改。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "合成失败"); }
    finally { setBusy(false); }
  }
  function reminderText(name: string) { return `@${name}，你好，截至 ${dateLabel} 尚未收到你的本周周报，请尽快提交，并将文件名以自己的名字命名，谢谢。`; }
  function broadcastReminderText() {
    if (!missing.length) return "";
    return `各位同事好，截至 ${dateLabel}，以下人员尚未提交本周周报：\n${missing.map((name) => `@${name}`).join("、")}\n\n请以上人员尽快提交，并将文件名以自己的名字命名，谢谢。`;
  }
  async function copyReminder(text: string, name?: string) { if (!text.trim()) return setMessage("当前没有需要提醒的人员"); await navigator.clipboard.writeText(text); setMessage(name ? `已复制 ${name} 的周报提醒文案` : "已复制周报群发文案"); }

  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="page-heading"><h1>周报 Excel 合成</h1><p className="mt-1 text-sm">只负责选择和合成个人周报文件，不在线填写、编辑、审批或提交周报。</p></div>
    <Card><CardHeader title="选择个人周报" desc="文件名必须为本人姓名.xlsx（或 .xls）；每个文件只读取第一个工作表"/><div className="space-y-4 p-5">
      <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-[#bcd5c8] bg-[#f4f9f6] py-8 transition hover:border-[#45a07b] hover:bg-[#ecf6f0]"><Upload className="h-8 w-8 text-[#4f9377]"/><span className="mt-2 text-sm font-semibold text-[#365f50]">选择多个 .xlsx / .xls 文件</span><span className="mt-1 text-xs text-[#7d9188]">示例：张三.xlsx</span><input type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={choose}/></label>
      <div className="max-w-xs"><label className="mb-1 block text-sm font-medium text-slate-700">汇总日期</label><Input type="date" value={dateLabel} onChange={setDateLabel}/></div>
      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}
      <Button variant="primary" onClick={merge} disabled={busy}><Download className="h-4 w-4"/>{busy ? "正在合成…" : "生成三个分组文件"}</Button>
    </div></Card>
    <Card><CardHeader title="三组合成确认" desc="系统先按固定人员名单确认姓名和组别，再分别生成三个工作簿"/><div className="grid gap-4 p-5 lg:grid-cols-3">{groupOverview.map((item) => <div key={item.group} className="rounded-2xl border border-[#dbe6e0] bg-[#f6faf8] p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-bold text-[#173f31]"><Users className="h-4 w-4 text-[#147154]"/>{WEEKLY_GROUP_LABELS[item.group]}</div><div className="mt-1 text-xs text-[#7d9188]">输出：{item.group === "项目交付" ? "项目交付周报" : `${item.group}周报`}{dateLabel.replaceAll("-", "")}.xlsx</div></div><span className="rounded-full bg-[#e1efe8] px-2.5 py-1 text-xs font-bold text-[#147154]">{item.selectedMembers.length}/{item.members.length}</span></div><div className="mt-4 text-sm text-[#567066]">已识别：{item.selectedMembers.length ? item.selectedMembers.join("、") : "暂无"}</div><div className="mt-2 text-xs leading-5 text-[#8a9b94]">未选择：{item.missingMembers.length ? item.missingMembers.join("、") : "无"}</div></div>)}</div><div className="border-t border-[#dbe6e0] px-5 py-4 text-sm leading-6 text-[#557066]">合成方式：项目 A/B/C 组成员进入“项目交付周报”；质量控制组和售后服务组分别进入各自周报。每位成员的个人周报会复制为一个以姓名命名的工作表。</div></Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title={`已选择（${recognized.length}）`} desc="已确认姓名及合成组"/><div className="max-h-72 divide-y overflow-y-auto">{recognized.map((item) => { const group = weeklyGroupForMember(item.member); return <div key={item.file.name + item.file.size} className="flex items-center justify-between gap-3 px-4 py-2 text-sm"><span className="truncate">{item.file.name}</span><span className="ml-3 shrink-0 rounded bg-green-50 px-2 py-0.5 text-green-700">{item.member} · {group ? WEEKLY_GROUP_LABELS[group] : "未分组"}{counts[item.member] > 1 ? " · 重复" : ""}</span></div>; })}{!recognized.length && <div className="p-6 text-center text-sm text-slate-400">暂无</div>}</div></Card>
      <Card><CardHeader title={`未选择周报（${missing.length}）`} desc="可复制一段群发通知，也可单独提醒某位人员" right={<Button variant="secondary" size="sm" onClick={() => copyReminder(broadcastReminderText())}><Users className="h-4 w-4"/>复制群发文案</Button>}/>{missing.length > 0 && <div className="border-b border-[#e0e9e4] bg-[#f5f9f7] p-4"><div className="mb-2 text-xs font-bold text-[#147154]">群发文案预览</div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{broadcastReminderText()}</p></div>}<div className="max-h-72 divide-y overflow-y-auto">{missing.map((name) => <div key={name} className="flex items-start justify-between gap-3 px-4 py-3"><p className="text-sm leading-5 text-slate-600">{reminderText(name)}</p><Button variant="ghost" size="sm" title={`复制${name}提醒`} onClick={() => copyReminder(reminderText(name), name)}><Copy className="h-4 w-4"/></Button></div>)}{!missing.length && <div className="p-6 text-center text-sm text-slate-400">所有人员均已选择周报文件</div>}</div></Card>
      <Card><CardHeader title={`无法识别（${selected.filter((item) => !item.member).length}）`} desc="文件名必须与三组人员名单中的姓名完全一致"/><div className="p-4 text-sm text-red-600">{selected.filter((item) => !item.member).map((item) => <div key={item.file.name}>· {item.file.name}</div>)}{selected.every((item) => item.member) && "暂无"}</div></Card>
      <Card><CardHeader title={`重复文件（${duplicates.length} 人）`}/><div className="p-4 text-sm text-red-600">{duplicates.length ? duplicates.join("、") : "暂无"}</div></Card>
    </div>
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800"><FileSpreadsheet className="mr-1 inline h-4 w-4"/>浏览器合成会尽量保留文字、常见格式、合并单元格、列宽和行高；复杂图片、宏及特殊格式可能无法完整保留，复杂文件建议继续使用 Windows 桌面版合成。</div>
  </div>;
}
