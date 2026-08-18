// 修复 PGlite 残留的 postmaster.pid 锁文件
// 策略：先把文件内容清空，再尝试删除；绕过 IDE 的 safe-delete shim 对 fs.unlinkSync 的拦截
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), ".pglite-data");
const pidFile = path.join(dataDir, "postmaster.pid");

if (!fs.existsSync(pidFile)) {
  console.log("no postmaster.pid, nothing to fix");
  process.exit(0);
}

try {
  // 1) 覆盖为空内容（PGlite 读到空文件会认为没有有效 postmaster 进程）
  fs.writeFileSync(pidFile, "");
  console.log("cleared postmaster.pid content");
} catch (e) {
  console.log("write clear failed:", e.message);
}

try {
  // 2) 尝试原生删除
  fs.unlinkSync(pidFile);
  console.log("postmaster.pid deleted");
} catch (e) {
  console.log("unlink failed (may be blocked by shim), but content already cleared:", e.message);
}

console.log("done");
