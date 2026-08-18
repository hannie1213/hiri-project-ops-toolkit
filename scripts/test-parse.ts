// 测试 parseProgressSheet 解析用户提供的 Excel 文件
import { readFileSync } from "fs";
import { parseProgressSheet } from "../src/lib/excel";

async function main() {
  const buf = readFileSync("scripts/sample.xlsx");
  const result = await parseProgressSheet(new Uint8Array(buf));

  console.log("sheetName:", result.sheetName);
  console.log("项目数:", result.projects.length);
  console.log("跳过表头行数:", result.skippedHeaderRows);
  console.log("警告/错误:", result.errors.slice(0, 10));

  const p = result.projects[0];
  console.log("\n=== 第一个项目 ===");
  console.log("名称:", p.name);
  console.log("编号:", p.code);
  console.log("负责人:", p.pmRaw);
  console.log("节点数:", p.milestones.length);
  p.milestones.slice(0, 8).forEach((m) => {
    const plan = m.plannedDate ? m.plannedDate.toISOString().slice(0, 10) : "-";
    const act = m.actualDate ? m.actualDate.toISOString().slice(0, 10) : "-";
    console.log(`  ${m.name}: 计划=${plan} 实际=${act}`);
  });
}

main();
