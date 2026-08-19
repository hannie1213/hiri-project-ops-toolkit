"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { parseProgressSheet, buildProgressWorkbook, type ImportedProject, type ImportResult } from "@/lib/excel";
import { importProjects, exportProjects, type ImportSummary } from "@/lib/store";
import { fmtDate } from "@/lib/utils";

type Preview = { projects: Array<{ name: string; pmRaw: string; milestones: unknown[] }> };

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upsert" | "replace">("upsert");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setSummary(null);
    setError("");
    setLoading(true);
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const res = await parseProgressSheet(buf, f.name);
      if (res.projects.length === 0) {
        setError(res.errors.join("\n") || "未解析到任何项目，请检查表结构");
        setPreview(null);
      } else {
        setPreview({
          projects: res.projects.map((p) => ({ name: p.name, pmRaw: p.pmRaw, milestones: p.milestones })),
        });
        if (res.errors.length) setError(res.errors.join("\n"));
      }
    } catch (err) {
      setError("解析失败：" + (err instanceof Error ? err.message : String(err)));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function doImport() {
    if (!fileRef.current?.files?.[0]) {
      setError("请先选择文件");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const f = fileRef.current.files[0];
      const buf = new Uint8Array(await f.arrayBuffer());
      const res: ImportResult = await parseProgressSheet(buf, f.name);
      if (res.projects.length === 0) {
        setError(res.errors.join("\n") || "未解析到任何项目");
        return;
      }
      const s = importProjects(
        {
          sheetName: res.sheetName,
          projects: res.projects.map((p: ImportedProject) => ({
            row: p.row,
            name: p.name,
            code: p.code ?? null,
            pmRaw: p.pmRaw,
            startDate: p.startDate ? fmtDate(p.startDate) : null,
            endDate: p.endDate ? fmtDate(p.endDate) : null,
            category: p.category ?? null,
            contractType: p.contractType ?? null,
            contractSignedDate: p.contractSignedDate ? fmtDate(p.contractSignedDate) : null,
            contractAmount: p.contractAmount ?? null,
            upstreamUnit: p.upstreamUnit ?? null,
            remark: p.remark ?? null,
            team: p.team ?? null,
            milestones: p.milestones.map((m) => ({
              name: m.name,
              plannedDate: m.plannedDate ? fmtDate(m.plannedDate) : null,
              actualDate: m.actualDate ? fmtDate(m.actualDate) : null,
              dateIssueReason: m.dateIssueReason ?? null,
            })),
          })),
          errors: res.errors,
        },
        { name: f.name },
        mode
      );
      setSummary(s);
      setPreview(null);
    } catch (err) {
      setError("导入失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    const rows = exportProjects().map((p) => ({
      name: p.name,
      code: p.code,
      pmRaw: p.pmRaw ?? "",
      startDate: p.startDate ? new Date(p.startDate) : null,
      endDate: p.endDate ? new Date(p.endDate) : null,
      milestones: p.milestones.map((m) => ({
        name: m.name,
        order: m.order,
        plannedDate: m.plannedDate ? new Date(m.plannedDate) : null,
        actualDate: m.actualDate ? new Date(m.actualDate) : null,
      })),
    }));
    const buf = await buildProgressWorkbook(rows);
    const blob = new Blob([buf as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "项目进度计划模板.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="page-heading">
        <h1 className="text-xl font-bold text-slate-900">Excel 导入</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          读取工作表「所有项目进度计划情况」，自动识别项目名称 / 负责人 / 各节点计划与实际日期
        </p>
      </div>

      <Card>
        <CardHeader
          title="上传文件"
          desc="支持 .xlsx / .xls / .csv；Excel 必须包含名为「所有项目进度计划情况」的工作表，文件仅在浏览器本地解析"
        />
        <div className="space-y-4 p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#bcd5c8] bg-[#f4f9f6] py-10 transition hover:border-[#45a07b] hover:bg-[#ecf6f0]">
            <FileSpreadsheet className="h-10 w-10 text-[#4f9377]" />
            <span className="mt-3 text-sm font-semibold text-[#365f50]">{fileName || "点击选择 Excel 文件"}</span>
            <span className="mt-1 text-xs text-[#7b8e86]">上传后自动解析预览</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pickFile} />
          </label>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" checked={mode === "upsert"} onChange={() => setMode("upsert")} className="accent-[#117455]" />
              按项目名称更新（已存在则更新节点）
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} className="accent-[#117455]" />
              清空现有数据后导入（危险）
            </label>
          </div>

          {error && (
            <div className="whitespace-pre-wrap rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle className="mb-1 h-4 w-4" />
              {error}
            </div>
          )}

          {preview && (
            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                解析到 {preview.projects.length} 个项目
              </div>
              <div className="max-h-56 overflow-y-auto rounded border bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 font-medium">项目名称</th>
                      <th className="px-3 py-2 font-medium">负责人</th>
                      <th className="px-3 py-2 font-medium">节点数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.projects.slice(0, 50).map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">{p.name}</td>
                        <td className="px-3 py-1.5 text-slate-500">{p.pmRaw || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-500">{p.milestones.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {summary && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-green-700">
                <CheckCircle2 className="h-5 w-5" /> 导入完成
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-4">
                <div>总行数：{summary.total}</div>
                <div className="text-blue-600">新增：{summary.created}</div>
                <div className="text-amber-600">更新：{summary.updated}</div>
                <div className="text-red-600">失败：{summary.failed}</div>
              </div>
              {summary.errors.length > 0 && (
                <div className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-red-600">
                  {summary.errors.map((e, i) => (
                    <div key={i}>· {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="primary" onClick={doImport} disabled={loading || !fileName}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {loading ? "导入中…" : "开始导入"}
            </Button>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> 下载当前数据模板
            </Button>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
            <p className="font-medium text-slate-600">导入规则</p>
            <p>· 表头需包含「项目名称」及至少一对「XX计划 / XX实际」列；节点列形如：方案计划、方案实际</p>
            <p>· 负责人列支持多 PM 分隔（/ 、 ， , ; 换行）</p>
            <p>· 实际日期为空 → 显示「待补实际日期」，即使计划日期已过也不直接判断延期</p>
            <p>· 前置节点实际晚于计划 →「有延期风险」；最终延期只以验收实际日期判断</p>
            <p>· 无法识别的日期会标记为「日期待核对」，且不参与延期判断</p>
            <p className="flex items-center gap-1 text-red-500">
              <XCircle className="h-3.5 w-3.5" /> 清空导入模式会删除全部现有项目，请谨慎使用
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
