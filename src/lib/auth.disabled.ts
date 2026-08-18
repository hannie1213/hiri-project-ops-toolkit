import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "pt_session";
const AUTH_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-only-secret-change-me-in-production"
);

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  team?: string | null;
};

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    username: user.username,
    name: user.name,
    role: user.role,
    team: user.team ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(AUTH_SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, AUTH_SECRET);
    return {
      id: payload.sub!,
      username: String(payload.username),
      name: String(payload.name),
      role: payload.role as Role,
      team: payload.team ? String(payload.team) : null,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/** 服务端权限校验：不满足则跳转/抛出 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/forbidden");
  }
  return user;
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "管理员",
  SUPERVISOR: "主管",
  PM: "项目经理",
  VIEWER: "访客",
};

export const ROLE_PRIORITY: Record<Role, number> = {
  VIEWER: 0,
  PM: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
};

export function canManageUsers(role: Role): boolean {
  return role === "ADMIN";
}

export function canEditAll(role: Role): boolean {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canMergeWeekly(role: Role): boolean {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canImport(role: Role): boolean {
  return role === "ADMIN" || role === "SUPERVISOR";
}
