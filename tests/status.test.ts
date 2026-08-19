import { describe, expect, it } from "vitest";
import { confirmationMilestones, evaluateMilestone, evaluateProject, projectPhaseLabel, upcomingMilestones } from "../src/lib/status";
import { splitPm } from "../src/lib/utils";

const TODAY = new Date(2026, 7, 14);
const d = (offset: number) => new Date(2026, 7, 14 + offset);
const ms = (name: string, planned: Date | null, actual: Date | null, order = 0, dateIssueReason?: string) => ({ name, plannedDate: planned, actualDate: actual, order, dateIssueReason });

describe("项目状态验收规则", () => {
  it("计划已过但实际为空只显示待补，不判断延期风险", () => {
    const info = evaluateProject([ms("到货", d(-5), null), ms("验收", d(20), null, 1)], TODAY);
    expect(info.status).toBe("PENDING_ACTUAL"); expect(info.hasLateRisk).toBe(false);
    expect(info.warning).toContain("不代表延期");
  });
  it("未来计划节点保持正常，不提前标记为待补实际日期", () => {
    const info = evaluateProject([ms("验收", d(20), null)], TODAY);
    expect(info.status).toBe("ON_TRACK");
    expect(info.hasPendingActual).toBe(false);
  });
  it("项目阶段与节点顺序保持一致", () => {
    const construction = evaluateProject([ms("到货", d(-2), d(-2)), ms("完工（施工）", d(10), null, 1)], TODAY);
    const acceptance = evaluateProject([ms("调试", d(-2), d(-2)), ms("验收", d(10), null, 1)], TODAY);
    expect(projectPhaseLabel(construction)).toBe("施工中");
    expect(projectPhaseLabel(acceptance)).toBe("待验收");
  });
  it("前置节点实际晚于计划显示风险，验收未完成时不显示延期完成", () => {
    const info = evaluateProject([ms("进场", d(-5), d(-2)), ms("验收", d(20), null, 1)], TODAY);
    expect(info.status).toBe("LATE_RISK"); expect(info.acceptanceResult).toBe("尚未验收");
  });
  it("前置节点按时完成不显示风险", () => {
    expect(evaluateProject([ms("进场", d(-5), d(-5))], TODAY).hasLateRisk).toBe(false);
  });
  it("验收实际晚于计划显示验收延期完成", () => {
    const info = evaluateProject([ms("验收", d(-3), d(-1))], TODAY);
    expect(info.status).toBe("ACCEPTANCE_LATE"); expect(info.accepted).toBe(true);
  });
  it("验收实际不晚于计划显示按时验收", () => {
    expect(evaluateProject([ms("验收", d(-3), d(-3))], TODAY).status).toBe("ACCEPTANCE_ON_TIME");
  });
  it("已验收项目不进入任何临期窗口或状态确认", () => {
    const info = evaluateProject([ms("到货", d(3), null), ms("验收", d(-1), d(-1), 1)], TODAY);
    expect(upcomingMilestones(info, TODAY)[7]).toHaveLength(0); expect(confirmationMilestones(info)).toHaveLength(0);
  });
  it("无法识别的日期由导入层传入原因并标记日期待核对", () => {
    const info = evaluateProject([ms("调试", null, null, 0, "计划日期无法识别")], TODAY);
    expect(info.status).toBe("DATE_ISSUE"); expect(info.warning).toContain("无法识别");
  });
  it("普通的实际早于计划不被误判为日期格式错误", () => {
    expect(evaluateMilestone(ms("到货", d(2), d(0)), TODAY).hasDateIssue).toBe(false);
  });
  it.each([7, 14, 30, 60] as const)("节点进入 %s 天临期窗口", (window) => {
    const info = evaluateProject([ms("验收", d(window), null)], TODAY);
    expect(upcomingMilestones(info, TODAY)[window]).toHaveLength(1);
  });
  it("今天到期属于临期，昨天到期进入项目状态确认", () => {
    const today = evaluateProject([ms("验收", d(0), null)], TODAY);
    const yesterday = evaluateProject([ms("验收", d(-1), null)], TODAY);
    expect(upcomingMilestones(today, TODAY)[7]).toHaveLength(1);
    expect(confirmationMilestones(today)).toHaveLength(0); expect(confirmationMilestones(yesterday)).toHaveLength(1);
  });
  it("多人项目经理支持全部指定分隔符", () => {
    expect(splitPm("甲/乙／丙、丁，戊,己;庚；辛\n壬")).toEqual(["甲","乙","丙","丁","戊","己","庚","辛","壬"]);
  });
});
