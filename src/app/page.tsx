"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, FileSpreadsheet, ShieldAlert, Timer } from "lucide-react";
import { Card, CardHeader, Button } from "@/components/ui";
import { StatusBadge } from "@/components/ui/badge";
import { listProjects, evaluate, listWeeklyAll, subscribe, type Project } from "@/lib/store";
import { upcomingMilestones } from "@/lib/status";
import { mondayOf, fmtDate } from "@/lib/utils";

type DashData = {
  stats: Record<string, number>;
  upcoming: Record<number | "noPlan", Array<{ projectId: string; projectName: string; milestone: { name: string; plannedDate: string | null }; days: number }>>;
  lateRisks: Array<{ projectId: string; projectName: string; pm: string; milestone: { name: string; plannedDate: string | null; lateDays: number | null } }>;
  weekly: { weekKey: string; total: number; submitted: number };
  projects: Array<{ id: string; name: string; status: string }>;
};

const WINDOWS = [7, 14, 30, 60];

function buildDash(): DashData {
  const projects = listProjects().map(evaluate);
  const stats: Record<string, number> = {};
  const lateRisks: DashData["lateRisks"] = [];
  const upcoming: DashData["upcoming"] = { 7: [], 14: [], 30: [], 60: [], noPlan: [] };
  const today = new Date();

  for (const p of projects) {
    stats[p.statusInfo.status] = (stats[p.statusInfo.status] ?? 0) + 1;
    for (const ms of p.statusInfo.milestoneStatus) {
      if (ms.lateDays != null && ms.actualMissing) {
        lateRisks.push({
          projectId: p.id,
          projectName: p.name,
          pm: p.pmRaw || "—",
          milestone: { name: ms.name, plannedDate: ms.plannedDate ? fmtDate(ms.plannedDate) : null, lateDays: ms.lateDays },
        });
      }
    }
    const ups = upcomingMilestones(p.statusInfo);
    for (const w of WINDOWS) {
      for (const u of ups[w]) {
        const days = u.remainingDays ?? 0;
        if (days >= 0 && days <= w) {
          upcoming[w].push({
            projectId: p.id,
            projectName: p.name,
            milestone: { name: u.name, plannedDate: fmtDate(u.plannedDate) },
            days,
          });
        }
      }
    }
    for (const u of ups.noPlan) {
      upcoming.noPlan.push({
        projectId: p.id,
        projectName: p.name,
        milestone: { name: u.name, plannedDate: null },
        days: 0,
      });
    }
  }

  const weekKey = mondayOf();
  const weeklyRows = listWeeklyAll().filter((r) => r.weekKey === weekKey);
  const total = weeklyRows.length;
  const submitted = weeklyRows.length; // 本地版：管理员录入即视为已提交

  const recent = [...projects]
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
    .slice(0, 9)
    .map((p) => ({ id: p.id, name: p.name, status: p.statusInfo.status }));

  return {
    stats: {
      TOTAL: projects.length,
      LATE_RISK: stats["LATE_RISK"] ?? 0,
      DATE_ISSUE: stats["DATE_ISSUE"] ?? 0,
      PENDING_ACTUAL: stats["PENDING_ACTUAL"] ?? 0,
      ACCEPTED: stats["ACCEPTED"] ?? 0,
      ON_TRACK: stats["ON_TRACK"] ?? 0,
    },
    upcoming,
    lateRisks,
    weekly: { weekKey, total, submitted },
    projects: recent,
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    setData(buildDash());
    const unsub = subscribe("__all__", () => setData(buildDash()));
    return unsub;
  }, []);

  if (!data) {
    return (
      <div className="grid gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
    );
  }

  const weeklyPercent = data.weekly.total ? Math.round((data.weekly.submitted / data.weekly.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { key: "TOTAL", label: "项目总数", color: "bg-slate-500", text: "text-slate-700" },
          { key: "LATE_RISK", label: "有延期风险", color: "bg-orange-500", text: "text-orange-700" },
          { key: "NO_PLAN", label: "计划待填", color: "bg-purple-500", text: "text-purple-700" },
          { key: "DATE_ISSUE", label: "日期待核对", color: "bg-red-500", text: "text-red-700" },
          { key: "PENDING_ACTUAL", label: "待补实际日期", color: "bg-amber-500", text: "text-amber-700" },
          { key: "ACCEPTED", label: "已验收", color: "bg-green-500", text: "text-green-700" },
          { key: "ON_TRACK", label: "正常推进", color: "bg-blue-500", text: "text-blue-700" },
        ].map((c) => (
          <Card key={c.key} className="p-4">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${c.color}`} />
              <span className="text-xs text-slate-500">{c.label}</span>
            </div>
            <div className={`mt-2 text-2xl font-bold ${c.text}`}>{data.stats[c.key] ?? 0}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="延期风险"
            desc="非验收节点计划日期已过且未填实际日期"
            right={
              <Link href="/projects?status=LATE_RISK">
                <Button variant="ghost" className="text-xs">
                  查看全部
                </Button>
              </Link>
            }
          />
          <div className="max-h-80 divide-y overflow-y-auto">
            {data.lateRisks.length === 0 && (
              <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                当前没有延期风险项目
              </div>
            )}
            {data.lateRisks.map((r, i) => (
              <Link key={i} href={`/projects/detail?id=${r.projectId}`} className="flex items-center justify-between px-5 py-3 transition hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{r.projectName}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />
                    节点「{r.milestone.name}」计划 {r.milestone.plannedDate || "—"} 已逾期 {r.milestone.lateDays ?? 0} 天
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-400">负责人：{r.pm}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="本周周报"
            desc={data.weekly.weekKey}
            right={
              <Link href="/weekly">
                <Button variant="ghost" className="text-xs">
                  去填写
                </Button>
              </Link>
            }
          />
          <div className="p-5">
            <div className="flex items-end justify-between">
              <div className="text-3xl font-bold text-slate-900">
                {data.weekly.submitted}
                <span className="text-lg text-slate-400">/{data.weekly.total}</span>
              </div>
              <span className="text-sm text-slate-500">{weeklyPercent}%</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${weeklyPercent}%` }} />
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
              <ClipboardList className="h-3.5 w-3.5" /> 已录入 {data.weekly.submitted} / {data.weekly.total} 人
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="到期提醒"
          desc="按 7/14/30/60 天窗口展示临近节点；计划未填的节点单列提示（已验收项目不参与）"
          right={
            <Link href="/reminders">
              <Button variant="ghost" className="text-xs">
                完整提醒清单
              </Button>
            </Link>
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
          {WINDOWS.map((w) => (
            <div
              key={w}
              className={`rounded-xl border p-4 ${
                w === 7
                  ? "border-red-200 bg-red-50 text-red-700"
                  : w === 14
                  ? "border-orange-200 bg-orange-50 text-orange-700"
                  : w === 30
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Timer className="h-4 w-4" />
                {w}天内到期
              </div>
              <div className="mt-1 text-2xl font-bold">{data.upcoming[w]?.length ?? 0}</div>
              <div className="mt-3 space-y-1.5">
                {(data.upcoming[w] ?? []).slice(0, 5).map((u, i) => (
                  <Link key={i} href={`/projects/detail?id=${u.projectId}`} className="block truncate text-xs hover:underline">
                    <span className="font-medium">{u.projectName}</span> · {u.milestone.name}
                    <span className="ml-1 text-slate-400">{u.days}天</span>
                  </Link>
                ))}
                {(data.upcoming[w] ?? []).length === 0 && <div className="text-xs opacity-70">暂无</div>}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 text-purple-700">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Timer className="h-4 w-4" />
              计划待填
            </div>
            <div className="mt-1 text-2xl font-bold">{data.upcoming.noPlan?.length ?? 0}</div>
            <div className="mt-3 space-y-1.5">
              {(data.upcoming.noPlan ?? []).slice(0, 5).map((u, i) => (
                <Link key={i} href={`/projects/detail?id=${u.projectId}`} className="block truncate text-xs hover:underline">
                  <span className="font-medium">{u.projectName}</span> · {u.milestone.name}
                  <span className="ml-1 text-slate-400">未排期</span>
                </Link>
              ))}
              {(data.upcoming.noPlan ?? []).length === 0 && <div className="text-xs opacity-70">暂无</div>}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="最近更新的项目"
          right={
            <Link href="/projects">
              <Button variant="ghost" className="text-xs">
                全部项目
              </Button>
            </Link>
          }
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between rounded-lg border p-3 transition hover:border-blue-300 hover:bg-blue-50/50">
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate text-sm font-medium text-slate-700">{p.name}</span>
              </div>
              <StatusBadge status={p.status} />
            </Link>
          ))}
          {data.projects.length === 0 && (
            <div className="col-span-full flex flex-col items-center py-10 text-slate-400">
              <AlertTriangle className="h-8 w-8" />
              <p className="mt-2 text-sm">暂无项目数据，请先导入 Excel 或手动创建</p>
              <Link href="/import">
                <Button className="mt-4" variant="primary">
                  去导入
                </Button>
              </Link>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
