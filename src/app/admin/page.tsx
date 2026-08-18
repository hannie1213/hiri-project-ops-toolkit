"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Database, FileSpreadsheet, FolderPlus, History, Plus, RotateCcw, ScrollText, Trash2, UserPlus, Users } from "lucide-react";
import { Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { listMembers, createMember, updateMember, deleteMember, listImports, exportProjects, subscribe, resetToDefaultMembers, TEAMS, TEAM_LABEL, type TeamKey, type Member, type ImportLog } from "@/lib/store";
import { buildProgressWorkbook, buildMembersWorkbook, parseMembersSheet } from "@/lib/excel";

export default function AdminPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [imports, setImports] = useState<ImportLog[]>([]);
  const [newName, setNewName] = useState("");
  const [newTeam, setNewTeam] = useState<TeamKey>("A");
  const [confirmClear, setConfirmClear] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkDefaultTeam, setBulkDefaultTeam] = useState<TeamKey>("A");
  const [bulkMsg, setBulkMsg] = useState("");
  const memberFileRef = useRef<HTMLInputElement>(null);
  const [memberImportMsg, setMemberImportMsg] = useState("");

  const load = useCallback(() => {
    setMembers(listMembers());
    setImports(listImports());
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribe("__all__", load);
    return unsub;
  }, [load]);

  function addMember() {
    const name = newName.trim();
    if (!name) return;
    createMember(name, newTeam);
    setNewName("");
    load();
  }

  function applyTeam(m: Member, team: TeamKey) {
    updateMember(m.id, { team });
    load();
  }

  function toggleActive(m: Member) {
    updateMember(m.id, { active: !m.active });
    load();
  }

  function delMember(m: Member) {
    if (!confirm(`删除成员「${m.name}」？`)) return;
    deleteMember(m.id);
    load();
  }

  function resetMembers() {
    if (!confirm("确定重置为默认名单？当前所有成员（含手动增删改）将被覆盖为系统默认的 32 人名单。")) return;
    resetToDefaultMembers();
    setBulkMsg("已重置为默认名单");
    load();
  }

  function batchImport() {
    setBulkMsg("");
    const lines = bulkText
      .split(/[\n,，;；、]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setBulkMsg("请输入成员姓名（每行一个，或用 / ， , ; 顿号 分隔）");
      return;
    }
    let added = 0;
    let skipped = 0;
    const existing = new Set(members.map((m) => m.name));
    for (const raw of lines) {
      // 支持 "姓名 [A组]" / "姓名 质安组" 等写法
      const m = raw.match(/^(.+?)\s*[\[【(（]\s*(项目组A组|项目组B组|项目组C组|项目组|售后组|质安组|A组|B组|C组|A|B|C|AFTERSALES|QA)\s*[\]】)）]\s*$/i);
      let name = raw;
      let team: TeamKey = bulkDefaultTeam;
      if (m) {
        name = m[1].trim();
        const tag = m[2].toUpperCase().replace(/组$/, "");
        if (tag === "A" || tag === "项目组A") team = "A";
        else if (tag === "B" || tag === "项目组B") team = "B";
        else if (tag === "C" || tag === "项目组C") team = "C";
        else if (tag === "AFTERSALES") team = "AFTERSALES";
        else if (tag === "QA") team = "QA";
        else if (tag === "项目组") team = bulkDefaultTeam; // 含糊的"项目组"用默认
      }
      if (!name || existing.has(name)) {
        skipped++;
        continue;
      }
      createMember(name, team);
      existing.add(name);
      added++;
    }
    setBulkText("");
    setBulkMsg(`已添加 ${added} 人${skipped ? `，跳过 ${skipped} 个重复或空行` : ""}`);
    load();
  }

  async function handleImportMembers(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMemberImportMsg("解析中…");
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseMembersSheet(buf);
      if (!parsed.members.length) {
        setMemberImportMsg(`❌ 解析失败：${parsed.errors[0] ?? "未识别到成员"}`);
        return;
      }
      const existing = new Set(members.map((m) => m.name));
      let added = 0;
      let skipped = 0;
      for (const m of parsed.members) {
        if (existing.has(m.name)) {
          skipped++;
          continue;
        }
        createMember(m.name, m.team);
        existing.add(m.name);
        added++;
      }
      const errTail = parsed.errors.length ? `（${parsed.errors.length} 行组别无法识别）` : "";
      setMemberImportMsg(`✅ 已导入 ${added} 人，跳过 ${skipped} 个重名${errTail}`);
      load();
    } catch (err) {
      setMemberImportMsg(`❌ 读取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      // 清空 input 以便重复导入同名文件
      if (memberFileRef.current) memberFileRef.current.value = "";
    }
  }

  async function downloadMembersTemplate() {
    const buf = await buildMembersWorkbook();
    const blob = new Blob([buf as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "成员名单模板.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAll() {
    const rows = exportProjects().map((p) => ({
      name: p.name,
      code: p.code,
      pmRaw: p.pmRaw ?? "",
      startDate: p.startDate ? new Date(p.startDate) : null,
      endDate: p.endDate ? new Date(p.endDate) : null,
      milestones: p.milestones.map((m) => ({
        name: m.name,
        order: m.order,
        plannedDate: m.plannedDate ? new Date(m.plannedDate) : null,
        actualDate: m.actualDate ? new Date(m.actualDate) : null,
      })),
    }));
    const buf = await buildProgressWorkbook(rows);
    const blob = new Blob([buf as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "项目数据全量导出.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 5000);
      return;
    }
    if (!confirm("确认清空全部项目与周报数据？此操作不可恢复！")) return;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("pt.projects");
      window.localStorage.removeItem("pt.weekly");
      window.localStorage.removeItem("pt.imports");
    }
    setConfirmClear(false);
    load();
  }

  const teamCounts = TEAMS.reduce((acc, t) => {
    acc[t] = members.filter((m) => m.team === t).length;
    return acc;
  }, {} as Record<TeamKey, number>);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Database className="h-5 w-5 text-blue-600" /> 管理
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">维护周报成员名单与分组、查看导入历史、导出或清空本地数据</p>
      </div>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" /> 周报成员名单
            </span>
          }
          desc={`共 ${members.length} 人`}
          right={
            <div className="flex items-center gap-2">
              {TEAMS.map((t) => (
                <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {TEAM_LABEL[t]} {teamCounts[t]}
                </span>
              ))}
              <Button variant="secondary" size="sm" onClick={resetMembers}>
                <RotateCcw className="h-3.5 w-3.5" /> 重置为默认名单
              </Button>
            </div>
          }
        />
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={newName} onChange={setNewName} placeholder="成员姓名" className="w-32" />
            <Select
              value={newTeam}
              onChange={(v) => setNewTeam(v as TeamKey)}
              options={TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] }))}
            />
            <Button variant="primary" onClick={addMember} disabled={!newName.trim()}>
              <Plus className="h-4 w-4" /> 添加
            </Button>
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium text-slate-700">
              <FileSpreadsheet className="h-4 w-4" /> 从 Excel 导入成员
            </summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">
                上传一份成员名单 Excel（工作表名"成员名单"，首行表头"姓名"和"组别"，组别填：项目组 A 组 / 项目组 B 组 / 项目组 C 组 / 质安组 / 售后组）。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={memberFileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportMembers}
                  className="block w-full max-w-xs rounded-md border bg-white p-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-2 file:py-1 file:text-blue-700 hover:file:bg-blue-100"
                />
                <Button variant="secondary" onClick={downloadMembersTemplate}>
                  <FileSpreadsheet className="h-4 w-4" /> 下载模板
                </Button>
                {memberImportMsg && (
                  <span className={`text-xs ${memberImportMsg.startsWith("✅") ? "text-green-700" : "text-red-600"}`}>
                    {memberImportMsg}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                组别识别：<code className="rounded bg-slate-100 px-1">项目组 A 组</code>、<code className="rounded bg-slate-100 px-1">项目组 B 组</code>、<code className="rounded bg-slate-100 px-1">项目组 C 组</code>、<code className="rounded bg-slate-100 px-1">质安组</code>、<code className="rounded bg-slate-100 px-1">售后组</code>；重名自动跳过。
              </p>
            </div>
          </details>

          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium text-slate-700">
              <UserPlus className="h-4 w-4" /> 手动添加（应急用）
            </summary>
            <div className="mt-3 space-y-2">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={3}
                placeholder={"每行一个名字，或用 顿号/逗号/分号 分隔\n例：\n张三 [A组]\n李四、王五 [B组]"}
                className="w-full rounded-md border bg-white p-2 text-sm outline-none focus:border-blue-500"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">默认分组：</span>
                <Select
                  value={bulkDefaultTeam}
                  onChange={(v) => setBulkDefaultTeam(v as TeamKey)}
                  options={TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] }))}
                />
                <Button variant="secondary" onClick={batchImport} disabled={!bulkText.trim()}>
                  <UserPlus className="h-4 w-4" /> 添加
                </Button>
                {bulkMsg && <span className="text-xs text-slate-600">{bulkMsg}</span>}
              </div>
            </div>
          </details>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">所属项目组</th>
                  <th className="px-3 py-2 font-medium">启用</th>
                  <th className="px-3 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 font-medium text-slate-800">{m.name}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={m.team}
                        onChange={(v) => applyTeam(m, v as TeamKey)}
                        options={TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={m.active} onChange={() => toggleActive(m)} className="h-4 w-4 accent-blue-600" />
                    </td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="sm" onClick={() => delMember(m)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                      暂无成员，先添加周报成员名单
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">提示：周报页从名单自动带入成员；如需临时添加未列入名单的人，可在周报页直接手动添加。</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <History className="h-4 w-4 text-purple-600" /> 导入历史
            </span>
          }
        />
        <div className="divide-y">
          {imports.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">暂无导入记录</div>}
          {imports.map((log) => (
            <div key={log.id} className="flex items-center justify-between px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{log.fileName}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  新增 {log.createdRows} · 更新 {log.updatedRows} · 失败 {log.errorRows} · {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> 数据维护
            </span>
          }
        />
        <div className="flex flex-wrap gap-3 p-5">
          <Link href="/projects/new">
            <Button variant="secondary">
              <FolderPlus className="h-4 w-4" /> 新建项目
            </Button>
          </Link>
          <Button variant="secondary" onClick={downloadAll}>
            <FileSpreadsheet className="h-4 w-4" /> 导出全部项目（Excel）
          </Button>
          <Button variant={confirmClear ? "danger" : "ghost"} onClick={clearAll}>
            <Trash2 className="h-4 w-4" /> {confirmClear ? "再次点击确认清空" : "清空全部数据"}
          </Button>
        </div>
        <div className="border-t px-5 py-3 text-xs text-slate-400">
          所有数据均保存在当前浏览器（localStorage）。换浏览器或清除缓存会丢失数据，重要数据请定期导出备份。
        </div>
      </Card>
    </div>
  );
}
