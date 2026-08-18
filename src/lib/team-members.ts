export type TeamKey = "A" | "B" | "C" | "QA" | "AFTERSALES";

export const TEAMS: TeamKey[] = ["A", "B", "C", "QA", "AFTERSALES"];

/** 固定人员分组：项目分组回填与周报文件识别共用同一份名单。 */
export const TEAM_MEMBERS: Record<TeamKey, readonly string[]> = {
  A: ["严志展", "詹小坊", "代友林", "左恺", "陈俊明", "林锦", "吴杰", "陈默涵", "焦佳豪", "温彩德"],
  B: ["杨郑明", "林颖喆", "谷浩天", "张耿标", "吴毅强", "蔡圣炜", "赵龙", "黄传武", "郑凯轩", "李志浩"],
  C: ["魏向中", "周飞明", "蒋家豪", "陈权", "王一帆", "林子涵", "郭柳江", "岳佳成", "阮腾伟"],
  QA: ["杜思明"],
  AFTERSALES: ["谢木江", "刘仲武"],
};

/**
 * 旧项目没有保存项目组时，按负责人固定名单回填。
 * 合作项目的负责人若跨组则保持未分组，避免错误归类。
 */
export function inferProjectTeam(managers: readonly string[]): TeamKey | null {
  const teams = new Set<TeamKey>();
  for (const manager of managers) {
    for (const team of TEAMS) {
      if (TEAM_MEMBERS[team].includes(manager)) teams.add(team);
    }
  }
  return teams.size === 1 ? [...teams][0] : null;
}
