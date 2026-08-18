"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Database, FileSpreadsheet, FolderPlus, History, Plus, RotateCcw, ScrollText, Trash2, UserPlus, Users } from "lucide-react";
import { Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { listMembers, createMember, updateMember, deleteMember, listImports, exportProjects, subscribe, resetToDefaultMembers, TEAMS, TEAM_LABEL, SUBTEAM_LABEL, SUB_TEAMS, type TeamKey, type SubTeamKey, type Member, type ImportLog } from "@/lib/store";
import { buildProgressWorkbook } from "@/lib/excel";

export default function AdminPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [imports, setImports] = useState<ImportLog[]>([]);
  const [newName, setNewName] = useState("");
  const [newTeam, setNewTeam] = useState<TeamKey>("PROJECT");
  const [newSubTeam, setNewSubTeam] = useState<SubTeamKey>("A");
  const [confirmClear, setConfirmClear] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkDefaultTeam, setBulkDefaultTeam] = useState<TeamKey>("PROJECT");
  const [bulkMsg, setBulkMsg] = useState("");

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
    const sub = newTeam === "PROJECT" ? newSubTeam : "NONE";
    createMember(name, newTeam, sub);
    setNewName("");
    load();
  }

  function applyTeam(m: Member, team: TeamKey) {
    const sub = team === "PROJECT" ? m.subTeam : "NONE";
    updateMember(m.id, { team, subTeam: sub });
    load();
  }

  function applySubTeam(m: Member, subTeam: SubTeamKey) {
    updateMember(m.id, { subTeam });
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
      // 支持 "姓名 [项目组/A组]" / "姓名 售后组" 等写法
      const m = raw.match(/^(.+?)\s*[\[【(（]\s*(项目组|售后组|质安组|PROJECT|AFTERSALES|QA|[ABC]组|[ABC])\s*[\]】)）]\s*$/i);
      let name = raw;
      let team: TeamKey = bulkDefaultTeam;
      let sub: SubTeamKey = team === "PROJECT" ? "A" : "NONE";
      if (m) {
        name = m[1].trim();
        const tag = m[2].toUpperCase();
        if (tag === "项目组" || tag === "PROJECT") team = "PROJECT";
        else if (tag === "售后组" || tag === "AFTERSALES") team = "AFTERSALES";
        else if (tag === "质安组" || tag === "QA") team = "QA";
        else if (tag === "A" || tag === "A组") { team = "PROJECT"; sub = "A"; }
        else if (tag === "B" || tag === "B组") { team = "PROJECT"; sub = "B"; }
        else if (tag === "C" || tag === "C组") { team = "PROJECT"; sub = "C"; }
        if (team !== "PROJECT") sub = "NONE";
      }
      if (!name || existing.has(name)) {
        skipped++;
        continue;
      }
      createMember(name, team, sub);
      existing.add(name);
      added++;
    }
    setBulkText("");
    setBulkMsg(`已添加 ${added} 人${skipped ? `，跳过 ${skipped} 个重复或空行` : ""}`);
    load();
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
              onChange={(v) => {
                const t = v as TeamKey;
                setNewTeam(t);
                if (t !== "PROJECT") setNewSubTeam("NONE");
              }}
              options={TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] }))}
            />
            {newTeam === "PROJECT" && (
              <Select
                value={newSubTeam}
                onChange={(v) => setNewSubTeam(v as SubTeamKey)}
                options={SUB_TEAMS.PROJECT.map((s) => ({ value: s, label: SUBTEAM_LABEL[s] }))}
              />
            )}
            <Button variant="primary" onClick={addMember} disabled={!newName.trim()}>
              <Plus className="h-4 w-4" /> 添加
            </Button>
          </div>

          <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <summary className="flex cursor-pointer items-center gap-1 text-sm font-medium text-slate-700">
              <UserPlus className="h-4 w-4" /> 批量导入成员
            </summary>
            <div className="mt-3 space-y-2">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={5}
                placeholder={"每行一个名字，或用 顿号/逗号/分号 分隔\n例：\n张三 [A组]\n李四、王五 [B组]\n赵六 [质安组]\n周飞明 [C组]\n默认分组："}
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
                  <UserPlus className="h-4 w-4" /> 批量添加
                </Button>
                {bulkMsg && <span className="text-xs text-slate-600">{bulkMsg}</span>}
              </div>
              <p className="text-xs text-slate-400">
                支持写法：<code className="rounded bg-slate-100 px-1">张三</code>、<code className="rounded bg-slate-100 px-1">张三 [项目组]</code>；名字重复会自动跳过。
              </p>
            </div>
          </details>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">姓名</th>
                  <th className="px-3 py-2 font-medium">大组</th>
                  <th className="px-3 py-2 font-medium">子组</th>
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
                      {m.team === "PROJECT" ? (
                        <Select
                          value={m.subTeam}
                          onChange={(v) => applySubTeam(m, v as SubTeamKey)}
                          options={SUB_TEAMS.PROJECT.map((s) => ({ value: s, label: SUBTEAM_LABEL[s] }))}
                        />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
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
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
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
