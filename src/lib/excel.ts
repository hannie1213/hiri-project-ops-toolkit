import ExcelJS from "exceljs";
import { parseDate } from "./utils";

export const TARGET_SHEET = "所有项目进度计划情况";

export type ImportedMilestone = {
  name: string;
  order: number;
  plannedDate: Date | null;
  actualDate: Date | null;
};

export type ImportedProject = {
  name: string;
  code?: string | null;
  pmRaw: string;
  startDate?: Date | null;
  endDate?: Date | null;
  remark?: string | null;
  milestones: ImportedMilestone[];
  row: number;
};

export type ImportResult = {
  projects: ImportedProject[];
  errors: string[];
  sheetName: string;
  skippedHeaderRows: number;
};

// 表头名称 → 字段映射（模糊匹配）
const NAME_KEYS = ["项目名称", "名称", "项目"];
const CODE_KEYS = ["项目编号", "编号", "编码"];
const PM_KEYS = ["负责人", "项目经理", "项目负责人", "pm", "项目pm", "项目经手人"];
const START_KEYS = ["计划开始", "开始日期", "开始时间", "计划启动"];
const END_KEYS = ["计划完成", "计划结束", "完成日期", "计划结束日期", "计划交付"];

function cellToText(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value == null) return "";
  const v = cell.value;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return "";
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "object") {
    const obj = v as unknown as Record<string, unknown>;
    if ("result" in obj && obj.result != null) return String(obj.result).trim();
    if ("text" in obj && obj.text != null) return String(obj.text).trim();
  }
  return "";
}

function cellToDate(cell: ExcelJS.Cell | undefined): Date | null {
  if (!cell || cell.value == null) return null;
  const v = cell.value;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel 日期序列号
    return parseDate(String(Math.round(v)));
  }
  if (typeof v === "object") {
    const obj = v as unknown as Record<string, unknown>;
    if ("result" in obj && obj.result instanceof Date) return obj.result;
    if ("result" in obj && typeof obj.result === "number") return parseDate(String(Math.round(obj.result)));
  }
  return parseDate(cellToText(cell));
}

function headerKey(s: string): string {
  return s.replace(/[\s（(】]/g, "").toLowerCase();
}

type RawRow = { rowNumber: number; cells: ExcelJS.Cell[] };

/** 列头是否匹配某组关键词（支持 完全/前缀/后缀 匹配，兼容"项目合同名称"等变体） */
function matchHeaderKey(key: string, keys: string[]): boolean {
  if (!key) return false;
  return keys.some((k) => {
    const kk = headerKey(k);
    return key === kk || key.startsWith(kk) || key.endsWith(kk);
  });
}

/**
 * 名称列精确判定：必须是"项目/项目名称/项目合同名称/XX名称"等以"名称"结尾的列，
 * 避免把"项目编号"等含"项目"但非名称的列误判为项目名称列
 */
function isNameKey(key: string): boolean {
  if (!key) return false;
  return key === "项目" || key.endsWith("名称");
}

/** 是否为独立的"计划时间/实际时间"子表头（复合表头的子行标记） */
function isSubHeaderCol(text: string): boolean {
  const k = headerKey(text);
  if (!k) return false;
  return /^(计划|实际)(时间|日期)?$/.test(k);
}

/**
 * 解析"所有项目进度计划情况"工作表
 * 自动识别表头形态，支持多种灵活形式：
 *  A. 单行表头：每行一个项目，列形如 "方案计划" / "方案实际"、"XX-计划日期" / "XX-实际日期"
 *  B. 复合表头（两行）：父行为阶段名（到货/进场/完工/调试/试运行/验收…），
 *     子行为 "计划时间" / "实际时间"，阶段名通过合并单元格/向左填充识别
 *  C. 单行简单表头：项目名称 + 计划开始/计划完成（自动生成 开始/验收 节点）
 *  名称列支持"项目名称/项目合同名称/名称/项目"等变体，负责人列支持"负责人/项目经理/项目负责人"等
 */
export async function parseProgressSheet(buffer: Uint8Array): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet =
    workbook.getWorksheet(TARGET_SHEET) ??
    workbook.worksheets.find((w) => w.name.includes("进度计划")) ??
    workbook.worksheets[0];

  if (!sheet) {
    return { projects: [], errors: ["无法找到工作表，请确认文件中包含「所有项目进度计划情况」"], sheetName: "", skippedHeaderRows: 0 };
  }

  const rawRows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    const cells: ExcelJS.Cell[] = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c));
    rawRows.push({ rowNumber, cells });
  });

  const rowTexts = rawRows.map((r) => r.cells.map(cellToText));
  const maxScan = Math.min(rawRows.length, 15);

  // 第一步：定位表头。优先识别"复合表头"（名称行 + 独立的计划/实际子表头行）
  let nameRowIdx = -1;
  let subPlanRowIdx = -1;
  for (let i = 0; i < maxScan; i++) {
    const texts = rowTexts[i];
    if (nameRowIdx < 0 && texts.some((t) => isNameKey(headerKey(t)))) nameRowIdx = i;
    if (subPlanRowIdx < 0 && texts.some(isSubHeaderCol)) subPlanRowIdx = i;
    if (nameRowIdx >= 0 && subPlanRowIdx >= 0) break;
  }

  let headerRowIndex = -1;
  if (nameRowIdx >= 0 && subPlanRowIdx >= 0) {
    headerRowIndex = nameRowIdx; // 复合表头：以名称行为主表头行
  } else {
    // 单行表头：同一行既含名称列，又含"计划/实际"类列
    for (let i = 0; i < maxScan; i++) {
      const texts = rowTexts[i];
      const hasName = texts.some((t) => isNameKey(headerKey(t)));
      const hasPlan = texts.some((t) => {
        const k = headerKey(t);
        return k && (k.includes("计划") || k.includes("实际"));
      });
      if (hasName && hasPlan) {
        headerRowIndex = i;
        break;
      }
    }
  }

  if (headerRowIndex < 0) {
    return {
      projects: [],
      errors: [`未找到表头行（需包含"项目名称"及"计划/实际"列），请检查 ${TARGET_SHEET} 表结构`],
      sheetName: sheet.name,
      skippedHeaderRows: 0,
    };
  }

  const header = rowTexts[headerRowIndex];
  const isComposite = subPlanRowIdx >= 0 && subPlanRowIdx !== headerRowIndex;

  // 构建列索引映射（名称/编号/负责人/开始/结束）
  let nameCol = -1,
    codeCol = -1,
    pmCol = -1,
    startCol = -1,
    endCol = -1;
  header.forEach((h, idx) => {
    const key = headerKey(h);
    if (!key) return;
    if (nameCol < 0 && isNameKey(key)) nameCol = idx;
    if (codeCol < 0 && matchHeaderKey(key, CODE_KEYS)) codeCol = idx;
    if (startCol < 0 && START_KEYS.some((k) => key.includes(headerKey(k)))) startCol = idx;
    if (endCol < 0 && END_KEYS.some((k) => key.includes(headerKey(k)))) endCol = idx;
  });
  // 负责人列两遍扫描：优先"项目负责人/项目经理/pm"等强匹配，避免误取"市场负责人"
  for (let pass = 0; pass < 2 && pmCol < 0; pass++) {
    header.forEach((h, idx) => {
      const key = headerKey(h);
      if (!key || pmCol >= 0) return;
      if (pass === 0 && PM_KEYS.some((k) => key === headerKey(k))) pmCol = idx;
      if (pass === 1 && PM_KEYS.some((k) => key.startsWith(headerKey(k)) || key.endsWith(headerKey(k)))) pmCol = idx;
    });
  }

  // 构建里程碑计划/实际列
  const milestoneCols: { name: string; order: number; planCol: number; actualCol: number }[] = [];
  let dataStart: number;

  if (isComposite) {
    // ── 复合表头：父行阶段名 + 子行"计划时间/实际时间" ──
    const parent = rowTexts[headerRowIndex];
    const sub = rowTexts[subPlanRowIdx];
    dataStart = Math.max(headerRowIndex, subPlanRowIdx) + 1;

    // 阶段名：父行该列文本，为空则向左取最近的非空阶段名（处理合并单元格）
    const stageOf: string[] = [];
    let lastStage = "";
    for (let c = 0; c < parent.length; c++) {
      if (parent[c]) lastStage = parent[c];
      stageOf[c] = lastStage;
    }

    const IGNORE_STAGE = ["备注", "序号", "说明", "延期", "变更", "异常", "高亮", "字体", "标识", "红色", "橙色"];
    const planCols = new Map<string, number>();
    const actualCols = new Map<string, number>();
    const rawNameOf: Record<string, string> = {};

    sub.forEach((h, idx) => {
      const key = headerKey(h);
      if (!key) return;
      const isPlan = key.startsWith("计划");
      const isActual = key.startsWith("实际");
      if (!isPlan && !isActual) return;
      if (key.length > 6) return; // 过滤"计划有变更及异常项目均用红色字体标识"等说明文字
      const stage = stageOf[idx] || "";
      const sk = headerKey(stage);
      if (!sk) return;
      if (IGNORE_STAGE.some((ig) => sk.includes(headerKey(ig)))) return;
      const base = sk.replace(/[-_（）()\s]/g, "");
      if (!base) return;
      if (!rawNameOf[base]) rawNameOf[base] = stage;
      if (isPlan) planCols.set(base, idx);
      else actualCols.set(base, idx);
    });

    [...new Set([...planCols.keys(), ...actualCols.keys()])].forEach((base, i) => {
      milestoneCols.push({
        name: rawNameOf[base] || base,
        order: i,
        planCol: planCols.get(base) ?? -1,
        actualCol: actualCols.get(base) ?? -1,
      });
    });
  } else {
    // ── 单行表头：列形如 "方案计划" / "方案实际"、"XX-计划日期" / "XX-实际日期" ──
    dataStart = headerRowIndex + 1;
    // 跳过可能存在的重复表头行（如导出模板的第二行表头）
    if (dataStart < rawRows.length && rowTexts[dataStart].some((t) => matchHeaderKey(headerKey(t), NAME_KEYS))) {
      dataStart++;
    }

    const planCols = new Map<string, number>();
    const actualCols = new Map<string, number>();
    header.forEach((h, idx) => {
      const key = headerKey(h);
      if (!key) return;
      let m = key.match(/^(.+?)(计划|计划时间|计划日期|计划完成)$/);
      if (m) {
        const base = m[1].replace(/[-_（）()]/g, "");
        planCols.set(base, idx);
      }
      m = key.match(/^(.+?)(实际|实际时间|实际日期|实际完成)$/);
      if (m) {
        const base = m[1].replace(/[-_（）()]/g, "");
        actualCols.set(base, idx);
      }
    });

    [...new Set([...planCols.keys(), ...actualCols.keys()])].forEach((base, i) => {
      milestoneCols.push({
        name: base,
        order: i,
        planCol: planCols.get(base) ?? -1,
        actualCol: actualCols.get(base) ?? -1,
      });
    });
  }

  // 数据行解析
  const projects: ImportedProject[] = [];
  const errors: string[] = [];

  for (let i = dataStart; i < rawRows.length; i++) {
    const { rowNumber, cells } = rawRows[i];
    const name = nameCol >= 0 ? cellToText(cells[nameCol]) : "";
    if (!name) continue;

    const project: ImportedProject = {
      name,
      code: codeCol >= 0 ? cellToText(cells[codeCol]) || null : null,
      pmRaw: pmCol >= 0 ? cellToText(cells[pmCol]) : "",
      startDate: startCol >= 0 ? cellToDate(cells[startCol]) : null,
      endDate: endCol >= 0 ? cellToDate(cells[endCol]) : null,
      milestones: [],
      row: rowNumber,
    };

    // 若直接配对了里程碑列则使用
    for (const mc of milestoneCols) {
      const planned = mc.planCol >= 0 ? cellToDate(cells[mc.planCol]) : null;
      const actual = mc.actualCol >= 0 ? cellToDate(cells[mc.actualCol]) : null;
      if (planned || actual) {
        project.milestones.push({
          name: mc.name,
          order: mc.order,
          plannedDate: planned,
          actualDate: actual,
        });
      }
    }

    // 无里程碑列时，尝试从"计划开始/完成"生成 开始/验收 两个节点
    if (project.milestones.length === 0) {
      if (project.startDate) {
        project.milestones.push({ name: "开始", order: 0, plannedDate: project.startDate, actualDate: null });
      }
      if (project.endDate) {
        project.milestones.push({ name: "验收", order: 1, plannedDate: project.endDate, actualDate: null });
      }
    }

    if (project.milestones.length === 0 && !project.startDate && !project.endDate) {
      errors.push(`第 ${rowNumber} 行「${name}」无任何日期数据，已跳过`);
      continue;
    }

    projects.push(project);
  }

  return { projects, errors, sheetName: sheet.name, skippedHeaderRows: dataStart };
}

/**
 * 生成导出 Excel：每行一个项目，形如"所有项目进度计划情况"
 */
export async function buildProgressWorkbook(
  rows: Array<{
    name: string;
    code?: string | null;
    pmRaw: string;
    startDate?: Date | null;
    endDate?: Date | null;
    milestones: ImportedMilestone[];
  }>
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(TARGET_SHEET, { views: [{ state: "frozen", ySplit: 2 }] });

  const header = ["序号", "项目名称", "项目编号", "负责人/PM"];
  const names = new Set<string>();
  rows.forEach((r) => r.milestones.forEach((m) => names.add(m.name)));
  const msNames = [...names];
  msNames.forEach((n) => header.push(`${n}计划`, `${n}实际`));
  header.push("计划开始", "计划完成", "备注");

  sheet.addRow(["", "项目名称", "项目编号", "负责人/PM", ...msNames.flatMap((n) => [`${n}计划`, `${n}实际`]), "计划开始", "计划完成", "备注"]);
  const hRow = sheet.addRow(["序号", ...header.slice(1)]);

  rows.forEach((r, idx) => {
    const values: (string | Date | null)[] = [String(idx + 1), r.name, r.code ?? "", r.pmRaw];
    const byName = new Map<string, ImportedMilestone>();
    r.milestones.forEach((m) => byName.set(m.name, m));
    msNames.forEach((n) => {
      const m = byName.get(n);
      values.push(m?.plannedDate ?? null, m?.actualDate ?? null);
    });
    values.push(r.startDate ?? null, r.endDate ?? null, "");
    sheet.addRow(values);
  });

  hRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.columns.forEach((col) => {
    if (col) col.width = 14;
  });
  sheet.getColumn(2).width = 30;
  sheet.getColumn(4).width = 18;

  const buf = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

/** 周报合并 Excel 导出（浏览器端）。从原 weekly/merge/excel 路由迁移，去掉 Prisma。 */
export async function buildMergeWorkbook(
  weekKey: string,
  reports: Array<{
    memberId: string;
    memberName: string;
    team: "PROJECT" | "AFTERSALES" | "QA";
    content: string;
    planned: string | null;
    issues: string | null;
  }>,
  mode: "member" | "team" = "member"
): Promise<Uint8Array> {
  const TEAM_LABEL: Record<string, string> = { PROJECT: "项目组", AFTERSALES: "售后组", QA: "质安组" };
  const TEAMS = ["PROJECT", "AFTERSALES", "QA"] as const;
  type TeamKey = (typeof TEAMS)[number];

  function weekRangeShort(wk: string): string {
    const start = new Date(wk + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const f = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;
    return `${f(start)}-${f(end)}`;
  }
  function weekRangeCompact(wk: string): string {
    const start = new Date(wk + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const f = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `${f(start)}-${f(end)}`;
  }
  function uniqueSheetName(base: string, used: Set<string>): string {
    const clean = base.replace(/[\\\/\?\*\[\]:]/g, "_").slice(0, 28);
    let name = clean || "Sheet";
    let i = 1;
    while (used.has(name)) {
      const suffix = `_${i++}`;
      name = (clean.slice(0, 31 - suffix.length) || "Sheet") + suffix;
    }
    used.add(name);
    return name;
  }
  function appendMemberSheet(wb: ExcelJS.Workbook, r: (typeof reports)[number], teamLabel: string, range: string, used: Set<string>) {
    const sheet = wb.addWorksheet(uniqueSheetName(`${teamLabel}-${r.memberName}`, used), { views: [{ showGridLines: false }] });
    sheet.getColumn(1).width = 16;
    sheet.getColumn(2).width = 90;
    sheet.mergeCells("A1:B1");
    const t = sheet.getCell("A1");
    t.value = `${teamLabel}周报 · ${r.memberName}（${range}）`;
    t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    t.alignment = { horizontal: "center", vertical: "middle" };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    sheet.getRow(1).height = 30;
    let cur = 3;
    const sections: Array<[string, string | null | undefined]> = [
      ["本周工作", r.content],
      ["下周计划", r.planned],
      ["问题风险", r.issues],
    ];
    for (const [label, value] of sections) {
      const labelCell = sheet.getCell(`A${cur}`);
      labelCell.value = label;
      labelCell.font = { bold: true };
      labelCell.alignment = { vertical: "top" };
      const valueCell = sheet.getCell(`B${cur}`);
      valueCell.value = value && value.trim() ? value.trim() : "（无）";
      valueCell.alignment = { wrapText: true, vertical: "top" };
      if (value) {
        const lineCount = Math.max(1, value.split("\n").length);
        sheet.getRow(cur).height = Math.min(120, 18 * lineCount + 6);
      } else {
        sheet.getRow(cur).height = 22;
      }
      cur += 1;
    }
  }

  if (reports.length === 0) {
    throw new Error("本周暂无录入的周报");
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "项目管理系统";
  wb.created = new Date();
  wb.title = `周报合并(${weekRangeCompact(weekKey)})`;
  const range = weekRangeShort(weekKey);
  const used = new Set<string>();

  const summary = wb.addWorksheet(uniqueSheetName("周报合并", used), { views: [{ showGridLines: false }] });
  summary.getColumn(1).width = 16;
  summary.getColumn(2).width = 24;
  summary.getColumn(3).width = 18;
  summary.getColumn(4).width = 18;
  summary.getColumn(5).width = 18;
  summary.mergeCells("A1:E1");
  const sc = summary.getCell("A1");
  sc.value = `周报合并（${range}）`;
  sc.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sc.alignment = { horizontal: "center", vertical: "middle" };
  sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  summary.getRow(1).height = 32;

  const headRow = summary.getRow(3);
  ["序号", "姓名", "小组", "本周工作（前 80 字）", "提交时间"].forEach((h, i) => {
    const c = headRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true };
    c.alignment = { horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F0FA" } };
  });

  const byTeam = new Map<TeamKey, typeof reports>();
  for (const t of TEAMS) byTeam.set(t, []);
  for (const r of reports) {
    if (TEAMS.includes(r.team as TeamKey)) byTeam.get(r.team as TeamKey)!.push(r);
  }

  let idx = 0;
  for (const team of TEAMS) {
    for (const r of byTeam.get(team) || []) {
      idx += 1;
      const row = summary.getRow(3 + idx);
      row.getCell(1).value = idx;
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).value = r.memberName;
      row.getCell(3).value = TEAM_LABEL[team];
      const preview = (r.content || "").replace(/\s+/g, " ").trim().slice(0, 80);
      row.getCell(4).value = preview;
      row.getCell(4).alignment = { wrapText: true };
      row.getCell(5).value = "";
    }
  }

  if (mode === "member") {
    for (const team of TEAMS) {
      for (const r of byTeam.get(team) || []) {
        appendMemberSheet(wb, r, TEAM_LABEL[team], range, used);
      }
    }
  } else {
    for (const team of TEAMS) {
      const list = byTeam.get(team) || [];
      const sheet = wb.addWorksheet(uniqueSheetName(`${TEAM_LABEL[team]}周报`, used), { views: [{ showGridLines: false }] });
      sheet.getColumn(1).width = 16;
      sheet.getColumn(2).width = 90;
      sheet.mergeCells("A1:B1");
      const t = sheet.getCell("A1");
      t.value = `${TEAM_LABEL[team]}周报（${range}）`;
      t.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
      t.alignment = { horizontal: "center", vertical: "middle" };
      t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
      sheet.getRow(1).height = 32;
      let cur = 3;
      for (const r of list) {
        sheet.mergeCells(`A${cur}:B${cur}`);
        const nameCell = sheet.getCell(`A${cur}`);
        nameCell.value = `【${r.memberName}】`;
        nameCell.font = { bold: true, color: { argb: "FF1F4E78" } };
        nameCell.alignment = { horizontal: "left", vertical: "middle" };
        nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F0FA" } };
        sheet.getRow(cur).height = 22;
        cur += 1;
        for (const [label, value] of [["本周工作", r.content], ["下周计划", r.planned], ["问题风险", r.issues]] as Array<[string, string | null | undefined]>) {
          if (!value || !value.trim()) continue;
          sheet.getCell(`A${cur}`).value = label;
          sheet.getCell(`A${cur}`).font = { bold: true };
          sheet.getCell(`A${cur}`).alignment = { vertical: "top" };
          sheet.getCell(`B${cur}`).value = value.trim();
          sheet.getCell(`B${cur}`).alignment = { wrapText: true, vertical: "top" };
          const lineCount = Math.max(1, value.split("\n").length);
          sheet.getRow(cur).height = Math.min(120, 18 * lineCount + 6);
          cur += 1;
        }
        cur += 1;
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
