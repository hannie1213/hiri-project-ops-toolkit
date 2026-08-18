import { Prisma, ProjectStatus, Role, type Project, type Milestone } from "@prisma/client";
import { prisma } from "./db";
import { evaluateProject } from "./status";
import { splitPm, parseDate } from "./utils";
import { audit } from "./audit";
import type { SessionUser } from "./auth";

export const PM_SEPARATORS = ["/", "、", "，", ",", ";", "；", "\n", "\r"];

/** 根据里程碑重新计算项目状态并持久化 */
export async function refreshProjectStatus(projectId: string): Promise<ProjectStatus> {
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  const info = evaluateProject(milestones);
  await prisma.project.update({
    where: { id: projectId },
    data: { status: info.status },
  });
  return info.status;
}

/** 同步 PM 拆分：分隔符拆分，并尝试与用户账号（username/name）关联 */
export async function syncManagers(projectId: string, pmRaw: string): Promise<void> {
  await prisma.manager.deleteMany({ where: { projectId } });
  const names = splitPm(pmRaw);
  if (names.length === 0) return;

  const users = await prisma.user.findMany({
    where: {
      OR: [{ username: { in: names.map((n) => n.toLowerCase()) } }, { name: { in: names } }],
    },
  });

  for (const name of names) {
    const user =
      users.find((u) => u.name === name || u.username === name || u.username === name.toLowerCase()) ?? null;
    await prisma.manager.create({
      data: { projectId, name, userId: user?.id ?? null },
    });
  }
}

export type ProjectUpsertInput = {
  name: string;
  code?: string | null;
  category?: string | null;
  pmRaw: string;
  startDate?: string | null;
  endDate?: string | null;
  remark?: string | null;
  milestones?: Array<{
    id?: string;
    name: string;
    order: number;
    plannedDate?: string | null;
    actualDate?: string | null;
    remark?: string | null;
  }>;
  version?: number;
};

export async function createProjectWithMilestones(
  input: ProjectUpsertInput,
  operator: SessionUser
): Promise<Project> {
  const data: Prisma.ProjectUncheckedCreateInput = {
    name: input.name,
    code: input.code || null,
    category: input.category || null,
    pmRaw: input.pmRaw || "",
    startDate: parseDate(input.startDate),
    endDate: parseDate(input.endDate),
    remark: input.remark || null,
    source: "MANUAL",
    updatedBy: operator.username,
  };

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({ data });
    if (input.milestones && input.milestones.length > 0) {
      await tx.milestone.createMany({
        data: input.milestones.map((m) => ({
          projectId: created.id,
          name: m.name,
          order: m.order,
          plannedDate: parseDate(m.plannedDate),
          actualDate: parseDate(m.actualDate),
          remark: m.remark || null,
          updatedBy: operator.username,
        })),
      });
    }
    return created;
  });

  await syncManagers(project.id, input.pmRaw);
  const status = await refreshProjectStatus(project.id);
  await prisma.project.update({ where: { id: project.id }, data: { status } });
  await audit(operator.id, "CREATE", "PROJECT", project.id, { name: project.name });
  return project;
}

/** 更新项目 + 里程碑（乐观锁：version 不匹配返回 conflict） */
export async function updateProjectWithMilestones(
  id: string,
  input: ProjectUpsertInput,
  operator: SessionUser,
  expectedVersion?: number
): Promise<{ project: Project; conflict: boolean }> {
  const existing = await prisma.project.findUnique({ where: { id }, include: { milestones: true } });
  if (!existing) throw new Error("项目不存在");
  if (expectedVersion != null && existing.version !== expectedVersion) {
    return { project: existing, conflict: true };
  }

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code || null,
        category: input.category || null,
        pmRaw: input.pmRaw || "",
        startDate: parseDate(input.startDate),
        endDate: parseDate(input.endDate),
        remark: input.remark || null,
        updatedBy: operator.username,
        version: { increment: 1 },
      },
    });

    if (input.milestones) {
      await tx.milestone.deleteMany({ where: { projectId: id } });
      if (input.milestones.length > 0) {
        await tx.milestone.createMany({
          data: input.milestones.map((m) => ({
            projectId: id,
            name: m.name,
            order: m.order,
            plannedDate: parseDate(m.plannedDate),
            actualDate: parseDate(m.actualDate),
            remark: m.remark || null,
            updatedBy: operator.username,
          })),
        });
      }
    }
    return updated;
  });

  await syncManagers(id, input.pmRaw);
  const status = await refreshProjectStatus(id);
  await prisma.project.update({ where: { id }, data: { status } });
  await audit(operator.id, "UPDATE", "PROJECT", id, { name: project.name, version: project.version });
  return { project, conflict: false };
}

export async function deleteProject(id: string, operator: SessionUser): Promise<void> {
  const p = await prisma.project.findUnique({ where: { id } });
  if (!p) throw new Error("项目不存在");
  await prisma.project.delete({ where: { id } });
  await audit(operator.id, "DELETE", "PROJECT", id, { name: p.name });
}

/** 角色可见性过滤 */
export async function listProjectsForUser(user: SessionUser, opts?: { status?: string; search?: string; pm?: string }) {
  const where: Prisma.ProjectWhereInput = {};
  if (opts?.status && opts.status !== "ALL") where.status = opts.status as ProjectStatus;
  if (opts?.search) {
    where.OR = [
      { name: { contains: opts.search, mode: "insensitive" } },
      { code: { contains: opts.search, mode: "insensitive" } },
    ];
  }
  // PM 只看自己负责的项目；访客仅看所有（只读）
  if (user.role === Role.PM) {
    where.managers = { some: { userId: user.id } };
  }
  if (opts?.pm) {
    where.managers = { some: { name: { contains: opts.pm, mode: "insensitive" } } };
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      milestones: { orderBy: { order: "asc" } },
      managers: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  return projects;
}

export function serializeProject(p: Project & { milestones: Milestone[]; managers: { name: string; userId: string | null }[] }) {
  const milestoneViews = p.milestones.map((m) => ({
    id: m.id,
    name: m.name,
    order: m.order,
    plannedDate: m.plannedDate,
    actualDate: m.actualDate,
    remark: m.remark,
  }));
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    category: p.category,
    pmRaw: p.pmRaw,
    pmList: p.managers.map((m) => m.name),
    startDate: p.startDate,
    endDate: p.endDate,
    remark: p.remark,
    source: p.source,
    version: p.version,
    updatedAt: p.updatedAt,
    updatedBy: p.updatedBy,
    milestones: milestoneViews,
    evaluate: evaluateProject(milestoneViews),
  };
}
