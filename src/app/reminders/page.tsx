"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ExcelJS from "exceljs";
import { Bell, Download, Timer } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { listProjects, evaluate, subscribe } from "@/lib/store";
import { reminderBucket } from "@/lib/status";
import { fmtDate } from "@/lib/utils";

type ReminderItem = {
  projectId: string;
  projectCode: string;
  projectName: string;
  pmList: string[];
  milestoneName: string;
  plannedDate: string;
  days: number | null;
  bucket: string;
};

const BUCKETS = ["计划待填", "7天内", "14天内", "30天内", "60天内"];
const BUCKET_STYLE: Record<string, string> = {
  "计划待填": "border-purple-200 bg-purple-50 text-purple-700",
  "7天内": "border-red-200 bg-red-50 text-red-700",
  "14天内": "border-orange-200 bg-orange-50 text-orange-700",
  "30天内": "border-amber-200 bg-amber-50 text-amber-700",
  "60天内": "border-blue-200 bg-blue-50 text-blue-700",
};

function buildItems(): ReminderItem[] {
  const items: ReminderItem[] = [];
  for (const p of listProjects()) {
    const ev = evaluate(p);
    if (ev.statusInfo.accepted) continue;
    for (const milestone of ev.statusInfo.milestoneStatus) {
      if (!milestone.actualMissing) continue;
      const bucket = reminderBucket(milestone.plannedDate, milestone.remainingDays);
      if (!bucket) continue;
      items.push({
        projectId: p.id,
        projectCode: p.code || "无编号",
        projectName: p.name,
        pmList: p.managers,
        milestoneName: milestone.name,
        plannedDate: milestone.plannedDate ? fmtDate(milestone.plannedDate) : "未排期",
        days: milestone.remainingDays,
        bucket,
      });
    }
  }
  return items.sort((a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket) || (a.days ?? 9999) - (b.days ?? 9999));
}

export default function RemindersPage() {
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(fmtDate(new Date()));
    setItems(buildItems());
    const unsub = subscribe("__all__", () => setItems(buildItems()));
    return unsub;
  }, []);

  const grouped = BUCKETS.map((b) => ({
    bucket: b,
    list: items.filter((i) => i.bucket === b),
  }));

  async function exportItems(format: "xlsx" | "csv") {
    const header = ["提醒区间", "项目编号", "项目名称", "项目经理", "提醒节点", "计划日期", "剩余天数"];
    const rows = items.map((item) => [item.bucket, item.projectCode, item.projectName, item.pmList.join("、"), item.milestoneName, item.plannedDate, item.days ?? "待排期"]);
    const date = fmtDate(new Date());
    if (format === "csv") {
      const csv = "\ufeff" + [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
      download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `到期提醒清单_${date}.csv`);
      return;
    }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("到期提醒清单");
    sheet.addRow(header); rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns = [{ width: 14 }, { width: 20 }, { width: 42 }, { width: 20 }, { width: 18 }, { width: 16 }, { width: 12 }];
    download(new Blob([new Uint8Array(await workbook.xlsx.writeBuffer()) as BlobPart]), `到期提醒清单_${date}.xlsx`);
  }

  return (
    <div className="space-y-5">
      <div className="page-heading flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Bell className="h-5 w-5 text-[#147154]" /> 到期提醒
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          今日 {today} · 已验收项目不参与提醒 · 节点实际日期未填写且计划日期临近时进入提醒
        </p></div>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => exportItems("xlsx")}><Download className="h-4 w-4"/>导出 Excel</Button><Button variant="secondary" onClick={() => exportItems("csv")}><Download className="h-4 w-4"/>导出 CSV</Button></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {grouped.map((g) => (
          <Card key={g.bucket}>
            <CardHeader
              title={g.bucket === "计划待填" ? "计划待填" : `${g.bucket}到期`}
              right={
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {g.list.length} 项
                </span>
              }
            />
            <div className="max-h-80 divide-y overflow-y-auto">
              {g.list.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-slate-400">暂无</div>
              )}
              {g.list.map((i, idx) => (
                <Link
                  key={idx}
                  href={`/projects/detail?id=${i.projectId}`}
                  className="flex items-center justify-between px-5 py-3 transition hover:bg-[#f3f8f5]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{i.projectName}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {i.milestoneName} · 计划 {i.plannedDate} · 负责人：{i.pmList.join("、") || "—"}
                    </div>
                  </div>
                  <span className={`ml-3 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${BUCKET_STYLE[g.bucket]}`}>
                    <Timer className="mr-0.5 inline h-3 w-3" />
                    {i.days == null ? "待排期" : `${i.days}天`}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
