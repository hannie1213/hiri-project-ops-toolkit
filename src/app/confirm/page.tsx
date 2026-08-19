"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Copy, Download, RotateCcw, Save } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { confirmationMilestones } from "@/lib/status";
import { evaluate, getSettings, listProjects, saveSettings, subscribe } from "@/lib/store";

const DEFAULT_TEMPLATE = "@{姓名}，你好：\n以下项目节点已超过计划日期，尚未填写实际日期，请协助确认当前进展并补充：\n{项目明细}\n核对日期：{确认日期}";
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
  async function copy(text: string, name?: string) { if (!text.trim()) return setMessage("当前没有可复制的提醒文案"); await navigator.clipboard.writeText(text); setMessage(name ? `已复制 ${name} 的提醒文案` : "已复制全部提醒文案"); }
  function exportContacts() {
    const rows = [["姓名", "项目数", "提醒文案"], ...contacts.map((c) => [c.name, String(c.details.length), render(template, c)])];
    const csv = "\ufeff" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = `项目状态确认联系清单_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="page-heading"><h1 className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-[#147154]"/>项目待确认提醒</h1><p className="mt-1 text-sm">按项目经理生成可直接发送的提醒文案；仅包含计划日期已过且实际日期为空的节点，进入提醒不代表项目延期。</p></div>
    {message && <div className="text-sm text-green-700">{message}</div>}
    <Card><CardHeader title="提醒文案模板" desc="支持 {姓名}、{项目数}、{项目明细}、{确认日期}"/><div className="space-y-3 p-5"><textarea className="min-h-36 w-full rounded-xl border border-[#d6e2dc] p-3 text-sm leading-6" value={template} onChange={(e) => setTemplate(e.target.value)}/><div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => { saveSettings({ confirmationTemplate: template }); setMessage("模板已保存"); }}><Save className="h-4 w-4"/>保存模板</Button><Button variant="secondary" onClick={() => setTemplate(DEFAULT_TEMPLATE)}><RotateCcw className="h-4 w-4"/>恢复默认</Button><Button variant="secondary" onClick={() => copy(contacts.map((c) => render(template, c)).join("\n\n"))}><Copy className="h-4 w-4"/>复制全部提醒</Button><Button variant="secondary" onClick={exportContacts}><Download className="h-4 w-4"/>导出联系清单</Button></div></div></Card>
    <Card><CardHeader title={`待发送提醒（${contacts.length} 人）`} desc="每位项目经理一段独立文案，可直接复制发送"/><div className="divide-y">{contacts.map((contact) => <div key={contact.name} className="p-5"><div className="mb-3 flex items-center justify-between gap-3"><div className="font-semibold text-slate-800">{contact.name} · {contact.details.length} 个待确认项目</div><Button variant="secondary" size="sm" onClick={() => copy(render(template, contact), contact.name)}><Copy className="h-4 w-4"/>复制该人员文案</Button></div><pre className="whitespace-pre-wrap rounded-xl border border-[#e0e9e4] bg-[#f5f9f7] p-4 text-sm leading-6 text-slate-700">{render(template, contact)}</pre></div>)}{!contacts.length && <div className="p-8 text-center text-sm text-slate-400">当前没有需要发送的项目确认提醒</div>}</div></Card>
  </div>;
}
function formatDate(date: Date | null) { return date ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}` : "—"; }
