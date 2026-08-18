import { prisma } from "./db";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "IMPORT"
  | "MERGE"
  | "EXPORT"
  | "ACK"
  | "FAILED_LOGIN";

/** 写入审计日志（不抛出异常，失败仅记录） */
export async function audit(
  operatorId: string | null,
  action: AuditAction,
  entity: string,
  entityId?: string | null,
  detail?: Record<string, unknown>,
  ip?: string | null
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        operatorId,
        action,
        entity,
        entityId: entityId ?? null,
        detail: detail ? (detail as object) : undefined,
        ip: ip ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] 写入失败:", e);
  }
}

export function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
