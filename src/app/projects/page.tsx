"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Filter, Plus, RefreshCw, Search, Users } from "lucide-react";
import { Card, Input, Select, Button } from "@/components/ui";
import { StatusBadge } from "@/components/ui/badge";
import { listProjects, evaluate, subscribe } from "@/lib/store";
import { fmtDate } from "@/lib/utils";

type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  pmList: string[];
  status: string;
  warning: string | null;
  milestones: Array<{ name: string; plannedDate: string | null; actualDate: string | null }>;
};

const STATUS_FILTERS = [
  { value: "ALL", label: "全部状态" },
  { value: "LATE_RISK", label: "有延期风险" },
  { value: "DATE_ISSUE", label: "日期待核对" },
  { value: "PENDING_ACTUAL", label: "待补实际日期" },
  { value: "ACCEPTED", label: "已验收" },
  { value: "ON_TRACK", label: "正常推进" },
  { value: "NOT_STARTED", label: "未开始" },
];

function buildRows(): ProjectRow[] {
  return listProjects()
    .map((p) => {
      const ev = evaluate(p);
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        pmList: p.managers,
        status: ev.statusInfo.status,
        warning: ev.statusInfo.warning,
        milestones: p.milestones.map((m) => ({
          name: m.name,
          plannedDate: m.plannedDate,
          actualDate: m.actualDate,
        })),
      };
    })
    .filter((p) => {
      const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const status = sp.get("status") || "ALL";
      if (status === "ALL") return true;
      return p.status === status;
    });
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">加载中…</div>}>
      <ProjectsPageInner />
    </Suspense>
  );
}

function ProjectsPageInner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get("status") || "ALL");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProjectRow[]>([]);

  const load = useCallback(() => {
    setRows(buildRows());
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribe("__all__", load);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, status]);

  const filtered = rows.filter((p) =>
    q.trim() ? p.name.includes(q.trim()) || (p.code || "").includes(q.trim()) : true
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">项目管理</h1>
          <p className="mt-0.5 text-sm text-slate-500">共 {filtered.length} 个项目</p>
        </div>
        <Link href="/projects/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" /> 新建项目
          </Button>
        </Link>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="搜索项目名称 / 编号…" value={q} onChange={(v) => setQ(v)} className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select value={status} onChange={setStatus} options={STATUS_FILTERS} />
          </div>
          <Button variant="secondary" onClick={load}>
            <RefreshCw className="h-4 w-4" /> 刷新
          </Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">项目名称</th>
                <th className="px-4 py-3 font-medium">编号</th>
                <th className="px-4 py-3 font-medium">负责人(PM)</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">进度节点</th>
                <th className="px-4 py-3 font-medium">提醒</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <ProjectRowView key={p.id} p={p} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    没有符合条件的项目
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ProjectRowView({ p }: { p: ProjectRow }) {
  const doneCount = p.milestones.filter((m) => m.actualDate).length;
  const nextNode = p.milestones.find((m) => !m.actualDate);

  return (
    <tr className="transition hover:bg-slate-50">
      <td className="px-4 py-3">
        <Link href={`/projects/detail?id=${p.id}`} className="font-medium text-blue-700 hover:underline">
          {p.name}
        </Link>
        {p.warning && <div className="mt-0.5 max-w-60 truncate text-xs text-orange-600">{p.warning}</div>}
      </td>
      <td className="px-4 py-3 text-slate-500">{p.code || "—"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <Users className="h-3.5 w-3.5 text-slate-400" />
          {p.pmList.length > 0 ? (
            p.pmList.map((m, i) => (
              <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {m}
              </span>
            ))
          ) : (
            <span className="text-slate-400">未指定</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={p.status} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${p.milestones.length ? (doneCount / p.milestones.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">
            {doneCount}/{p.milestones.length}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {nextNode ? (
          <span>
            {nextNode.name}
            {nextNode.plannedDate ? ` · ${fmt(nextNode.plannedDate)}` : ""}
          </span>
        ) : (
          <span className="text-green-600">全部完成</span>
        )}
      </td>
    </tr>
  );
}

function fmt(d: string | null): string {
  if (!d) return "";
  return fmtDate(d);
}
