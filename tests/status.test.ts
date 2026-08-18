import { describe, it, expect } from "vitest";
import {
  evaluateProject,
  evaluateMilestone,
  upcomingMilestones,
  isAcceptanceNode,
} from "../src/lib/status";
import { splitPm, parseDate, mondayOf } from "../src/lib/utils";

/** 以 2026-08-14 为基准日 */
const TODAY = new Date(2026, 7, 14);

function d(offsetDays: number): Date {
  const dt = new Date(2026, 7, 14 + offsetDays);
  return dt;
}

function ms(name: string, planned: Date | null, actual: Date | null, order = 0) {
  return { name, order, plannedDate: planned, actualDate: actual };
}

describe("验收规则 R1: 实际日期为空 ≠ 逾期（待补实际日期）", () => {
  it("节点实际日期为空 → actualMissing=true，不标记为逾期", () => {
    const v = evaluateMilestone(ms("方案", d(10), null), TODAY);
    expect(v.actualMissing).toBe(true);
    expect(v.isPlannedPassed).toBe(false);
    expect(v.hasDateIssue).toBe(false);
  });

  it("节点计划日期已过但实际为空 → 节点展示「待补实际日期」而非「已逾期」", () => {
    const v = evaluateMilestone(ms("开发", d(-5), null), TODAY);
    expect(v.actualMissing).toBe(true);
    expect(v.isPlannedPassed).toBe(true);
    expect(v.lateDays).toBe(5);
    // 标签语义：仍是待补实际日期
    expect(v.hasDateIssue).toBe(false);
  });

  it("项目含未填实际日期的节点 → 项目状态为 PENDING_ACTUAL", () => {
    const info = evaluateProject(
      [ms("方案", d(-5), d(-2), 0), ms("验收", d(20), null, 1)],
      TODAY
    );
    expect(info.status).toBe("PENDING_ACTUAL");
    expect(info.label).toBe("待补实际日期");
  });
});

describe("验收规则 R2: 非验收节点计划已过无实际 → 有延期风险", () => {
  it("中间节点逾期 → 项目 LATE_RISK", () => {
    const info = evaluateProject(
      [ms("方案", d(-10), null, 0), ms("开发", d(5), null, 1), ms("验收", d(30), null, 2)],
      TODAY
    );
    expect(info.status).toBe("LATE_RISK");
    expect(info.label).toBe("有延期风险");
    expect(info.warning).toContain("方案");
  });

  it("延期节点有具体延期天数", () => {
    const info = evaluateProject([ms("测试", d(-3), null, 0)], TODAY);
    expect(info.hasLateRisk).toBe(true);
  });
});

describe("验收规则 R3: 验收终审 - 项目完成只看验收节点实际日期", () => {
  it("其他节点全部完成但验收未填 → 不判定为已验收", () => {
    const info = evaluateProject(
      [ms("方案", d(-10), d(-9), 0), ms("开发", d(-2), d(-1), 1), ms("验收", d(7), null, 2)],
      TODAY
    );
    expect(info.accepted).toBe(false);
    expect(info.status).not.toBe("ACCEPTED");
  });

  it("验收节点有实际日期 → 项目 ACCEPTED", () => {
    const info = evaluateProject(
      [ms("方案", d(-10), d(-9), 0), ms("验收", d(-2), d(-1), 1)],
      TODAY
    );
    expect(info.accepted).toBe(true);
    expect(info.status).toBe("ACCEPTED");
  });

  it("验收别名（终验/结题）同样生效", () => {
    expect(isAcceptanceNode("终验")).toBe(true);
    expect(isAcceptanceNode("结题")).toBe(true);
    const info = evaluateProject([ms("终验", d(-3), d(-2), 0)], TODAY);
    expect(info.status).toBe("ACCEPTED");
  });
});

describe("验收规则 R4: 已验收项目从跟进/提醒中排除", () => {
  it("已验收项目的 upcomingMilestones 为空", () => {
    const info = evaluateProject(
      [ms("开发", d(5), null, 0), ms("验收", d(-3), d(-2), 1)],
      TODAY
    );
    expect(info.accepted).toBe(true);
    const windows = upcomingMilestones(info, TODAY);
    expect(windows[7]).toHaveLength(0);
    expect(windows[14]).toHaveLength(0);
    expect(windows[30]).toHaveLength(0);
    expect(windows[60]).toHaveLength(0);
  });
});

describe("验收规则 R5: 7/14/30/60 天临近窗口", () => {
  it("3 天后到期的节点进入 7 天窗口", () => {
    const info = evaluateProject([ms("验收", d(3), null, 0)], TODAY);
    const w = upcomingMilestones(info, TODAY);
    expect(w[7]).toHaveLength(1);
    expect(w[14]).toHaveLength(1);
  });

  it("10 天后到期进入 14 天窗口但不在 7 天窗口", () => {
    const info = evaluateProject([ms("验收", d(10), null, 0)], TODAY);
    const w = upcomingMilestones(info, TODAY);
    expect(w[7]).toHaveLength(0);
    expect(w[14]).toHaveLength(1);
  });

  it("25 天后到期进入 30 天窗口", () => {
    const info = evaluateProject([ms("验收", d(25), null, 0)], TODAY);
    const w = upcomingMilestones(info, TODAY);
    expect(w[14]).toHaveLength(0);
    expect(w[30]).toHaveLength(1);
  });

  it("45 天后到期进入 60 天窗口", () => {
    const info = evaluateProject([ms("验收", d(45), null, 0)], TODAY);
    const w = upcomingMilestones(info, TODAY);
    expect(w[30]).toHaveLength(0);
    expect(w[60]).toHaveLength(1);
  });

  it("100 天后到期不在任何窗口", () => {
    const info = evaluateProject([ms("验收", d(100), null, 0)], TODAY);
    const w = upcomingMilestones(info, TODAY);
    expect(w[60]).toHaveLength(0);
  });

  it("已完成的节点不进入提醒窗口", () => {
    const info = evaluateProject([ms("验收", d(-5), d(-2), 0)], TODAY);
    const w = upcomingMilestones(info, TODAY);
    expect(w[7]).toHaveLength(0);
  });

  it("已逾期未完成的节点不进提醒窗口（由延期风险处理）", () => {
    const info = evaluateProject([ms("开发", d(-1), null, 0)], TODAY);
    const w = upcomingMilestones(info, TODAY);
    expect(w[7]).toHaveLength(0);
  });
});

describe("验收规则 R6: 日期待核对", () => {
  it("实际日期早于计划日期 → 节点 DATE_ISSUE", () => {
    const v = evaluateMilestone(ms("方案", d(0), d(-3), 0), TODAY);
    expect(v.hasDateIssue).toBe(true);
    expect(v.dateIssueReason).toContain("早于");
  });

  it("有实际日期但无计划日期 → 日期待核对", () => {
    const v = evaluateMilestone(ms("方案", null, d(0), 0), TODAY);
    expect(v.hasDateIssue).toBe(true);
  });

  it("实际日期晚于今天 → 日期待核对", () => {
    const v = evaluateMilestone(ms("方案", d(-10), d(5), 0), TODAY);
    expect(v.hasDateIssue).toBe(true);
    expect(v.dateIssueReason).toContain("晚于今天");
  });

  it("项目存在日期错误 → 项目状态 DATE_ISSUE，且优先于已验收", () => {
    const info = evaluateProject(
      [ms("验收", d(-1), d(-2), 0), ms("开发", d(0), d(-5), 1)],
      TODAY
    );
    expect(info.status).toBe("DATE_ISSUE");
    expect(info.label).toBe("日期待核对");
  });
});

describe("验收规则 R7: 多 PM 拆分", () => {
  it("支持 / 、 ， , ; 换行 等分隔符", () => {
    const raw = "张三/李四、王五，赵六,钱七;孙八\n周九\r吴十";
    const names = splitPm(raw);
    expect(names).toEqual(["张三", "李四", "王五", "赵六", "钱七", "孙八", "周九", "吴十"]);
  });

  it("空值返回空数组", () => {
    expect(splitPm("")).toEqual([]);
    expect(splitPm("   ")).toEqual([]);
  });
});

describe("其他状态判定", () => {
  it("项目无任何节点 → NOT_STARTED", () => {
    const info = evaluateProject([], TODAY);
    expect(info.status).toBe("NOT_STARTED");
  });

  it("节点计划日期全部在未来且无实际日期 → PENDING_ACTUAL（待补）", () => {
    const info = evaluateProject([ms("方案", d(10), null, 0)], TODAY);
    expect(info.status).toBe("PENDING_ACTUAL");
  });

  it("计划日期已过且实际日期已完成 → 正常推进/无延期", () => {
    const info = evaluateProject([ms("开发", d(-4), d(-3), 0)], TODAY);
    expect(info.hasLateRisk).toBe(false);
    expect(info.status).not.toBe("LATE_RISK");
  });

  it("验收节点计划已过但未填实际 → 归为待补实际日期（验收终审语义）", () => {
    const info = evaluateProject([ms("验收", d(-2), null, 0)], TODAY);
    expect(info.status).toBe("PENDING_ACTUAL");
    expect(info.accepted).toBe(false);
  });
});

describe("工具函数", () => {
  it("parseDate 支持多种格式", () => {
    expect(parseDate("2026-08-14")).toEqual(new Date(2026, 7, 14));
    expect(parseDate("2026/08/14")).toEqual(new Date(2026, 7, 14));
    expect(parseDate("2026年8月14日")).toEqual(new Date(2026, 7, 14));
    expect(parseDate("")).toBeNull();
    expect(parseDate("abc")).toBeNull();
  });

  it("mondayOf 返回周一日期", () => {
    expect(mondayOf(new Date(2026, 7, 14))).toBe("2026-08-10"); // 周五 → 周一 10 号
    expect(mondayOf(new Date(2026, 7, 16))).toBe("2026-08-10"); // 周日 → 周一
    expect(mondayOf(new Date(2026, 7, 10))).toBe("2026-08-10"); // 周一 → 周一
  });
});
