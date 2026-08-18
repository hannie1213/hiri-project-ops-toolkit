import { cn } from "@/lib/utils";

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACCEPTANCE_LATE: "border-red-300 bg-red-50 text-red-700",
    ACCEPTANCE_ON_TIME: "border-green-300 bg-green-50 text-green-700",
    DATE_ISSUE: "border-purple-300 bg-purple-50 text-purple-700",
    LATE_RISK: "border-orange-300 bg-orange-50 text-orange-700",
    PENDING_ACTUAL: "border-blue-300 bg-blue-50 text-blue-700",
    ON_TRACK: "border-slate-300 bg-slate-50 text-slate-700",
    NOT_STARTED: "border-gray-300 bg-gray-50 text-gray-600",
  };
  const labels: Record<string, string> = {
    ACCEPTANCE_LATE: "验收延期完成",
    ACCEPTANCE_ON_TIME: "按时验收",
    DATE_ISSUE: "日期待核对",
    LATE_RISK: "有延期风险",
    PENDING_ACTUAL: "待补实际日期",
    ON_TRACK: "正常",
    NOT_STARTED: "正常",
  };
  return <Badge className={styles[status]}>{labels[status] ?? status}</Badge>;
}
