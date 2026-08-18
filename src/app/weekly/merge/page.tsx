"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, ClipboardCopy, FileSpreadsheet, Loader2, Merge, RefreshCw, Users } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { listWeekly, subscribe, type WeeklyReport } from "@/lib/store";
import { buildMerge, mergeFileName, downloadText } from "@/lib/weekly-store";
import { buildMergeWorkbook } from "@/lib/excel";
import { mondayOf } from "@/lib/utils";

const TEAMS = [
  { key: "ALL", label: "全部合并" },
  { key: "PROJECT", label: "项目组" },
  { key: "AFTERSALES", label: "售后组" },
  { key: "QA", label: "质安组" },
];

type ExportMode = "member" | "team";

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
  const [team, setTeam] = useState("ALL");
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [exportMode, setExportMode] = useState<ExportMode>("member");

  const loadMerged = useCallback(() => {
    const reports: WeeklyReport[] = listWeekly(weekKey);
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

  async function downloadExcel() {
    setError("");
    try {
      const reports = listWeekly(weekKey);
      const result = buildMerge(weekKey, reports);
      const buf = await buildMergeWorkbook(weekKey, reports, exportMode);
      const blob = new Blob([buf as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `周报合并_${weekKey}_${exportMode === "member" ? "成员分簿" : "小组分簿"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("下载失败");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">周报汇总合并</h1>
          <p className="mt-0.5 text-sm text-slate-500">按项目组/售后组/质安组聚合，保留每位成员提交的原始格式</p>
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
            <input type="date" value={weekKey} onChange={(e) => e.target.value && setWeekKey(e.target.value)} className="ml-2 rounded-lg border px-3 py-1.5 text-sm" />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">视图：</span>
            {TEAMS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTeam(t.key)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  team === t.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t.label}
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
          title="导出 Excel 合并簿"
          desc="每组/每位成员单独一个 sheet，便于转发与归档"
        />
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">分簿方式：</span>
            <button
              onClick={() => setExportMode("member")}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition ${
                exportMode === "member" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Users className="h-4 w-4" /> 每个成员一个 sheet
            </button>
            <button
              onClick={() => setExportMode("team")}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm transition ${
                exportMode === "team" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" /> 每个小组一个 sheet
            </button>
          </div>
          <Button variant="primary" onClick={downloadExcel}>
            <FileSpreadsheet className="h-4 w-4" /> 下载 Excel
          </Button>
        </div>
      </Card>

      <div className="rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
        <p className="font-medium text-slate-600">说明</p>
        <p>· 合并内容按「成员姓名 → 本周工作 → 下周计划 → 问题风险」结构组织，保留原始换行与格式</p>
        <p>· 标题格式：「项目组周报(8.10-8.16)」；导出文件名带日期范围（YYYYMMDD-YYYYMMDD）</p>
        <p>· 钉钉粘贴：复制后直接 Ctrl+V 到钉钉群/文档，系统不会自动发送任何消息</p>
      </div>
    </div>
  );
}
