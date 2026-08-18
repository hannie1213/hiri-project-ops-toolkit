"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Pencil, RefreshCw, Trash2, Users, XCircle } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { StatusBadge } from "@/components/ui/badge";
import ProjectForm, { type ProjectFormValue } from "@/components/project-form";
import { getProject, evaluate, updateProject, deleteProject, subscribe } from "@/lib/store";
import { fmtDate } from "@/lib/utils";

type DetailView = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  pmRaw: string | null;
  pmList: string[];
  startDate: string | null;
  endDate: string | null;
  remark: string | null;
  source: string;
  version: number;
  updatedBy: string | null;
  milestones: Array<{ id: string; name: string; order: number; plannedDate: string | null; actualDate: string | null }>;
  evaluate: {
    status: string;
    label: string;
    warning: string | null;
    milestoneStatus: Array<{
      name: string;
      isAcceptance: boolean;
      hasDateIssue: boolean;
      dateIssueReason: string | null;
      isPlannedPassed: boolean;
      actualMissing: boolean;
      lateDays: number | null;
      remainingDays: number | null;
      plannedDate: Date | null;
      actualDate: Date | null;
    }>;
  };
};

function toView(id: string): DetailView | null {
  const p = getProject(id);
  if (!p) return null;
  const ev = evaluate(p);
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    category: p.category,
    pmRaw: p.pmRaw,
    pmList: p.managers,
    startDate: p.startDate,
    endDate: p.endDate,
    remark: p.remark,
    source: p.source,
    version: p.version,
    updatedBy: p.updatedBy,
    milestones: p.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      order: m.order,
      plannedDate: m.plannedDate,
      actualDate: m.actualDate,
    })),
    evaluate: {
      status: ev.statusInfo.status,
      label: ev.statusInfo.label,
      warning: ev.statusInfo.warning,
      milestoneStatus: ev.statusInfo.milestoneStatus,
    },
  };
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">加载中…</div>}>
      <ProjectDetailInner />
    </Suspense>
  );
}

function ProjectDetailInner() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  const router = useRouter();
  const [data, setData] = useState<DetailView | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const v = toView(id);
    if (!v) setError("项目不存在");
    else setData(v);
  }, [id]);

  useEffect(() => {
    load();
    const unsub = subscribe("__all__", load);
    return unsub;
  }, [load]);

  async function handleSave(v: ProjectFormValue) {
    setSaving(true);
    try {
      updateProject(id, {
        name: v.name,
        code: v.code,
        category: v.category,
        pmRaw: v.pmRaw,
        startDate: v.startDate || null,
        endDate: v.endDate || null,
        remark: v.remark,
        milestones: v.milestones.map((m) => ({
          name: m.name,
          plannedDate: m.plannedDate || null,
          actualDate: m.actualDate || null,
        })),
      });
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!confirm(`确认删除项目「${data?.name}」？此操作不可恢复。`)) return;
    deleteProject(id);
    router.push("/projects");
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-500">{error}</p>
        <Link href="/projects" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          返回项目列表
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/projects" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> 返回项目列表
        </Link>
        <div className="flex items-center gap-2">
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> 编辑
            </Button>
          )}
          <Button variant="danger" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" /> 删除
          </Button>
        </div>
      </div>

      {editing ? (
        <>
          <ProjectForm
            initial={{
              name: data.name,
              code: data.code ?? "",
              category: data.category ?? "",
              pmRaw: data.pmRaw ?? "",
              startDate: data.startDate ? data.startDate.slice(0, 10) : "",
              endDate: data.endDate ? data.endDate.slice(0, 10) : "",
              remark: data.remark ?? "",
              milestones: data.milestones.map((m) => ({
                name: m.name,
                plannedDate: m.plannedDate ? m.plannedDate.slice(0, 10) : "",
                actualDate: m.actualDate ? m.actualDate.slice(0, 10) : "",
                remark: "",
              })),
              version: data.version,
            }}
            submitting={saving}
            onSubmit={handleSave}
          />
          <div className="text-right">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              取消编辑
            </Button>
          </div>
        </>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900">{data.name}</h1>
                  <StatusBadge status={data.evaluate.status} />
                  {data.source === "IMPORTED" && (
                    <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-600">Excel导入</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                  {data.code && <span>编号：{data.code}</span>}
                  {data.category && <span>分类：{data.category}</span>}
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    负责人：{data.pmList.length > 0 ? data.pmList.join("、") : data.pmRaw || "未指定"}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    {data.startDate ? fmt(data.startDate) : "—"} ~ {data.endDate ? fmt(data.endDate) : "—"}
                  </span>
                </div>
                {data.remark && <div className="mt-2 text-sm text-slate-600">备注：{data.remark}</div>}
              </div>
              <div className="shrink-0 text-right text-xs text-slate-400">
                <div>版本 v{data.version}</div>
                {data.updatedBy && <div>操作人：{data.updatedBy}</div>}
              </div>
            </div>
          </Card>

          {data.evaluate.warning && (
            <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
              <AlertTriangle className="h-5 w-5" />
              {data.evaluate.warning}
            </div>
          )}

          <Card>
            <CardHeader title="进度节点" desc="按节点顺序展示计划 vs 实际日期；验收节点有实际日期 → 项目判定为已验收" />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">节点</th>
                    <th className="px-4 py-3 font-medium">计划日期</th>
                    <th className="px-4 py-3 font-medium">实际日期</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.evaluate.milestoneStatus.map((m, i) => (
                    <tr key={i} className={m.hasDateIssue ? "bg-red-50/50" : ""}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {m.name}
                        {m.isAcceptance && (
                          <span className="ml-1.5 rounded bg-blue-50 px-1 py-0.5 text-xs text-blue-600">终审</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmt(m.plannedDate) || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{fmt(m.actualDate) || "—"}</td>
                      <td className="px-4 py-3">
                        <MilestoneFlag m={m} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {m.dateIssueReason ?? (m.actualMissing && !m.isPlannedPassed && m.remainingDays != null ? `距计划 ${m.remainingDays} 天` : "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="项目过程" desc="按时间线展示每个节点从计划到实际完成的全过程" />
            <ol className="relative space-y-4 p-5">
              <span className="absolute left-[27px] top-5 bottom-5 w-px bg-slate-200" />
              {data.evaluate.milestoneStatus.map((m, i) => {
                const dotColor = m.hasDateIssue
                  ? "bg-red-500"
                  : m.actualDate
                  ? "bg-green-500"
                  : m.isPlannedPassed
                  ? "bg-orange-500"
                  : !m.plannedDate
                  ? "bg-purple-500"
                  : "bg-blue-500";
                return (
                  <li key={i} className="relative flex gap-3 pl-1">
                    <span className={`z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white ${dotColor}`} />
                    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                          阶段 {i + 1}：{m.name}
                        </span>
                        {m.isAcceptance && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">终审节点</span>
                        )}
                        <MilestoneFlag m={m} />
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                        <div>
                          <div className="text-slate-400">计划</div>
                          <div className="font-medium text-slate-700">{fmt(m.plannedDate) || "未排期"}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">实际</div>
                          <div className="font-medium text-slate-700">{fmt(m.actualDate) || "待补"}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">偏差</div>
                          <div className="font-medium text-slate-700">
                            {m.actualDate && m.plannedDate
                              ? (() => {
                                  const diff = Math.round(
                                    (m.actualDate.getTime() - m.plannedDate.getTime()) / 86400000
                                  );
                                  if (diff === 0) return "按期";
                                  return diff > 0 ? `+${diff} 天（滞后）` : `${diff} 天（提前）`;
                                })()
                              : m.actualMissing && m.isPlannedPassed && m.lateDays != null
                              ? `已逾期 ${m.lateDays} 天`
                              : m.remainingDays != null
                              ? `距计划 ${m.remainingDays} 天`
                              : "—"}
                          </div>
                        </div>
                      </div>
                      {m.dateIssueReason && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="h-3 w-3" /> {m.dateIssueReason}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card>
            <CardHeader title="项目信息" desc="基础元数据与版本信息" />
            <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-400">项目编号</dt>
                <dd className="text-slate-700">{data.code || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">分类</dt>
                <dd className="text-slate-700">{data.category || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">数据来源</dt>
                <dd className="text-slate-700">
                  {data.source === "IMPORTED" ? "Excel 导入" : data.source === "MANUAL" ? "手动创建" : data.source}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">项目起止</dt>
                <dd className="text-slate-700">
                  {data.startDate ? fmt(data.startDate) : "—"} ~ {data.endDate ? fmt(data.endDate) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">当前版本</dt>
                <dd className="text-slate-700">v{data.version}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">最近操作人</dt>
                <dd className="text-slate-700">{data.updatedBy || "—"}</dd>
              </div>
              {data.remark && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs text-slate-400">备注</dt>
                  <dd className="text-slate-700">{data.remark}</dd>
                </div>
              )}
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}

function MilestoneFlag({ m }: { m: DetailView["evaluate"]["milestoneStatus"][number] }) {
  if (m.hasDateIssue)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
        <XCircle className="h-3.5 w-3.5" /> 日期待核对
      </span>
    );
  if (m.actualDate)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
        <CheckCircle2 className="h-3.5 w-3.5" /> 已完成
      </span>
    );
  if (m.isPlannedPassed)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600">
        <AlertTriangle className="h-3.5 w-3.5" /> 待补实际日期
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
      <RefreshCw className="h-3.5 w-3.5" /> 待补实际日期
    </span>
  );
}

function fmt(d: Date | string | null): string {
  if (!d) return "";
  return fmtDate(d);
}
