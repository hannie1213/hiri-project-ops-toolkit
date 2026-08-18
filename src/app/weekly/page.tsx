"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardList, Loader2, Merge, Plus, Save, Trash2, Users } from "lucide-react";
import { Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { listMembers, listWeekly, upsertWeekly, deleteWeekly, subscribe, TEAMS, TEAM_LABEL, type TeamKey, type Member, type WeeklyReport } from "@/lib/store";
import { mondayOf } from "@/lib/utils";

type RowView = {
  id: string; // weekly report id (临时则为 mem_<memberId>)
  memberId: string;
  name: string;
  team: TeamKey;
  content: string;
  planned: string;
  issues: string;
  persisted: boolean;
};

export default function WeeklyPage() {
  const [weekKey, setWeekKey] = useState(mondayOf());
  const [rows, setRows] = useState<RowView[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [savingId, setSavingId] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const ms = listMembers();
    setMembers(ms);
    const reports = listWeekly(weekKey);
    const map = new Map(reports.map((r) => [r.memberId, r]));
    const view: RowView[] = ms
      .filter((m) => m.active)
      .map((m) => {
        const r = map.get(m.id);
        return {
          id: r?.id ?? `mem_${m.id}`,
          memberId: m.id,
          name: m.name,
          team: m.team,
          content: r?.content ?? "",
          planned: r?.planned ?? "",
          issues: r?.issues ?? "",
          persisted: !!r,
        };
      });
    setRows(view);
  }, [weekKey]);

  useEffect(() => {
    load();
    const unsub = subscribe("__all__", load);
    return unsub;
  }, [load]);

  function setRow(id: string, patch: Partial<RowView>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function save(r: RowView) {
    setSavingId(r.id);
    setMsg("");
    try {
      upsertWeekly({
        weekKey,
        memberId: r.memberId,
        memberName: r.name,
        team: r.team,
        content: r.content,
        planned: r.planned || null,
        issues: r.issues || null,
      });
      setMsg(`已保存「${r.name}」的周报`);
      load();
    } finally {
      setSavingId("");
    }
  }

  function remove(id: string) {
    if (id.startsWith("mem_")) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    if (!confirm("从本周删除该成员周报？")) return;
    deleteWeekly(id);
    load();
  }

  // 临时新增一行（名单中不存在的成员，允许人工改动）
  function addTempRow() {
    const id = `mem_temp_${Date.now()}`;
    setRows((prev) => [
      ...prev,
      { id, memberId: id, name: "", team: "PROJECT", content: "", planned: "", issues: "", persisted: false },
    ]);
  }

  const submittedCount = rows.filter((r) => r.persisted).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">周报收集（管理员维护）</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {weekKey} 起的一周 · 已录入 {submittedCount}/{rows.length} 人 · 成员名单在「管理」页维护，此处可直接人工增删
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={weekKey}
            onChange={(e) => {
              if (e.target.value) setWeekKey(e.target.value);
            }}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <Link href={`/weekly/merge?weekKey=${weekKey}`}>
            <Button variant="primary">
              <Merge className="h-4 w-4" /> 汇总合并
            </Button>
          </Link>
        </div>
      </div>

      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> {msg}
        </div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <div className="space-y-4">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => setRow(r.id, { name: e.target.value })}
                  placeholder="成员姓名"
                  className="w-32 rounded-md border bg-white px-2 py-1 text-sm font-medium"
                />
                <Select
                  value={r.team}
                  onChange={(v) => setRow(r.id, { team: v as TeamKey })}
                  options={TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] }))}
                />
                {r.persisted && (
                  <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 已录入
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => save(r)} disabled={savingId === r.id || !r.name.trim()}>
                  {savingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(r.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">本周工作内容 *</label>
                <textarea
                  value={r.content}
                  onChange={(e) => setRow(r.id, { content: e.target.value })}
                  rows={5}
                  placeholder={"1. 完成 XX 模块\n2. 推进 XX 验收"}
                  className="w-full rounded-lg border bg-slate-50 p-2 text-sm outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">下周计划</label>
                <textarea
                  value={r.planned}
                  onChange={(e) => setRow(r.id, { planned: e.target.value })}
                  rows={5}
                  className="w-full rounded-lg border bg-slate-50 p-2 text-sm outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">问题与风险</label>
                <textarea
                  value={r.issues}
                  onChange={(e) => setRow(r.id, { issues: e.target.value })}
                  rows={5}
                  className="w-full rounded-lg border bg-slate-50 p-2 text-sm outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
            </div>
          </Card>
        ))}
        {rows.length === 0 && (
          <Card className="flex flex-col items-center gap-3 py-12 text-center text-slate-400">
            <Users className="h-8 w-8" />
            <p className="text-sm">本周还没有周报成员。先从「管理」页维护成员名单，或点下方临时添加。</p>
          </Card>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={addTempRow}>
          <Plus className="h-4 w-4" /> 临时添加成员（不进名单）
        </Button>
        <Link href="/admin">
          <Button variant="ghost">去管理成员名单</Button>
        </Link>
      </div>

      <Card>
        <CardHeader title="本周成员" right={<ClipboardList className="h-4 w-4 text-slate-400" />} />
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700">{r.name || "（未命名）"}</span>
                <span className="text-xs text-slate-400">{TEAM_LABEL[r.team]}</span>
              </div>
              {r.persisted ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <span className="text-xs text-slate-400">未保存</span>
              )}
            </div>
          ))}
          {rows.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">暂无成员</div>}
        </div>
      </Card>
    </div>
  );
}
