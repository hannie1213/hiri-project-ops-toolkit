"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Timer } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { listProjects, evaluate, subscribe } from "@/lib/store";
import { upcomingMilestones } from "@/lib/status";
import { fmtDate } from "@/lib/utils";

type ReminderItem = {
  projectId: string;
  projectName: string;
  pmList: string[];
  milestoneName: string;
  plannedDate: string;
  days: number;
  bucket: string;
};

const BUCKETS = ["计划待填", "7天内", "14天内", "30天内", "60天内"];
const WINDOWS = [7, 14, 30, 60];
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
    const ups = upcomingMilestones(ev.statusInfo);
    for (const u of ups.noPlan) {
      items.push({
        projectId: p.id,
        projectName: p.name,
        pmList: p.managers,
        milestoneName: u.name,
        plannedDate: "未排期",
        days: 0,
        bucket: "计划待填",
      });
    }
    for (const w of WINDOWS) {
      for (const u of ups[w]) {
        const days = u.remainingDays ?? 0;
        if (days >= 0) {
          items.push({
            projectId: p.id,
            projectName: p.name,
            pmList: p.managers,
            milestoneName: u.name,
            plannedDate: fmtDate(u.plannedDate),
            days,
            bucket: `${w}天内`,
          });
        }
      }
    }
  }
  return items;
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

  return (
    <div className="space-y-5">
      <div className="page-heading">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Bell className="h-5 w-5 text-[#147154]" /> 到期提醒
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          今日 {today} · 已验收项目不参与提醒 · 节点实际日期未填写且计划日期临近时进入提醒
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {grouped.map((g) => (
          <Card key={g.bucket}>
            <CardHeader
              title={`${g.bucket}到期`}
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
                    {i.days}天
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
