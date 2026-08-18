"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Filter, Plus, RefreshCw, Search, Users } from "lucide-react";
import { Card, Input, Select, Button } from "@/components/ui";
import { StatusBadge } from "@/components/ui/badge";
import { listProjects, evaluate, listMembers, subscribe, TEAMS, TEAM_LABEL, SUBTEAM_LABEL, SUB_TEAMS, type TeamKey, type SubTeamKey } from "@/lib/store";
import { fmtDate } from "@/lib/utils";

type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  pmRaw: string | null;
  pmList: string[];
  status: string;
  warning: string | null;
  milestones: Array<{ name: string; plannedDate: string | null; actualDate: string | null }>;
};

const STATUS_FILTERS = [
  { value: "ALL", label: "全部状态" },
  { value: "LATE_RISK", label: "有延期风险" },
  { value: "DATE_ISSUE", label: "日期待核对" },
  { value: "NO_PLAN", label: "计划待填" },
  { value: "PENDING_ACTUAL", label: "待补实际日期" },
  { value: "ACCEPTED", label: "已验收" },
  { value: "ON_TRACK", label: "正常推进" },
  { value: "NOT_STARTED", label: "未开始" },
];

const TEAM_FILTERS = [
  { value: "ALL", label: "全部组" },
  ...TEAMS.map((t) => ({ value: t, label: TEAM_LABEL[t] })),
];

const SUBTEAM_FILTERS = [
  { value: "ALL", label: "全部子组" },
  ...SUB_TEAMS.PROJECT.map((s) => ({ value: s, label: SUBTEAM_LABEL[s] })),
];

function buildRows(): ProjectRow[] {
  return listProjects().map((p) => {
    const ev = evaluate(p);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      pmRaw: p.pmRaw,
      pmList: p.managers,
      status: ev.statusInfo.status,
      warning: ev.statusInfo.warning,
      milestones: p.milestones.map((m) => ({
        name: m.name,
        plannedDate: m.plannedDate,
        actualDate: m.actualDate,
      })),
    };
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
  const [team, setTeam] = useState<TeamKey | "ALL">((sp.get("team") as TeamKey) || "ALL");
  const [subTeam, setSubTeam] = useState<SubTeamKey | "ALL">((sp.get("sub") as SubTeamKey) || "ALL");
  const [q, setQ] = useState("");
  const [pmName, setPmName] = useState("");
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [memberNames, setMemberNames] = useState<string[]>([]);

  const load = useCallback(() => {
    setRows(buildRows());
    setMemberNames(listMembers().filter((m) => m.active).map((m) => m.name).sort((a, b) => a.localeCompare(b, "zh")));
  }, []);

  useEffect(() => {
    load();
    const unsub = subscribe("__all__", load);
    return unsub;
  }, [load]);

  const filtered = useMemo(() => {
    const qTrim = q.trim();
    const pmTrim = pmName.trim();
    return rows.filter((p) => {
      if (status !== "ALL" && p.status !== status) return false;
      if (team !== "ALL") {
        // 项目组归类：只要项目里至少有一个 PM 是该组成员就归到该组
        // 简化规则：用 PM 名字是否在 listMembers 的该组成员里判断
        const inTeam = p.pmList.some((name) => {
          const m = listMembers().find((x) => x.name === name);
          return m?.team === team;
        });
        // 如果没在成员名单找到任何 PM，回退到按名称包含
        const any = p.pmList.some((n) => n.includes(nameOrLabel(team)));
        if (!inTeam && !any) {
          // 全部 PM 都不在 listMembers 中，按名称模糊匹配 TEAM_LABEL
          const labelMatch = p.pmRaw ? p.pmRaw.includes(nameOrLabel(team)) : false;
          if (!labelMatch) return false;
        }
      }
      if (subTeam !== "ALL" && team === "PROJECT") {
        const inSub = p.pmList.some((name) => {
          const m = listMembers().find((x) => x.name === name);
          return m?.team === "PROJECT" && m.subTeam === subTeam;
        });
        if (!inSub) return false;
      }
      if (qTrim && !p.name.includes(qTrim) && !(p.code || "").includes(qTrim)) return false;
      if (pmTrim && !p.pmList.some((n) => n.includes(pmTrim))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, status, team, subTeam, q, pmName, memberNames]);

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
          <div className="relative min-w-40 flex-1">
            <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="按 PM 名字筛选…"
              value={pmName}
              onChange={(v) => setPmName(v)}
              className="pl-9"
              list="pm-options"
            />
            <datalist id="pm-options">
              {memberNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select value={status} onChange={setStatus} options={STATUS_FILTERS} />
            <Select
              value={team}
              onChange={(v) => {
                setTeam(v as TeamKey | "ALL");
                if (v !== "PROJECT") setSubTeam("ALL");
              }}
              options={TEAM_FILTERS}
            />
            {team === "PROJECT" && (
              <Select
                value={subTeam}
                onChange={(v) => setSubTeam(v as SubTeamKey | "ALL")}
                options={SUBTEAM_FILTERS}
              />
            )}
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
                <th className="px-4 py-3 font-medium">所属组</th>
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
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
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

function nameOrLabel(team: TeamKey): string {
  // 用于 PM 字段没在 listMembers 中时回退匹配
  return TEAM_LABEL[team];
}

function ProjectRowView({ p }: { p: ProjectRow }) {
  const doneCount = p.milestones.filter((m) => m.actualDate).length;
  const nextNode = p.milestones.find((m) => !m.actualDate);

  // 计算项目所属组（按 PM 推算）
  const teamOfPM = (): { team: string; sub?: string } => {
    const members = listMembers();
    for (const name of p.pmList) {
      const m = members.find((x) => x.name === name);
      if (m) return { team: TEAM_LABEL[m.team], sub: m.team === "PROJECT" ? SUBTEAM_LABEL[m.subTeam] : undefined };
    }
    return { team: "未指定" };
  };
  const group = teamOfPM();

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
      <td className="px-4 py-3 text-xs">
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
          {group.team}
          {group.sub && group.sub !== "—" ? ` · ${group.sub}` : ""}
        </span>
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
