import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWeeklyGroupWorkbooks, parseProgressSheet, recognizeWeeklyMember, TARGET_SHEET, weeklyGroupForMember, WEEKLY_GROUPS } from "../src/lib/excel";

async function bytes(workbook: ExcelJS.Workbook) { return new Uint8Array(await workbook.xlsx.writeBuffer()); }

describe("Excel 浏览器解析与周报合成", () => {
  it("周报文件名必须与人员姓名完全一致并按固定名单分组", () => {
    const deliveryMember = WEEKLY_GROUPS.项目交付[0];
    const qualityMember = WEEKLY_GROUPS.质量控制组[0];
    const aftersalesMember = WEEKLY_GROUPS.售后服务组[0];
    expect(recognizeWeeklyMember(`${deliveryMember}.xlsx`)).toBe(deliveryMember);
    expect(recognizeWeeklyMember(`${deliveryMember}个人周报.xlsx`)).toBeNull();
    expect(weeklyGroupForMember(deliveryMember)).toBe("项目交付");
    expect(weeklyGroupForMember(qualityMember)).toBe("质量控制组");
    expect(weeklyGroupForMember(aftersalesMember)).toBe("售后服务组");
  });
  it("找不到指定工作表时明确停止", async () => {
    const wb = new ExcelJS.Workbook(); wb.addWorksheet("其他工作表").addRow(["项目名称", "验收计划"]);
    const result = await parseProgressSheet(await bytes(wb), "test.xlsx");
    expect(result.projects).toHaveLength(0); expect(result.errors.join("")).toContain(TARGET_SHEET);
  });
  it("读取基本字段、固定节点并标记无法识别日期", async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(TARGET_SHEET);
    ws.addRow(["项目编号","项目名称","项目类别","合同类型","合同金额","上家单位","项目经理","项目组","当前项目状态","备注","到货计划","到货实际","验收计划","验收实际"]);
    ws.addRow(["X-001","虚构测试项目","示例","服务","100万元","示例单位","经理甲、经理乙","项目A组","实施中","测试备注","日期不明","","2026-09-01",""]);
    const result = await parseProgressSheet(await bytes(wb), "test.xlsx");
    expect(result.projects).toHaveLength(1); expect(result.projects[0].team).toBe("A");
    expect(result.projects[0].milestones.find((m) => m.name.includes("到货"))?.dateIssueReason).toContain("无法识别");
  });

  it("日期列中的常见空值和阶段文字不会误报无法识别", async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(TARGET_SHEET);
    ws.addRow(["项目名称", "项目经理", "到货计划", "到货实际", "验收计划", "验收实际"]);
    ws.addRow(["空值标记测试", "经理甲", "待定", "未完成", "2026-09-01", "未验收"]);
    const result = await parseProgressSheet(await bytes(wb), "markers.xlsx");
    expect(result.projects[0].milestones.every((m) => !m.dateIssueReason)).toBe(true);
  });
  it("固定生成三个周报文件，成员工作表使用姓名", async () => {
    const personal = new ExcelJS.Workbook(); const sheet = personal.addWorksheet("个人周报"); sheet.getCell("A1").value = "本周工作"; sheet.getColumn(1).width = 24;
    const outputs = await buildWeeklyGroupWorkbooks([{fileName:"严志展个人周报.xlsx",memberName:"严志展",buffer:await bytes(personal)}], "20260818");
    expect(outputs.map((o) => o.fileName)).toEqual(["项目交付周报20260818.xlsx","质量控制组周报20260818.xlsx","售后服务组周报20260818.xlsx"]);
    const merged = new ExcelJS.Workbook(); await merged.xlsx.load(outputs[0].buffer as unknown as Parameters<typeof merged.xlsx.load>[0]);
    expect(merged.worksheets[0].name).toBe("严志展"); expect(merged.worksheets[0].getCell("A1").value).toBe("本周工作");
  });
});
