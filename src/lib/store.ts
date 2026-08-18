"use client";

// 纯浏览器端数据层（替代 Prisma + project-service + auth + audit）
// 数据全部存于 localStorage，单机管理员使用，无后端、无数据库。

import { evaluateProject, type ProjectStatusInfo } from "@/lib/status";
import { splitPm, uid, fmtDate, parseDate } from "@/lib/utils";

/** 5 个平级组别（项目组分 A/B/C，与质安组/售后组并列） */
export type TeamKey = "A" | "B" | "C" | "QA" | "AFTERSALES";
export type SubTeamKey = "A" | "B" | "C" | "NONE";

export const TEAMS: TeamKey[] = ["A", "B", "C", "QA", "AFTERSALES"];

export const TEAM_LABEL: Record<TeamKey, string> = {
  A: "项目组 A 组",
  B: "项目组 B 组",
  C: "项目组 C 组",
  QA: "质安组",
  AFTERSALES: "售后组",
};

/** 大组 → 可用的小组列表（保留 API，向后兼容；只有项目组分 A/B/C） */
export const SUB_TEAMS: Record<TeamKey, SubTeamKey[]> = {
  A: ["A"],
  B: ["B"],
  C: ["C"],
  QA: ["NONE"],
  AFTERSALES: ["NONE"],
};

export const SUBTEAM_LABEL: Record<SubTeamKey, string> = {
  A: "A 组",
  B: "B 组",
  C: "C 组",
  NONE: "—",
};

/** 根据 team 自动得到 subTeam（A/B/C → 自身；其他 → NONE） */
export function autoSubTeam(team: TeamKey): SubTeamKey {
  return team === "A" || team === "B" || team === "C" ? team : "NONE";
}

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
    if (p.team === undefined) {
      migrated = true;
      return { ...p, team: null };
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

function refreshStatus(p: Project): Project {
  // evaluateProject 已在 evaluate() 中计算，这里仅确保 managers 与 pmRaw 同步
  // team 由管理员在表单中手动指定，不做自动推断
  return {
    ...p,
    managers: syncManagers(p.pmRaw),
    team: p.team ?? null,
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

/** 默认周报成员名单（首次加载时自动写入，管理员可自行增删改） */
const DEFAULT_MEMBERS: Array<{ name: string; team: TeamKey }> = [
  // 项目组 A 组
  { name: "严志展", team: "A" },
  { name: "詹小坊", team: "A" },
  { name: "代友林", team: "A" },
  { name: "左凯", team: "A" },
  { name: "陈俊明", team: "A" },
  { name: "林锦", team: "A" },
  { name: "吴杰", team: "A" },
  { name: "陈默涵", team: "A" },
  { name: "焦佳豪", team: "A" },
  { name: "温彩德", team: "A" },
  // 项目组 B 组
  { name: "杨郑明", team: "B" },
  { name: "林颖喆", team: "B" },
  { name: "谷浩天", team: "B" },
  { name: "张耿标", team: "B" },
  { name: "吴毅强", team: "B" },
  { name: "蔡圣炜", team: "B" },
  { name: "赵龙", team: "B" },
  { name: "黄传武", team: "B" },
  { name: "郑凯轩", team: "B" },
  { name: "李志浩", team: "B" },
  // 项目组 C 组
  { name: "魏向中", team: "C" },
  { name: "周飞明", team: "C" },
  { name: "蒋家苓", team: "C" },
  { name: "陈权", team: "C" },
  { name: "王一帆", team: "C" },
  { name: "林子涵", team: "C" },
  { name: "郭柳江", team: "C" },
  { name: "岳佳成", team: "C" },
  { name: "阮腾伟", team: "C" },
  // 质安组
  { name: "杜思明", team: "QA" },
  // 售后组
  { name: "谢木江", team: "AFTERSALES" },
  { name: "刘仲武", team: "AFTERSALES" },
];

function seedDefaultMembers(): Member[] {
  return DEFAULT_MEMBERS.map((d, i) => ({
    id: `mem_default_${i}`,
    name: d.name,
    team: d.team,
    subTeam: autoSubTeam(d.team),
    active: true,
  }));
}

export function listMembers(): Member[] {
  const key = KEYS.members;
  // 首次访问（localStorage 无该键）时写入默认名单
  if (typeof window !== "undefined" && window.localStorage.getItem(key) === null) {
    const seeded = seedDefaultMembers();
    write(key, seeded);
    return seeded;
  }
  return read<Member[]>(KEYS.members, []);
}

/** 重置成员名单为默认名单 */
export function resetToDefaultMembers(): Member[] {
  const seeded = seedDefaultMembers();
  write(KEYS.members, seeded);
  return seeded;
}

export function createMember(name: string, team: TeamKey, _subTeam?: SubTeamKey): Member {
  const members = read<Member[]>(KEYS.members, []);
  const m: Member = { id: uid("mem_"), name: name.trim(), team, subTeam: autoSubTeam(team), active: true };
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
  subTeam?: SubTeamKey;
  content: string;
  planned: string | null;
  issues: string | null;
}): WeeklyReport {
  const all = read<WeeklyReport[]>(KEYS.weekly, []);
  const idx = all.findIndex((r) => r.weekKey === input.weekKey && r.memberId === input.memberId);
  const now = new Date().toISOString();
  const fixed = { ...input, subTeam: autoSubTeam(input.team) };
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...fixed, updatedAt: now };
    write(KEYS.weekly, all);
    return all[idx];
  }
  const r: WeeklyReport = { id: uid("w_"), updatedAt: now, ...fixed };
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
