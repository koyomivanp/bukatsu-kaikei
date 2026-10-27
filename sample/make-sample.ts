import { settle } from "../src/settle.ts";
import { ANNUAL, isActive, type Data, type Expense, type Member } from "../src/types.ts";
import { writeFileSync } from "node:fs";

const roster: [string, number, Member["gender"], Member["status"]?][] = [
  ["佐藤 健太", 3, "男"],
  ["鈴木 美咲", 3, "女"],
  ["高橋 翔", 3, "男"],
  ["田中 葵", 2, "女"],
  ["伊藤 大輝", 2, "男"],
  ["渡辺 さくら", 2, "女"],
  ["山本 湊", 1, "男"],
  ["中村 ひなた", 1, "女"],
  ["小林 蒼", 1, "その他"],
  ["加藤 陽菜", 1, "女"],
  ["吉田 拓海", 3, "男", "退部"],
];
const members: Member[] = roster.map(([name, grade, gender, status], i) => ({ id: `m${i + 1}`, name, grade, gender, status: status ?? "在籍" }));
const id = (name: string) => members.find((m) => m.name.startsWith(name))!.id;
const active = members.filter(isActive).map((m) => m.id);

let n = 0;
const ex = (eventId: string, category: Expense["category"], tripId: string | null, date: string, title: string, amount: number, payer: string | null, burden: Expense["burden"] = { mode: "all" }, note = ""): Expense => ({
  id: `x${++n}`, eventId, category, tripId, date, title, amount, payerId: payer ? id(payer) : null, burden, note,
});
const all = { mode: "all" } as const;

const data: Data = {
  version: 2,
  members,
  events: [
    { id: ANNUAL, name: "通年（全期間）", participantIds: [], trips: [] },
    {
      id: "summer",
      name: "夏合宿まで",
      participantIds: active,
      trips: [
        { id: "s1", name: "①合宿", riderIds: active.filter((x) => x !== id("加藤")), driverIds: [id("佐藤"), id("高橋")] },
        { id: "s2", name: "②遠征", riderIds: active.filter((x) => ![id("中村"), id("小林")].includes(x)), driverIds: [id("鈴木")] },
      ],
    },
    {
      id: "autumn",
      name: "秋の大会まで",
      participantIds: active,
      trips: [{ id: "a1", name: "①大会", riderIds: active, driverIds: [id("田中"), id("伊藤")] }],
    },
  ],
  expenses: [
    ex(ANNUAL, "雑費", null, "2026-04-10", "男子ユニフォーム", 15000, null, { mode: "filter", grades: [], genders: ["男"] }),
    ex(ANNUAL, "雑費", null, "2026-04-20", "ボール・備品", 8000, "鈴木", all, "スポーツデポ"),
    ex("summer", "ガソリン", "s1", "2026-08-01", "佐藤車", 4200, "佐藤"),
    ex("summer", "ガソリン", "s1", "2026-08-01", "高橋車", 3800, "高橋"),
    ex("summer", "高速", "s1", "2026-08-01", "", 5600, "佐藤"),
    ex("summer", "雑費", null, "2026-08-02", "差し入れ", 12345, "田中", all, "イオン"),
    ex("summer", "雑費", null, "2026-08-02", "1年の宿泊差額", 3000, null, { mode: "filter", grades: [1], genders: [] }),
    ex("summer", "雑費", null, "2026-08-03", "女子部屋の追加布団", 2400, "渡辺", { mode: "filter", grades: [], genders: ["女"] }),
    ex("summer", "高速", "s2", "2026-08-20", "", 3980, "鈴木"),
    ex("summer", "ガソリン", "s2", "2026-08-20", "", 2710, "鈴木"),
    ex("autumn", "ガソリン", "a1", "2026-10-12", "", 3000, "田中"),
    ex("autumn", "高速", "a1", "2026-10-12", "", 2400, "伊藤"),
    ex("autumn", "雑費", null, "2026-10-12", "大会参加費（3年のみ）", 6000, null, { mode: "filter", grades: [3], genders: [] }),
    ex("autumn", "雑費", null, "2026-10-12", "先輩への差し入れ", 2000, "伊藤", { mode: "pick", memberIds: [id("山本"), id("中村"), id("小林"), id("加藤")] }),
  ],
  settled: {},
};

for (const e of data.events) {
  const r = settle(data, [e.id]);
  const sum = r.lines.reduce((s, l) => s + l.net, 0) + r.clubNet;
  console.log(e.name, "支出", r.total, "収支合計", sum, "警告", r.warnings.length);
}
writeFileSync(new URL("./テストデータ.json", import.meta.url), JSON.stringify(data, null, 2));
