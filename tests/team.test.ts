import { describe, expect, it } from "vitest";
import { inferProjectTeam } from "../src/lib/team-members";

describe("项目组自动回填", () => {
  it("按固定项目经理名单识别 A/B/C 组", () => {
    expect(inferProjectTeam(["林锦"])).toBe("A");
    expect(inferProjectTeam(["蔡圣炜", "赵龙"])).toBe("B");
    expect(inferProjectTeam(["郭柳江"])).toBe("C");
  });

  it("同组合作项目仍归入该组", () => {
    expect(inferProjectTeam(["赵龙", "李志浩"])).toBe("B");
  });

  it("跨组或未知负责人不擅自归类", () => {
    expect(inferProjectTeam(["林锦", "赵龙"])).toBeNull();
    expect(inferProjectTeam(["未知人员"])).toBeNull();
  });
});
