"use client";

// 纯浏览器端数据层：IndexedDB 持久化，内存镜像保证现有页面可同步读取。

import { evaluateProject, type ProjectStatusInfo } from "@/lib/status";
import { splitPm, uid, fmtDate, parseDate } from "@/lib/utils";

/** 5 个平级组别（项目组分 A/B/C，与质安组/售后组并列） */
export type TeamKey = "A" | "B" | "C" | "QA" | "AFTERSALES";
export type SubTeamKey = "A" | "B" | "C" | "NONE";

export const TEAMS: TeamKey[] = ["A", "B", "C", "QA", "AFTERSALES"];

export const TEAM_LABEL: Record<TeamKey, string> = {
  A: "项目A组",
  B: "项目B组",
  C: "项目C组",
  QA: "质量控制组",
  AFTERSALES: "售后服务组",
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
  dateIssueReason?: string | null;
}

export interface Project {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  contractType?: string | null;
  contractSignedDate?: string | null;
  contractAmount?: string | null;
  upstreamUnit?: string | null;
  marketOwner?: string | null;
  currentStatus?: string | null;
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
  deletedAt?: string | null;
  updatedAt?: string;
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
  settings: "pt.settings",
} as const;

type Key = (typeof KEYS)[keyof typeof KEYS];
const ALL_KEYS = Object.values(KEYS) as Key[];
const DB_NAME = "product-project-tool";
const STORE_NAME = "app-data";
const cache = new Map<string, unknown>(ALL_KEYS.map((key) => [key, key === KEYS.settings ? {} : []]));
let initialized = false;
let initPromise: Promise<void> | null = null;
let lastSavedAt: string | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function initialize(): Promise<void> {
  if (typeof window === "undefined" || initialized) return;
  const db = await openDb();
  await Promise.all(ALL_KEYS.map((key) => new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      let value = request.result;
      // 一次性迁移旧版 localStorage 数据，之后所有写入都进入 IndexedDB。
      if (value === undefined) {
        try { const legacy = window.localStorage.getItem(key); if (legacy) value = JSON.parse(legacy); } catch { /* ignore */ }
      }
      if (value !== undefined) cache.set(key, value);
      resolve();
    };
    request.onerror = () => resolve();
  })));
  const meta = await new Promise<string | null>((resolve) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get("__lastSavedAt");
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
  lastSavedAt = meta;
  initialized = true;
  db.close();
  notify("__all__");
}

export function ensureStoreReady(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  initPromise ??= initialize().catch((error) => { console.error("IndexedDB 初始化失败", error); });
  return initPromise;
}

if (typeof window !== "undefined") void ensureStoreReady();

function read<T>(key: string, fallback: T): T {
  return (cache.get(key) as T | undefined) ?? fallback;
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  cache.set(key, value);
  lastSavedAt = new Date().toISOString();
  const savedAt = lastSavedAt;
  writeQueue = writeQueue.then(() => ensureStoreReady()).then(async () => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.objectStore(STORE_NAME).put(savedAt, "__lastSavedAt");
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }).catch((error) => console.error("IndexedDB 保存失败", error));
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

export function getStorageSummary() {
  return { projectCount: listProjects().filter((p) => !p.deletedAt).length, lastSavedAt, ready: initialized };
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
  return normalized.filter((p) => !p.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
}

export function listDeletedProjects(): Project[] {
  return read<Project[]>(KEYS.projects, []).filter((p) => !!p.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
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
      dateIssueReason: m.dateIssueReason,
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
  contractType?: string | null;
  contractSignedDate?: string | null;
  contractAmount?: string | null;
  upstreamUnit?: string | null;
  marketOwner?: string | null;
  currentStatus?: string | null;
  pmRaw?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  remark?: string | null;
  team?: TeamKey | null;
  milestones?: { name: string; plannedDate: string | null; actualDate: string | null; dateIssueReason?: string | null }[];
}

export function createProject(input: ProjectInput): Project {
  const projects = read<Project[]>(KEYS.projects, []);
  const now = new Date().toISOString();
  const p: Project = refreshStatus({
    id: uid("p_"),
    name: input.name,
    code: input.code ?? null,
    category: input.category ?? null,
    contractType: input.contractType ?? null,
    contractSignedDate: input.contractSignedDate ?? null,
    contractAmount: input.contractAmount ?? null,
    upstreamUnit: input.upstreamUnit ?? null,
    marketOwner: input.marketOwner ?? null,
    currentStatus: input.currentStatus ?? null,
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
      dateIssueReason: m.dateIssueReason ?? null,
    })),
    managers: [],
    team: input.team ?? null,
    deletedAt: null,
    updatedAt: now,
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
    contractType: input.contractType ?? prev.contractType,
    contractSignedDate: input.contractSignedDate ?? prev.contractSignedDate,
    contractAmount: input.contractAmount ?? prev.contractAmount,
    upstreamUnit: input.upstreamUnit ?? prev.upstreamUnit,
    marketOwner: input.marketOwner ?? prev.marketOwner,
    currentStatus: input.currentStatus ?? prev.currentStatus,
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
      dateIssueReason: m.dateIssueReason ?? null,
    })),
    updatedAt: new Date().toISOString(),
  });
  projects[idx] = updated;
  persistProjects(projects);
  return updated;
}

export function deleteProject(id: string): void {
  const projects = read<Project[]>(KEYS.projects, []).map((p) => p.id === id ? { ...p, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : p);
  persistProjects(projects);
}

export function restoreProject(id: string): void {
  const projects = read<Project[]>(KEYS.projects, []).map((p) => p.id === id ? { ...p, deletedAt: null, updatedAt: new Date().toISOString() } : p);
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
  category?: string | null; contractType?: string | null; contractSignedDate?: string | null;
  contractAmount?: string | null; upstreamUnit?: string | null; marketOwner?: string | null;
  currentStatus?: string | null; remark?: string | null; team?: TeamKey | null;
  milestones: { name: string; plannedDate: string | null; actualDate: string | null; dateIssueReason?: string | null }[];
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
          category: p.category ?? existing.category,
          contractType: p.contractType ?? existing.contractType,
          contractSignedDate: p.contractSignedDate ?? existing.contractSignedDate,
          contractAmount: p.contractAmount ?? existing.contractAmount,
          upstreamUnit: p.upstreamUnit ?? existing.upstreamUnit,
          marketOwner: p.marketOwner ?? existing.marketOwner,
          currentStatus: p.currentStatus ?? existing.currentStatus,
          remark: p.remark ?? existing.remark,
          team: p.team ?? existing.team,
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
            dateIssueReason: m.dateIssueReason ?? null,
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
            contractType: p.contractType ?? null,
            contractSignedDate: p.contractSignedDate ?? null,
            contractAmount: p.contractAmount ?? null,
            upstreamUnit: p.upstreamUnit ?? null,
            marketOwner: p.marketOwner ?? null,
            currentStatus: p.currentStatus ?? null,
            pmRaw: p.pmRaw,
            startDate: p.startDate,
            endDate: p.endDate,
            remark: p.remark ?? null,
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
              dateIssueReason: m.dateIssueReason ?? null,
            })),
            managers: [],
            team: p.team ?? null,
            deletedAt: null,
            updatedAt: new Date().toISOString(),
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
  { name: "左恺", team: "A" },
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
  { name: "蒋家豪", team: "C" },
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
  const existing = read<Member[]>(KEYS.members, []);
  if (initialized && existing.length === 0) {
    const seeded = seedDefaultMembers();
    write(KEYS.members, seeded);
    return seeded;
  }
  return existing;
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

/* ----------------------------- 备份与本地设置 ----------------------------- */

export type AppSettings = { reminderWindow?: 7 | 14 | 30 | 60; confirmationTemplate?: string; firstVisitSeen?: boolean };
export function getSettings(): AppSettings { return read<AppSettings>(KEYS.settings, {}); }
export function saveSettings(patch: Partial<AppSettings>): void { write(KEYS.settings, { ...getSettings(), ...patch }); }

export type DataBackup = {
  format: "product-project-tool-backup";
  version: 1;
  exportedAt: string;
  data: { projects: Project[]; members: Member[]; imports: ImportLog[]; settings: AppSettings };
};

export function exportBackup(): DataBackup {
  return {
    format: "product-project-tool-backup", version: 1, exportedAt: new Date().toISOString(),
    data: {
      projects: read<Project[]>(KEYS.projects, []), members: read<Member[]>(KEYS.members, []),
      imports: read<ImportLog[]>(KEYS.imports, []), settings: getSettings(),
    },
  };
}

export function importBackup(value: unknown): void {
  const backup = value as Partial<DataBackup>;
  if (backup.format !== "product-project-tool-backup" || backup.version !== 1 || !backup.data || !Array.isArray(backup.data.projects)) {
    throw new Error("备份文件格式不正确");
  }
  write(KEYS.projects, backup.data.projects);
  write(KEYS.members, Array.isArray(backup.data.members) ? backup.data.members : seedDefaultMembers());
  write(KEYS.imports, Array.isArray(backup.data.imports) ? backup.data.imports : []);
  write(KEYS.settings, backup.data.settings ?? {});
}

export function clearLocalData(): void {
  for (const key of ALL_KEYS) write(key, key === KEYS.settings ? {} : []);
}

export function restoreSampleData(): void {
  const today = new Date();
  const date = (offset: number) => fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  const samples: ProjectInput[] = [
    { code: "DEMO-001", name: "示例园区数字化项目", pmRaw: "示例经理甲、示例经理乙", category: "虚构示例", team: "A", currentStatus: "实施中", marketOwner: "示例市场人员", milestones: [
      { name: "到货", plannedDate: date(-10), actualDate: date(-8) }, { name: "进场", plannedDate: date(-3), actualDate: null },
      { name: "完工（施工）", plannedDate: date(12), actualDate: null }, { name: "调试", plannedDate: date(20), actualDate: null },
      { name: "试运行", plannedDate: date(30), actualDate: null }, { name: "验收", plannedDate: date(45), actualDate: null },
    ] },
    { code: "DEMO-002", name: "示例设备升级项目", pmRaw: "示例经理丙", category: "虚构示例", team: "B", currentStatus: "已验收", milestones: [
      { name: "到货", plannedDate: date(-40), actualDate: date(-40) }, { name: "进场", plannedDate: date(-35), actualDate: date(-34) },
      { name: "完工（施工）", plannedDate: date(-20), actualDate: date(-18) }, { name: "调试", plannedDate: date(-15), actualDate: date(-14) },
      { name: "试运行", plannedDate: date(-10), actualDate: date(-10) }, { name: "验收", plannedDate: date(-5), actualDate: date(-4) },
    ] },
  ];
  write(KEYS.projects, []);
  for (const sample of samples) createProject(sample);
  write(KEYS.members, seedDefaultMembers());
  write(KEYS.imports, []);
}
