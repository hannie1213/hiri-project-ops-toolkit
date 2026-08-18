"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, HardDrive, RefreshCw, RotateCcw, Trash2, Upload } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import {
  clearLocalData, exportBackup, getStorageSummary, importBackup, listDeletedProjects,
  restoreProject, restoreSampleData, subscribe, type Project,
} from "@/lib/store";

export default function AdminPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState(getStorageSummary());
  const [deleted, setDeleted] = useState<Project[]>([]);
  const [message, setMessage] = useState("");
  const refresh = useCallback(() => { setSummary(getStorageSummary()); setDeleted(listDeletedProjects()); }, []);
  useEffect(() => { refresh(); return subscribe("__all__", refresh); }, [refresh]);

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `项目数据备份_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  async function uploadBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try { importBackup(JSON.parse(await file.text())); setMessage("备份已恢复到当前浏览器"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "导入失败"); }
    event.target.value = "";
  }
  function clearAll() {
    if (!confirm("确认清空当前浏览器中的全部项目数据？建议先导出 JSON 备份。")) return;
    clearLocalData(); setMessage("本地数据已清空");
  }
  function samples() {
    if (!confirm("恢复虚构示例数据会替换当前项目数据，是否继续？")) return;
    restoreSampleData(); setMessage("已恢复虚构示例数据");
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-xl font-bold text-slate-900">浏览器数据管理</h1><p className="mt-1 text-sm text-slate-500">本工具数据保存在当前浏览器，不会自动同步到其他电脑。</p></div>
    {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <Card><div className="p-5"><div className="flex items-center gap-2 text-sm text-slate-500"><HardDrive className="h-4 w-4"/>当前项目数量</div><div className="mt-2 text-3xl font-bold text-slate-900">{summary.projectCount}</div></div></Card>
      <Card><div className="p-5"><div className="text-sm text-slate-500">最后保存时间</div><div className="mt-2 text-lg font-semibold text-slate-800">{summary.lastSavedAt ? new Date(summary.lastSavedAt).toLocaleString() : "暂无保存记录"}</div><div className="mt-1 text-xs text-slate-400">{summary.ready ? "IndexedDB 已就绪" : "正在读取浏览器数据…"}</div></div></Card>
    </div>
    <Card><CardHeader title="备份与恢复" desc="换电脑、换浏览器或清除浏览器数据前，请先导出 JSON 备份"/><div className="flex flex-wrap gap-3 p-5">
      <Button variant="primary" onClick={downloadBackup}><Download className="h-4 w-4"/>导出本地数据备份</Button>
      <Button variant="secondary" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4"/>导入本地数据备份</Button>
      <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={uploadBackup}/>
      <Button variant="secondary" onClick={samples}><RefreshCw className="h-4 w-4"/>恢复示例数据</Button>
      <Button variant="danger" onClick={clearAll}><Trash2 className="h-4 w-4"/>清空本地数据</Button>
    </div></Card>
    <Card><CardHeader title={`已删除项目（${deleted.length}）`} desc="删除项目会先进入这里，可随时恢复"/><div className="divide-y">
      {deleted.length === 0 && <div className="p-6 text-center text-sm text-slate-400">暂无已删除项目</div>}
      {deleted.map((project) => <div key={project.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><div className="font-medium text-slate-800">{project.name}</div><div className="text-xs text-slate-500">{project.code || "无编号"} · {project.pmRaw || "无项目经理"}</div></div><Button variant="secondary" size="sm" onClick={() => restoreProject(project.id)}><RotateCcw className="h-4 w-4"/>恢复</Button></div>)}
    </div></Card>
  </div>;
}
