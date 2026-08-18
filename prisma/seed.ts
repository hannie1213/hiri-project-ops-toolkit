import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * 演示周报人员名单（按真实姓名/分组，对应用户提供的"产品项目部职能岗位情况"表）
 * 每条形如 { username, name, team }，team ∈ PROJECT | AFTERSALES | QA
 */
type SeedStaff = { username: string; name: string; team: "PROJECT" | "AFTERSALES" | "QA" };
const SEED_STAFF: SeedStaff[] = [
  // 项目组（保留原缩写作为 username；姓名替换为真实姓名）
  { username: "zs",   name: "严志展", team: "PROJECT" },
  { username: "lw",   name: "杨郑明", team: "PROJECT" },
  { username: "wq",   name: "魏向中", team: "PROJECT" },
  { username: "ly",   name: "温彩德", team: "PROJECT" },
  { username: "zc",   name: "林颖喆", team: "PROJECT" },
  { username: "yh",   name: "周飞明", team: "PROJECT" },
  { username: "xy",   name: "詹小坊", team: "PROJECT" },
  { username: "hj",   name: "代友林", team: "PROJECT" },
  { username: "xm",   name: "左恺",   team: "PROJECT" },
  { username: "zl",   name: "蒋家骞", team: "PROJECT" },
  { username: "wg",   name: "陈俊明", team: "PROJECT" },
  { username: "cz",   name: "陈权",   team: "PROJECT" },
  { username: "qy",   name: "林锦",   team: "PROJECT" },
  { username: "ww",   name: "谷浩天", team: "PROJECT" },
  { username: "ty",   name: "王一帆", team: "PROJECT" },
  { username: "dy",   name: "张耿标", team: "PROJECT" },
  { username: "czh",  name: "吴杰",   team: "PROJECT" },
  { username: "lm",   name: "林子涵", team: "PROJECT" },
  { username: "zy",   name: "吴毅强", team: "PROJECT" },
  { username: "ph",   name: "郭柳江", team: "PROJECT" },
  { username: "yf",   name: "陈默涵", team: "PROJECT" },
  { username: "zhx",  name: "赵龙",   team: "PROJECT" },
  { username: "jr",   name: "蔡圣炜", team: "PROJECT" },
  { username: "sw",   name: "焦佳豪", team: "PROJECT" },
  { username: "hy",   name: "黄传武", team: "PROJECT" },
  { username: "cl",   name: "岳佳成", team: "PROJECT" },
  { username: "tf",   name: "郑凯轩", team: "PROJECT" },
  { username: "xf",   name: "阮腾伟", team: "PROJECT" },
  { username: "qh",   name: "李志浩", team: "PROJECT" },
  { username: "wk",   name: "杜思明", team: "QA" },
  { username: "mt",   name: "谢木江", team: "AFTERSALES" },
  // 售后工程师（演示补足）
  { username: "lzw",  name: "刘仲武", team: "AFTERSALES" },
];

const WEEKLY_STAFF = SEED_STAFF.map((s) => s.username);

async function main() {
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123456";

  const existing = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existing) {
    await prisma.user.create({
      data: {
        username: adminUsername,
        password: bcrypt.hashSync(adminPassword, 10),
        name: process.env.SEED_ADMIN_NAME || "系统管理员",
        role: Role.ADMIN,
      },
    });
    console.log(`✔ 创建管理员账号: ${adminUsername}`);
  }

  // 创建/更新周报人员账号（强制使用真实姓名 + 正确分组）
  for (const s of SEED_STAFF) {
    await prisma.user.upsert({
      where: { username: s.username },
      update: {
        name: s.name,
        team: s.team,
        active: true,
        role: Role.PM,
        password: bcrypt.hashSync("Abc@12345", 10),
      },
      create: {
        username: s.username,
        password: bcrypt.hashSync("Abc@12345", 10),
        name: s.name,
        role: Role.PM,
        team: s.team,
        active: true,
      },
    });
  }

  // 清理旧的占位账号（"员工_XX" 或不属于 SEED_STAFF 的 PM）
  const placeholders = await prisma.user.findMany({
    where: {
      OR: [
        { name: { startsWith: "员工_" } },
        {
          AND: [
            { team: { not: null } },
            { username: { notIn: SEED_STAFF.map((s) => s.username) } },
            { username: { not: "pm" } },
          ],
        },
      ],
    },
    select: { id: true, username: true, name: true },
  });
  for (const u of placeholders) {
    // 仅删除未产生周报/项目数据的占位账号
    const hasReport = await prisma.weeklyReport.count({ where: { staffId: u.id } });
    const hasProject = await prisma.projectManager.count({ where: { userId: u.id } });
    if (hasReport === 0 && hasProject === 0) {
      await prisma.user.delete({ where: { id: u.id } });
      console.log(`  - 清理占位账号: ${u.username} (${u.name})`);
    } else {
      // 保留账号但补正姓名（若仍是占位）
      if (u.name.startsWith("员工_")) {
        await prisma.user.update({ where: { id: u.id }, data: { active: false } });
        console.log(`  - 停用旧占位账号: ${u.username} (${u.name})`);
      }
    }
  }

  console.log(`✔ 周报人员账号就绪（${SEED_STAFF.length} 人：项目组/售后组/质安组）`);

  // 创建主管账号
  const sup = await prisma.user.findUnique({ where: { username: "supervisor" } });
  if (!sup) {
    await prisma.user.create({
      data: {
        username: "supervisor",
        password: bcrypt.hashSync("Sup@12345", 10),
        name: "主管",
        role: Role.SUPERVISOR,
      },
    });
  }

  const pm = await prisma.user.findUnique({ where: { username: "pm" } });
  if (pm) {
    await prisma.user.update({
      where: { id: pm.id },
      data: { name: "项目经理演示号", team: "PROJECT", role: Role.PM },
    });
  } else {
    await prisma.user.create({
      data: {
        username: "pm",
        password: bcrypt.hashSync("Pm@12345", 10),
        name: "项目经理演示号",
        role: Role.PM,
        team: "PROJECT",
      },
    });
  }

  const viewer = await prisma.user.findUnique({ where: { username: "viewer" } });
  if (!viewer) {
    await prisma.user.create({
      data: {
        username: "viewer",
        password: bcrypt.hashSync("View@12345", 10),
        name: "只读访客",
        role: Role.VIEWER,
      },
    });
  }

  console.log("✔ 种子数据完成。");
  console.log("  管理员: admin / " + adminPassword);
  console.log("  主管:   supervisor / Sup@12345");
  console.log("  PM:     pm / Pm@12345");
  console.log("  访客:   viewer / View@12345");
  console.log("  周报人员初始密码: Abc@12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
