"use client";

// 纯浏览器端数据层（替代 Prisma + project-service + auth + audit）
// 数据全部存于 localStorage，单机管理员使用，无后端、无数据库。

import { evaluateProject, type ProjectStatusInfo } from "@/lib/status";
import { splitPm, uid, fmtDate, parseDate } from "@/lib/utils";

export type TeamKey = "PROJECT" | "AFTERSALES" | "QA";
export type SubTeamKey = "A" | "B" | "C" | "NONE";

export const TEAMS: TeamKey[] = ["PROJECT", "AFTERSALES", "QA"];

export const TEAM_LABEL: Record<TeamKey, string> = {
  PROJECT: "项目组",
  AFTERSALES: "售后组",
  QA: "质安组",
};

/** 大组 → 可用的小组列表（只有项目组分 A/B/C） */
export const SUB_TEAMS: Record<TeamKey, SubTeamKey[]> = {
  PROJECT: ["A", "B", "C"],
  AFTERSALES: ["NONE"],
  QA: ["NONE"],
};

export const SUBTEAM_LABEL: Record<SubTeamKey, string> = {
  A: "A 组",
  B: "B 组",
  C: "C 组",
  NONE: "—",
};

export interface Milestone {
  id: string;
  name: string;
  order: number;
  plannedDate: string | null;
  actualDate: string | null;
  updatedBy: string | null;
}

export interface Project {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  pmRaw: string | null;
  startDate: string | null;
  endDate: string | null;
  remark: string | null;
  source: string;
  updatedBy: string | null;
  version: number;
  milestones: Milestone[];
  managers: string[];
  team: TeamKey | null;
  subTeam: SubTeamKey;
}

export interface Member {
  id: string;
  name: string;
  team: TeamKey;
  subTeam: SubTeamKey;
  active: boolean;
}

export interface WeeklyReport {
  id: string;
  weekKey: string;
  memberId: string;
  memberName: string;
  team: TeamKey;
  subTeam: SubTeamKey;
  content: string;
  planned: string | null;
  issues: string | null;
  updatedAt: string;
}

export interface ImportLog {
  id: string;
  fileName: string;
  sheetName: string;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  errors: string[];
  createdAt: string;
}

const KEYS = {
  projects: "pt.projects",
  members: "pt.members",
  weekly: "pt.weekly",
  imports: "pt.imports",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  notify(key);
}

// 简单的订阅机制，让页面在 store 变化后刷新
const listeners = new Map<string, Set<() => void>>();
function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
  listeners.get("__all__")?.forEach((fn) => fn());
}
export function subscribe(key: string, fn: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(fn);
  listeners.set(key, set);
  return () => set.delete(fn);
}

/* ----------------------------- 项目 ----------------------------- */

export function listProjects(): Project[] {
  const raw = read<Project[]>(KEYS.projects, []);
  let migrated = false;
  const normalized = raw.map((p) => {
    if (p.team === undefined || p.subTeam === undefined) {
      migrated = true;
      const managers = syncManagers(p.pmRaw);
      const resolved = resolveTeamByPM(managers);
      return {
        ...p,
        managers,
        team: resolved?.team ?? null,
        subTeam: resolved?.subTeam ?? "NONE",
      };
    }
    return p;
  });
  if (migrated) write(KEYS.projects, normalized);
  return normalized.sort((a, b) => a.name.localeCompare(b.name));
}

export function getProject(id: string): Project | undefined {
  return read<Project[]>(KEYS.projects, []).find((p) => p.id === id);
}

/** 用 status.ts 给项目补充计算字段 */
export function evaluate(p: Project): Project & { statusInfo: ProjectStatusInfo } {
  const info = evaluateProject(
    p.milestones.map((m) => ({
      name: m.name,
      order: m.order,
      plannedDate: parseDate(m.plannedDate),
      actualDate: parseDate(m.actualDate),
    }))
  );
  return { ...p, statusInfo: info };
}

function persistProjects(projects: Project[]) {
  write(KEYS.projects, projects);
}

function syncManagers(pmRaw: string | null): string[] {
  if (!pmRaw) return [];
  return Array.from(new Set(splitPm(pmRaw).map((s) => s.trim()).filter(Boolean)));
}

/** 根据 PM 名字推断所属大组/子组（查成员名单），找不到返回 null */
function resolveTeamByPM(pmNames: string[]): { team: TeamKey; subTeam: SubTeamKey } | null {
  if (pmNames.length === 0) return null;
  const members = read<Member[]>(KEYS.members, []);
  for (const name of pmNames) {
    const m = members.find((x) => x.name === name && x.active);
    if (m) return { team: m.team, subTeam: m.subTeam };
  }
  return null;
}

function refreshStatus(p: Project): Project {
  // evaluateProject 已在 evaluate() 中计算，这里确保 managers 同步，并按 PM 推断 team/subTeam
  const managers = syncManagers(p.pmRaw);
  const resolved = resolveTeamByPM(managers);
  return {
    ...p,
    managers,
    team: p.team ?? resolved?.team ?? null,
    subTeam: p.subTeam ?? resolved?.subTeam ?? "NONE",
  };
}

export interface ProjectInput {
  name: string;
  code?: string | null;
  category?: string | null;
  pmRaw?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  remark?: string | null;
  team?: TeamKey | null;
  subTeam?: SubTeamKey;
  milestones?: { name: string; plannedDate: string | null; actualDate: string | null }[];
}

export function createProject(input: ProjectInput): Project {
  const projects = read<Project[]>(KEYS.projects, []);
  const now = new Date().toISOString();
  const p: Project = refreshStatus({
    id: uid("p_"),
    name: input.name,
    code: input.code ?? null,
    category: input.category ?? null,
    pmRaw: input.pmRaw ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    remark: input.remark ?? null,
    source: "MANUAL",
    updatedBy: "管理员",
    version: 1,
    milestones: (input.milestones ?? []).map((m, i) => ({
      id: uid("m_"),
      name: m.name,
      order: i,
      plannedDate: m.plannedDate ?? null,
      actualDate: m.actualDate ?? null,
      updatedBy: "管理员",
    })),
    managers: [],
    team: input.team ?? null,
    subTeam: input.subTeam ?? "NONE",
  });
  projects.push(p);
  persistProjects(projects);
  return p;
}

export function updateProject(id: string, input: ProjectInput): Project | undefined {
  const projects = read<Project[]>(KEYS.projects, []);
  const idx = projects.findIndex((p) => p.id === id);
  if (idx < 0) return undefined;
  const prev = projects[idx];
  const updated: Project = refreshStatus({
    ...prev,
    name: input.name,
    code: input.code ?? prev.code,
    category: input.category ?? prev.category,
    pmRaw: input.pmRaw ?? prev.pmRaw,
    startDate: input.startDate ?? prev.startDate,
    endDate: input.endDate ?? prev.endDate,
    remark: input.remark ?? prev.remark,
    version: prev.version + 1,
    updatedBy: "管理员",
    team: input.team ?? prev.team,
    subTeam: input.subTeam ?? prev.subTeam,
    milestones: (input.milestones ?? []).map((m, i) => ({
      id: uid("m_"),
      name: m.name,
      order: i,
      plannedDate: m.plannedDate ?? null,
      actualDate: m.actualDate ?? null,
      updatedBy: "管理员",
    })),
  });
  projects[idx] = updated;
  persistProjects(projects);
  return updated;
}

export function deleteProject(id: string): void {
  const projects = read<Project[]>(KEYS.projects, []).filter((p) => p.id !== id);
  persistProjects(projects);
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

export interface ImportedProject {
  row: number;
  name: string;
  code: string | null;
  pmRaw: string | null;
  startDate: string | null;
  endDate: string | null;
  milestones: { name: string; plannedDate: string | null; actualDate: string | null }[];
}

export function importProjects(
  parsed: { sheetName: string; projects: ImportedProject[]; errors: string[] },
  file: { name: string },
  mode: "upsert" | "replace"
): ImportSummary {
  const all = read<Project[]>(KEYS.projects, []);
  let created = 0,
    updated = 0,
    failed = 0;
  const failRows: string[] = [];

  let projects = all;
  if (mode === "replace") {
    projects = [];
  }

  for (const p of parsed.projects) {
    try {
      const existing = projects.find((x) => x.name === p.name);
      if (existing && mode === "upsert") {
        const idx = projects.findIndex((x) => x.id === existing.id);
        projects[idx] = refreshStatus({
          ...existing,
          code: p.code ?? existing.code,
          pmRaw: p.pmRaw || existing.pmRaw,
          startDate: p.startDate ?? existing.startDate,
          endDate: p.endDate ?? existing.endDate,
          source: "IMPORTED",
          updatedBy: "管理员",
          version: existing.version + 1,
          milestones: p.milestones.map((m, i) => ({
            id: uid("m_"),
            name: m.name,
            order: i,
            plannedDate: m.plannedDate,
            actualDate: m.actualDate,
            updatedBy: "管理员",
          })),
        });
        updated++;
      } else {
        if (existing && mode === "replace") {
          projects = projects.filter((x) => x.id !== existing.id);
        }
        projects.push(
          refreshStatus({
            id: uid("p_"),
            name: p.name,
            code: p.code,
            category: null,
            pmRaw: p.pmRaw,
            startDate: p.startDate,
            endDate: p.endDate,
            remark: null,
            source: "IMPORTED",
            updatedBy: "管理员",
            version: 1,
            milestones: p.milestones.map((m, i) => ({
              id: uid("m_"),
              name: m.name,
              order: i,
              plannedDate: m.plannedDate,
              actualDate: m.actualDate,
              updatedBy: "管理员",
            })),
            managers: [],
            team: null,
            subTeam: "NONE",
          })
        );
        created++;
      }
    } catch (e) {
      failed++;
      failRows.push(`第 ${p.row} 行「${p.name}」导入失败`);
    }
  }

  persistProjects(projects);

  const log: ImportLog = {
    id: uid("imp_"),
    fileName: file.name,
    sheetName: parsed.sheetName,
    totalRows: parsed.projects.length,
    createdRows: created,
    updatedRows: updated,
    errorRows: failed,
    errors: [...parsed.errors, ...failRows],
    createdAt: new Date().toISOString(),
  };
  const logs = read<ImportLog[]>(KEYS.imports, []);
  logs.unshift(log);
  write(KEYS.imports, logs.slice(0, 50));

  return {
    total: parsed.projects.length,
    created,
    updated,
    failed,
    errors: [...parsed.errors, ...failRows],
  };
}

export function listImports(): ImportLog[] {
  return read<ImportLog[]>(KEYS.imports, []);
}

/* ----------------------------- 成员名单 ----------------------------- */

export function listMembers(): Member[] {
  return read<Member[]>(KEYS.members, []);
}

export function createMember(name: string, team: TeamKey, subTeam: SubTeamKey = "NONE"): Member {
  const members = read<Member[]>(KEYS.members, []);
  const m: Member = { id: uid("mem_"), name: name.trim(), team, subTeam, active: true };
  members.push(m);
  write(KEYS.members, members);
  return m;
}

export function updateMember(id: string, patch: Partial<Omit<Member, "id">>): void {
  const members = read<Member[]>(KEYS.members, []);
  const idx = members.findIndex((m) => m.id === id);
  if (idx >= 0) {
    members[idx] = { ...members[idx], ...patch };
    write(KEYS.members, members);
  }
}

export function deleteMember(id: string): void {
  const members = read<Member[]>(KEYS.members, []).filter((m) => m.id !== id);
  write(KEYS.members, members);
}

/* ----------------------------- 周报 ----------------------------- */

export function listWeekly(weekKey: string): WeeklyReport[] {
  return read<WeeklyReport[]>(KEYS.weekly, []).filter((r) => r.weekKey === weekKey);
}

export function listWeeklyAll(): WeeklyReport[] {
  return read<WeeklyReport[]>(KEYS.weekly, []);
}

export function upsertWeekly(input: {
  weekKey: string;
  memberId: string;
  memberName: string;
  team: TeamKey;
  subTeam: SubTeamKey;
  content: string;
  planned: string | null;
  issues: string | null;
}): WeeklyReport {
  const all = read<WeeklyReport[]>(KEYS.weekly, []);
  const idx = all.findIndex((r) => r.weekKey === input.weekKey && r.memberId === input.memberId);
  const now = new Date().toISOString();
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...input, updatedAt: now };
    write(KEYS.weekly, all);
    return all[idx];
  }
  const r: WeeklyReport = { id: uid("w_"), updatedAt: now, ...input };
  all.push(r);
  write(KEYS.weekly, all);
  return r;
}

export function deleteWeekly(id: string): void {
  const all = read<WeeklyReport[]>(KEYS.weekly, []).filter((r) => r.id !== id);
  write(KEYS.weekly, all);
}

export function weeklyWeekKeys(): string[] {
  const set = new Set(read<WeeklyReport[]>(KEYS.weekly, []).map((r) => r.weekKey));
  return Array.from(set).sort().reverse();
}

/* ----------------------------- 导出 Excel 所需数据 ----------------------------- */

export function exportProjects() {
  return listProjects().map((p) => ({
    name: p.name,
    code: p.code,
    category: p.category,
    pmRaw: p.pmRaw,
    startDate: p.startDate,
    endDate: p.endDate,
    remark: p.remark,
    milestones: p.milestones
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        name: m.name,
        order: m.order,
        plannedDate: m.plannedDate,
        actualDate: m.actualDate,
      })),
  }));
}

export function fmtToday(): string {
  return fmtDate(new Date());
}
