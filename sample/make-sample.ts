import { sampleData } from "../src/sample.ts";
import { settle } from "../src/settle.ts";
import { writeFileSync } from "node:fs";

const data = sampleData();
for (const e of data.events) {
  const r = settle(data, [e.id]);
  const sum = r.lines.reduce((s, l) => s + l.net, 0);
  console.log(e.name, "支出", r.total, "収支合計", sum, "警告", r.warnings.length);
}
writeFileSync(new URL("./テストデータ.json", import.meta.url), JSON.stringify(data, null, 2));
