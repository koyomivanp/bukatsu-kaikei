import { burdenOf, participantsOf, settle } from "./settle.ts";
import { normalize, removeMember, usageOf } from "./store.ts";
import { ANNUAL, type Data, type Expense, type Member } from "./types.ts";

const m = (id: string, grade: number, gender: Member["gender"]): Member => ({ id, name: id, grade, gender, status: "在籍" });
const x = (id: string, eventId: string, category: Expense["category"], tripId: string | null, amount: number, payerId: string | null, burden: Expense["burden"] = { mode: "all" }): Expense => ({
  id, eventId, category, tripId, title: "", amount, driverId: category === "雑費" ? null : payerId, payerId, burden, note: "",
});
const data: Data = {
  version: 2,
  members: [m("A", 1, "男"), m("B", 1, "女"), m("C", 2, "男"), m("D", 2, "女"), m("E", 3, "男")],
  events: [
    { id: ANNUAL, name: "通年", participantIds: [], trips: [] },
    {
      id: "camp",
      name: "夏合宿まで",
      participantIds: ["A", "B", "C", "D", "E"],
      trips: [
        { id: "t1", name: "①", riderIds: ["A", "B", "C", "D"], driverIds: ["C"] },
        { id: "t2", name: "②", riderIds: ["A", "B", "C", "D", "E"], driverIds: ["D", "E"] },
      ],
    },
  ],
  expenses: [
    x("1", "camp", "ガソリン", "t1", 3000, "C"),
    x("2", "camp", "高速", "t2", 3001, "D"),
    x("3", "camp", "雑費", null, 5000, "A"),
    x("4", "camp", "雑費", null, 2000, "E", { mode: "filter", grades: [1], genders: [] }),
    x("5", ANNUAL, "雑費", null, 1500, "D", { mode: "filter", grades: [], genders: ["男"] }),
    { ...x("6", "camp", "ガソリン", null, 500, "A"), driverId: null },
    x("7", "camp", "雑費", null, 700, null),
  ],
  settled: {},
};

let failed = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "OK " : "NG "} ${label}`);
  if (!ok) failed++;
};

const camp = settle(data, ["camp"]);
const owed = Object.fromEntries(camp.lines.map((l) => [l.member.id, l.owed]));
// ①ガソリン3000：A,B,D（Cは運転）で1000ずつ / ②高速3001：A,B,C（D,Eは運転）で1001,1000,1000
// 雑費5000：全員5人で1000ずつ / 1年のみ2000：A,Bで1000ずつ / 運転者なしガソリン500・立て替えなし雑費700：精算に入れない
check("①の運転手Cは①のガソリンを負担しない", owed.C === 1000 + 1000);
check("①に乗っていないEはガソリン①を負担しない", owed.E === 1000);
check("②の運転手D・Eは②の高速を負担しない", owed.D === 1000 + 1000);
check("端数は名簿順に上乗せ", owed.A === 1000 + 1001 + 1000 + 1000 && owed.B === 1000 + 1000 + 1000 + 1000);
check("運転者のない交通費・立て替えのない支出は警告", camp.warnings.length === 2 && camp.warnings[0].includes("運転した人が選ばれていません") && camp.warnings[1].includes("立て替えた人が選ばれていません"));
check("警告の支出は精算に入れない", camp.excluded === 1200 && camp.lines.find((l) => l.member.id === "A")!.paid === 5000);
check("収支の合計がゼロ", camp.lines.reduce((s, l) => s + l.net, 0) === 0);
const moved = new Map<string, number>();
for (const t of camp.transfers) {
  moved.set(t.from, (moved.get(t.from) ?? 0) - t.amount);
  moved.set(t.to, (moved.get(t.to) ?? 0) + t.amount);
}
check("送金で全員の収支が埋まる", camp.lines.every((l) => (moved.get(l.member.id) ?? 0) === l.net) );

const all = settle(data, data.events.map((e) => e.id));
check("全期間：男子のみの雑費は男子3人で割る", all.lines.find((l) => l.member.id === "E")!.owed === 1000 + 500);
check("全期間：収支の合計がゼロ", all.lines.reduce((s, l) => s + l.net, 0) === 0);

const old = normalize({
  members: data.members,
  events: [{ id: "camp", name: "合宿", participantIds: ["A", "B"], driverIds: ["A"] } as never],
  expenses: [{ id: "g", eventId: "camp", date: "", title: "ガソリン", amount: 100, payerId: "A", burden: { mode: "all" }, driverExempt: true, note: "" } as never],
  settled: {},
});
check("旧データ：運転手つきの会計は移動1つに変換", old.events[1].trips.length === 1 && old.events[1].trips[0].driverIds[0] === "A");
check("旧データ：運転手免除の支出はガソリン＋その移動に変換", old.expenses[0].category === "ガソリン" && old.expenses[0].tripId === old.events[1].trips[0].id);
check("旧データ：通年が先頭に追加される", old.events[0].id === ANNUAL);
check("旧データ：運転手が立て替えた交通費は、その人が運転者になる", old.expenses[0].driverId === "A");
// t1 の運転手は C だけ。支出で運転者に B を選ぶと、その支出は B も外して割る
const byB = { ...x("7", "camp", "高速", "t1", 1000, "B"), driverId: "B" };
check("運転者に選んだ人はその支出の割り勘から外れる", burdenOf(data, data.events[1], byB).map((p) => p.id).join() === "A,D");
check("運転者と立て替えた人が別でも、立て替えた人に返る", (() => {
  const r = settle({ ...data, expenses: [{ ...byB, payerId: "E" }] }, ["camp"]);
  return r.lines.find((l) => l.member.id === "E")!.paid === 1000 && (r.lines.find((l) => l.member.id === "B")?.owed ?? 0) === 0;
})());
const oldMembers = normalize({ members: [{ id: "P", name: "P", grade: 4, gender: "男", retired: true }, { id: "Q", name: "Q", grade: 1, gender: "女", retired: false }] as never });
check("旧データ：引退チェックは OB、それ以外は在籍", oldMembers.members[0].status === "OB" && oldMembers.members[1].status === "在籍");

const withOb = { ...data, members: data.members.map((p) => (p.id === "E" ? { ...p, status: "OB" as const } : p)) };
check("OBは通年の対象から外れる", !participantsOf(withOb, withOb.events[0]).some((p) => p.id === "E"));
check("OBでも過去の会計の対象・運転はそのまま", settle(withOb, ["camp"]).total === settle(data, ["camp"]).total && burdenOf(withOb, withOb.events[1], withOb.expenses[1]).length === 3);

const removed = removeMember({ ...data, settled: { camp: ["C", "D"] } }, "C");
check("削除：名簿から消える", !removed.members.some((p) => p.id === "C"));
check("削除：対象・乗車・運転から外れる", !removed.events[1].participantIds.includes("C") && !removed.events[1].trips[0].riderIds.includes("C") && removed.events[1].trips[0].driverIds.length === 0);
check("削除：立て替えた支出は立て替えた人が未選択になる", removed.expenses[0].payerId === null && removed.expenses.length === data.expenses.length);
check("削除：精算済みからも外れる", removed.settled.camp.join() === "D");
check("削除後も精算の合計は合う", (() => {
  const r = settle(removed, ["camp"]);
  return r.lines.reduce((s, l) => s + l.net, 0) === 0;
})());
check("記録の数を数える", usageOf(data, "C").paid === 1 && usageOf(data, "C").other === 1 && usageOf(data, "B").paid === 0);

if (failed > 0) throw new Error(`${failed}件の確認に失敗`);
