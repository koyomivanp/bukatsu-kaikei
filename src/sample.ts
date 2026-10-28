import { ANNUAL, isActive, type Data, type Expense, type Member } from "./types.ts";

/**
 * 「サンプルデータで試す」用の架空の部活。実在の部員とは関係ない名前だけを使う。
 * sample/make-sample.ts でも同じデータをテスト用の JSON に書き出す。
 */
export function sampleData(): Data {
  const roster: [string, number, Member["gender"], Member["status"]?][] = [
    ["佐藤 健太", 3, "男"],
    ["鈴木 美咲", 3, "女"],
    ["高橋 翔", 3, "男"],
    ["田中 葵", 2, "女"],
    ["伊藤 大輝", 2, "男"],
    ["渡辺 さくら", 2, "女"],
    ["山本 湊", 1, "男"],
    ["中村 ひなた", 1, "女"],
    ["小林 蒼", 1, "男"],
    ["加藤 陽菜", 1, "女"],
    ["吉田 拓海", 3, "男", "退部"],
  ];
  const members: Member[] = roster.map(([name, grade, gender, status], i) => ({ id: `m${i + 1}`, name, grade, gender, status: status ?? "在籍" }));
  const id = (name: string) => members.find((m) => m.name.startsWith(name))!.id;
  const active = members.filter(isActive).map((m) => m.id);

  let n = 0;
  const ex = (eventId: string, category: Expense["category"], tripId: string | null, title: string, amount: number, payer: string | null, burden: Expense["burden"] = { mode: "all" }, note = ""): Expense => ({
    id: `x${++n}`, eventId, category, tripId, title, amount, driverId: category !== "雑費" && payer ? id(payer) : null, payerId: payer ? id(payer) : null, burden, note,
  });
  const all = { mode: "all" } as const;

  return {
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
      ex(ANNUAL, "雑費", null, "男子ユニフォーム", 15000, "佐藤", { mode: "filter", grades: [], genders: ["男"] }),
      ex(ANNUAL, "雑費", null, "ボール・備品", 8000, "鈴木", all, "スポーツデポ"),
      ex("summer", "ガソリン", "s1", "佐藤車", 4200, "佐藤"),
      ex("summer", "ガソリン", "s1", "高橋車", 3800, "高橋"),
      ex("summer", "高速", "s1", "", 5600, "佐藤"),
      ex("summer", "雑費", null, "差し入れ", 12345, "田中", all, "イオン"),
      ex("summer", "雑費", null, "1年の宿泊差額", 3000, "高橋", { mode: "filter", grades: [1], genders: [] }),
      ex("summer", "雑費", null, "女子部屋の追加布団", 2400, "渡辺", { mode: "filter", grades: [], genders: ["女"] }),
      ex("summer", "高速", "s2", "", 3980, "鈴木"),
      ex("summer", "ガソリン", "s2", "", 2710, "鈴木"),
      ex("autumn", "ガソリン", "a1", "", 3000, "田中"),
      ex("autumn", "高速", "a1", "", 2400, "伊藤"),
      ex("autumn", "雑費", null, "大会参加費（3年のみ）", 6000, "佐藤", { mode: "filter", grades: [3], genders: [] }),
      ex("autumn", "雑費", null, "先輩への差し入れ", 2000, "伊藤", { mode: "pick", memberIds: [id("山本"), id("中村"), id("小林"), id("加藤")] }),
    ],
    receipts: [],
    collections: [
      { id: "c1", eventId: "summer", kind: "集金", holderId: id("鈴木"), perPerson: 3000, memberIds: active, note: "合宿費の前払い" },
      { id: "c2", eventId: "summer", kind: "返金", holderId: id("鈴木"), perPerson: 500, memberIds: [id("加藤")], note: "途中参加の差額" },
    ],
    settled: {},
  };
}
