"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Download, RotateCcw, Save } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { confirmationMilestones } from "@/lib/status";
import { evaluate, getSettings, listProjects, saveSettings, subscribe } from "@/lib/store";

const DEFAULT_TEMPLATE = "@{姓名}，请确认以下项目当前状态，并更新对应节点的实际日期：\n{项目明细}";
type Contact = { name: string; details: string[] };

function render(template: string, contact: Contact): string {
  return template.replaceAll("{姓名}", contact.name).replaceAll("{项目数}", String(contact.details.length)).replaceAll("{项目明细}", contact.details.join("\n")).replaceAll("{确认日期}", new Date().toLocaleDateString("zh-CN"));
}

export default function ConfirmPage() {
  const [projects, setProjects] = useState(() => listProjects());
  const [template, setTemplate] = useState(() => getSettings().confirmationTemplate ?? DEFAULT_TEMPLATE);
  const [message, setMessage] = useState("");
  const refresh = useCallback(() => setProjects(listProjects()), []);
  useEffect(() => subscribe("__all__", refresh), [refresh]);
  const contacts = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const project of projects) {
      const info = evaluate(project).statusInfo; const nodes = confirmationMilestones(info); if (!nodes.length) continue;
      const detail = `- ${project.code || "无编号"} ${project.name}：${nodes.map((node) => `${node.name}（计划 ${formatDate(node.plannedDate)}）`).join("、")}`;
      for (const manager of project.managers) grouped.set(manager, [...(grouped.get(manager) ?? []), detail]);
    }
    return [...grouped].map(([name, details]) => ({ name, details }));
  }, [projects]);
  async function copy(text: string) { await navigator.clipboard.writeText(text); setMessage("文案已复制"); }
  function exportContacts() {
    const rows = [["姓名", "项目数", "提醒文案"], ...contacts.map((c) => [c.name, String(c.details.length), render(template, c)])];
    const csv = "\ufeff" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `项目状态确认联系清单_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="page-heading"><h1>项目状态确认</h1><p className="mt-1 text-sm">计划日期过去至少一天且实际日期为空的未验收项目会进入名单；进入名单不代表延期。</p></div>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">静态网页无法控制本机钉钉客户端，本功能仅生成、复制和导出提醒文案。</div>
    {message && <div className="text-sm text-green-700">{message}</div>}
    <Card><CardHeader title="确认文案模板" desc="支持 {姓名}、{项目数}、{项目明细}、{确认日期}"/><div className="space-y-3 p-5"><textarea className="min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" value={template} onChange={(e) => setTemplate(e.target.value)}/><div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => { saveSettings({ confirmationTemplate: template }); setMessage("模板已保存"); }}><Save className="h-4 w-4"/>保存文案</Button><Button variant="secondary" onClick={() => setTemplate(DEFAULT_TEMPLATE)}><RotateCcw className="h-4 w-4"/>恢复默认文案</Button><Button variant="secondary" onClick={() => copy(contacts.map((c) => render(template, c)).join("\n\n"))}><Copy className="h-4 w-4"/>复制全部文案</Button><Button variant="secondary" onClick={exportContacts}><Download className="h-4 w-4"/>导出联系清单</Button></div></div></Card>
    <Card><CardHeader title={`待确认人员（${contacts.length}）`}/><div className="divide-y">{contacts.map((contact) => <div key={contact.name} className="p-5"><div className="mb-2 flex items-center justify-between"><div className="font-semibold text-slate-800">{contact.name} · {contact.details.length} 个项目</div><Button variant="secondary" size="sm" onClick={() => copy(render(template, contact))}><Copy className="h-4 w-4"/>复制</Button></div><pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{render(template, contact)}</pre></div>)}{!contacts.length && <div className="p-8 text-center text-sm text-slate-400">当前没有需要确认的项目</div>}</div></Card>
  </div>;
}
function formatDate(date: Date | null) { return date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}` : "—"; }
