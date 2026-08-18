"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button, Card, CardHeader, Input } from "@/components/ui";
import { buildWeeklyGroupWorkbooks, recognizeWeeklyMember, WEEKLY_GROUPS } from "@/lib/excel";

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

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    setSelected(Array.from(event.target.files ?? []).map((file) => ({ file, member: recognizeWeeklyMember(file.name) })));
    setMessage("");
  }
  async function merge() {
    const invalid = selected.filter((item) => !item.member);
    if (!selected.length) return setMessage("请先选择个人周报 Excel 文件");
    if (invalid.length) return setMessage(`以下文件无法识别人员，请修正文件名后重选：${invalid.map((item) => item.file.name).join("、")}`);
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

  return <div className="mx-auto max-w-6xl space-y-5">
    <div><h1 className="text-xl font-bold text-slate-900">周报 Excel 合成</h1><p className="mt-1 text-sm text-slate-500">只负责选择和合成个人周报文件，不在线填写、编辑、审批或提交周报。</p></div>
    <Card><CardHeader title="选择个人周报" desc="根据文件名识别姓名；每个文件只读取第一个工作表"/><div className="space-y-4 p-5">
      <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 py-8 hover:border-blue-400"><Upload className="h-8 w-8 text-slate-400"/><span className="mt-2 text-sm font-medium">选择多个 .xlsx / .xls 文件</span><input type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={choose}/></label>
      <div className="max-w-xs"><label className="mb-1 block text-sm font-medium text-slate-700">汇总日期</label><Input type="date" value={dateLabel} onChange={setDateLabel}/></div>
      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}
      <Button variant="primary" onClick={merge} disabled={busy}><Download className="h-4 w-4"/>{busy ? "正在合成…" : "生成三个分组文件"}</Button>
    </div></Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title={`已选择（${recognized.length}）`}/><div className="max-h-72 divide-y overflow-y-auto">{recognized.map((item) => <div key={item.file.name + item.file.size} className="flex items-center justify-between px-4 py-2 text-sm"><span className="truncate">{item.file.name}</span><span className="ml-3 rounded bg-green-50 px-2 py-0.5 text-green-700">{item.member}{counts[item.member] > 1 ? " · 重复" : ""}</span></div>)}{!recognized.length && <div className="p-6 text-center text-sm text-slate-400">暂无</div>}</div></Card>
      <Card><CardHeader title={`未选择（${missing.length}）`}/><div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto p-4">{missing.map((name) => <span key={name} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{name}</span>)}</div></Card>
      <Card><CardHeader title={`无法识别（${selected.filter((item) => !item.member).length}）`}/><div className="p-4 text-sm text-red-600">{selected.filter((item) => !item.member).map((item) => <div key={item.file.name}>· {item.file.name}</div>)}{selected.every((item) => item.member) && "暂无"}</div></Card>
      <Card><CardHeader title={`重复文件（${duplicates.length} 人）`}/><div className="p-4 text-sm text-red-600">{duplicates.length ? duplicates.join("、") : "暂无"}</div></Card>
    </div>
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800"><FileSpreadsheet className="mr-1 inline h-4 w-4"/>浏览器合成会尽量保留文字、常见格式、合并单元格、列宽和行高；复杂图片、宏及特殊格式可能无法完整保留，复杂文件建议继续使用 Windows 桌面版合成。</div>
  </div>;
}
