// 临时诊断脚本：测试 PrismaClient 到 PGlite 的连接
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});
try {
  const n = await prisma.user.count();
  console.log('DB-OK user count =', n);
} catch (e) {
  console.error('DB-ERR:', e.message);
  if (e.meta) console.error('META:', JSON.stringify(e.meta));
}
await prisma.$disconnect();
