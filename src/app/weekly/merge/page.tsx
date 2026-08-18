"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, ClipboardCopy, FileSpreadsheet, Loader2, Merge, RefreshCw } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { listWeekly, subscribe, TEAMS, TEAM_LABEL, SUBTEAM_LABEL, type TeamKey, type WeeklyReport, type SubTeamKey } from "@/lib/store";
import { buildMerge } from "@/lib/weekly-store";
import { buildMergeWorkbook } from "@/lib/excel";
import { mondayOf } from "@/lib/utils";

export default function WeeklyMergePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">加载中…</div>}>
      <WeeklyMergeInner />
    </Suspense>
  );
}

function WeeklyMergeInner() {
  const sp = useSearchParams();
  const [weekKey, setWeekKey] = useState(sp.get("weekKey") || mondayOf());
  const [team, setTeam] = useState<TeamKey | "ALL">("ALL");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<TeamKey | "ALL" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>("");
  const [counts, setCounts] = useState<Record<TeamKey, number>>({ A: 0, B: 0, C: 0, QA: 0, AFTERSALES: 0 });

  const loadMerged = useCallback(() => {
    const reports: WeeklyReport[] = listWeekly(weekKey);
    setCounts({
      A: reports.filter((r) => r.team === "A").length,
      B: reports.filter((r) => r.team === "B").length,
      C: reports.filter((r) => r.team === "C").length,
      QA: reports.filter((r) => r.team === "QA").length,
      AFTERSALES: reports.filter((r) => r.team === "AFTERSALES").length,
    });
    const result = buildMerge(weekKey, reports);
    setSubmitted(result.submitted);
    setContent(team === "ALL" ? result.allText : result.teamTexts[team] ?? "");
  }, [weekKey, team]);

  useEffect(() => {
    loadMerged();
    const unsub = subscribe("__all__", loadMerged);
    return unsub;
  }, [loadMerged]);

  function doMerge() {
    setLoading(true);
    setError("");
    try {
      const reports = listWeekly(weekKey);
      const result = buildMerge(weekKey, reports);
      setSubmitted(result.submitted);
      setContent(team === "ALL" ? result.allText : result.teamTexts[team] ?? "");
      if (result.submitted === 0) setError("本周还没有录入任何周报，请先在「周报」页维护成员周报");
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    const text = team === "ALL" ? content : buildMerge(weekKey, listWeekly(weekKey)).teamTexts[team] || content;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => alert("复制失败，请手动选择文本复制")
    );
  }

  // 三大组分别导出 → 3 个独立 xlsx
  async function downloadTeamExcel(targetTeam: TeamKey) {
    setError("");
    setExporting(targetTeam);
    try {
      const reports = listWeekly(weekKey);
      const buf = await buildMergeWorkbook(weekKey, reports, targetTeam);
      const blob = new Blob([buf as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${TEAM_LABEL[targetTeam]}周报_${weekKey}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`${TEAM_LABEL[targetTeam]}：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">周报汇总合并</h1>
          <p className="mt-0.5 text-sm text-slate-500">按大组（项目组 / 质安组 / 售后组）分别合并导出，每个成员的周报一个 sheet</p>
        </div>
        <Link href="/weekly" className="text-sm text-slate-500 hover:text-slate-700">
          返回周报
        </Link>
      </div>

      <Card>
        <CardHeader
          title="合并设置"
          right={
            <Button variant="primary" onClick={doMerge} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
              生成合并结果
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-4 p-5">
          <label className="text-sm text-slate-600">
            周次：
            <input
              type="date"
              value={weekKey}
              onChange={(e) => e.target.value && setWeekKey(e.target.value)}
              className="ml-2 rounded-lg border px-3 py-1.5 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">视图：</span>
            <button
              onClick={() => setTeam("ALL")}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                team === "ALL" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              全部合并
            </button>
            {TEAMS.map((t) => (
              <button
                key={t}
                onClick={() => setTeam(t)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  team === t ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {TEAM_LABEL[t]}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={loadMerged}>
            <RefreshCw className="h-4 w-4" /> 刷新
          </Button>
          {submitted != null && (
            <span className="text-xs text-slate-500">本次合并基于 {submitted} 份周报</span>
          )}
        </div>
      </Card>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <Card>
        <CardHeader
          title="合并文本（可粘贴到钉钉/企业微信/邮件）"
          desc="点击复制后可直接粘贴，不会自动发送"
          right={
            <Button variant="success" onClick={copyAll}>
              {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied ? "已复制" : "复制全部"}
            </Button>
          }
        />
        <div className="p-5">
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : content ? (
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {content}
            </pre>
          ) : (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-slate-400">
              暂无合并结果，点击「生成合并结果」；或先确认成员已录入周报
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="导出 Excel 合并簿（按大组分别下载）"
          desc="每个大组独立生成一个 xlsx；项目组按 A/B/C 小组排序，每个成员一个 sheet（sheet 名 = 成员姓名）"
        />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {TEAMS.map((t) => {
            const isExporting = exporting === t;
            const empty = counts[t] === 0;
            return (
              <div
                key={t}
                className={`flex items-center justify-between rounded-lg border p-4 ${
                  empty ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-blue-50/40"
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">{TEAM_LABEL[t]}周报</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {empty ? "本周暂无周报" : `已录入 ${counts[t]} 人`}
                  </div>
                </div>
                <Button
                  variant={empty ? "ghost" : "primary"}
                  onClick={() => downloadTeamExcel(t)}
                  disabled={empty || exporting !== null}
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  {empty ? "无数据" : "下载"}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="border-t px-5 py-3 text-xs text-slate-500">
          文件名示例：<code className="rounded bg-slate-100 px-1">项目组周报_2026-08-18.xlsx</code>
        </div>
      </Card>

      <div className="rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
        <p className="font-medium text-slate-600">说明</p>
        <p>· 项目组下分 A / B / C 三个小组；合并时按小组顺序排列</p>
        <p>· 每个成员的周报生成一个 sheet，sheet 名 = 成员姓名（重名自动加后缀）</p>
        <p>· 每个 sheet 顶部标注「组别 · 小组 · 姓名 · 周次」，便于转发与归档</p>
        <p>· 钉钉粘贴：复制后直接 Ctrl+V 到钉钉群/文档，系统不会自动发送任何消息</p>
      </div>
    </div>
  );
}
