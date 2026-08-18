// 诊断 Excel 文件结构：sheet 列表、前几行内容、合并单元格
import ExcelJS from "exceljs";
import path from "path";

const filePath = process.argv[2];
if (!filePath) {
  console.error("用法: node scripts/inspect-excel.mjs <文件路径>");
  process.exit(1);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

console.log("=== 工作簿信息 ===");
console.log("Sheet 数量:", workbook.worksheets.length);
for (const ws of workbook.worksheets) {
  console.log(`- "${ws.name}" rows=${ws.rowCount} cols=${ws.columnCount}`);
}

// 检查目标 sheet
const target = workbook.getWorksheet("所有项目进度计划情况") ?? workbook.worksheets[0];
console.log("\n=== 分析工作表:", target.name, "===");

// 打印前 15 行的非空单元格
console.log("\n--- 前 12 行内容（row: col=value）---");
target.eachRow((row, rowNumber) => {
  if (rowNumber > 12) return;
  const cells = [];
  row.eachCell((cell, colNumber) => {
    let v = cell.value;
    if (v && typeof v === "object") {
      const obj = v;
      if ("result" in obj) v = obj.result;
      else if ("text" in obj) v = obj.text;
    }
    if (v !== null && v !== undefined && v !== "") {
      cells.push(`${colNumber}=${typeof v === "string" ? v.trim() : String(v)}`);
    }
  });
  if (cells.length) console.log(`R${rowNumber}: ${cells.join(" | ")}`);
});

// 打印合并单元格（前 50 个）
console.log("\n--- 合并单元格 ---");
let mc = 0;
target.eachRow((row, rowNumber) => {
  if (rowNumber > 8) return;
  row.eachCell((cell, colNumber) => {
    const addr = cell.address;
    if (cell.isMerged) {
      const master = cell.master.address;
      const val = cellToText(cell);
      if (val) console.log(`${addr} -> master ${master}, value="${val}"`);
    }
  });
});

// 检查行高是否显示表头（跳过）
function cellToText(cell) {
  if (!cell || cell.value == null) return "";
  const v = cell.value;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const obj = v;
    if ("result" in obj && obj.result != null) return String(obj.result).trim();
    if ("text" in obj && obj.text != null) return String(obj.text).trim();
  }
  return "";
}
