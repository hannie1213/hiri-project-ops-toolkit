import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const u = await p.user.findMany({
    where: { active: true, team: { not: null } },
    select: { username: true, name: true, team: true },
    orderBy: { username: "asc" },
  });
  console.log("共", u.length, "人");
  for (const x of u) console.log(" ", x.username, "|", x.name, "|", x.team);
}
main().finally(() => p.$disconnect());