const ts = require("fs").readFileSync(
  "node_modules/.prisma/client/default.d.ts",
  "utf8"
);
const hasRole = ts.includes("Role");
const roleLines = ts
  .split("\n")
  .filter((l) => l.includes("Role") && l.includes("export"))
  .slice(0, 5);
console.log("default.d.ts contains Role:", hasRole);
console.log(roleLines.join("\n"));
