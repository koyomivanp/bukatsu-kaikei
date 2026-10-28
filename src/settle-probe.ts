import { burdenOf, participantsOf, settle, settlementText, yen } from "./settle.ts";
import { normalize, removeMember, usageOf } from "./store.ts";
import { autoMatch, cleanName, createFromReceipt, findPayer } from "./receipts.ts";
import { ANNUAL, isDefaultParticipant, type Data, type Expense, type Member, type Receipt } from "./types.ts";

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
  receipts: [],
  collections: [],
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
const text = settlementText("合宿 精算", camp.lines);
const lineOf = (id: string) => camp.lines.find((l) => l.member.id === id)!;
check("LINE用の文章：払う人と受け取る人を分けて載せる", text.startsWith("【合宿 精算】") && text.includes(`▼会計に払う人\n・${lineOf("B").member.name}　${yen(-lineOf("B").net)}`) && text.includes(`▼会計から受け取る人\n・${lineOf("A").member.name}　${yen(lineOf("A").net)}`));
check("LINE用の文章：±0の人は載せない", settlementText("x", camp.lines.map((l) => ({ ...l, net: 0 }))) === "【x】\n\n払う人・受け取る人はいません。");

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
check("旧データ：初期名「移動」は「車」に直す", old.events[1].trips[0].name === "車" && normalize({ events: [{ id: "e", name: "", participantIds: [], trips: [{ id: "t", name: "移動②", riderIds: [], driverIds: [] }, { id: "u", name: "①合宿", riderIds: [], driverIds: [] }] }] }).events[1].trips.map((t) => t.name).join() === "車②,①合宿");
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

// レシートの照合：金額が同じで、まだレシートのない支出に1対1で決まるものだけ結びつける
const r = (id: string, amount: number | null, eventId = "camp"): Receipt => ({ id, eventId, fileName: `${id}.jpg`, fileSize: 1, store: "", date: "", amount, summary: "", category: "雑費", payerNote: "", expenseId: null });
const matched = autoMatch({ ...data, receipts: [r("r1", 3000), r("r2", 3001), r("r3", 3001), r("r4", 5000, ANNUAL), r("r5", null), r("r6", 9999)] }, "camp");
const linkOf = (id: string) => matched.receipts.find((x) => x.id === id)!.expenseId;
check("レシート：金額が1つだけ一致すれば結びつく", linkOf("r1") === "1");
check("レシート：同じ金額のレシートが2枚あれば決めない", linkOf("r2") === null && linkOf("r3") === null);
check("レシート：ほかの会計のレシートは結びつけない", linkOf("r4") === null);
check("レシート：金額が読めない・一致しないものはそのまま", linkOf("r5") === null && linkOf("r6") === null);
check("レシート：結びついた支出には二重に結びつけない", autoMatch({ ...matched, receipts: [...matched.receipts, r("r7", 3000)] }, "camp").receipts.at(-1)!.expenseId === null);

check("4年生以上は会計の対象に最初は入らない", isDefaultParticipant(m("F", 3, "男")) && !isDefaultParticipant(m("G", 4, "男")) && !isDefaultParticipant({ ...m("H", 2, "女"), status: "OB" }));
const oldGender = normalize({ members: [{ ...m("I", 1, "男"), gender: "その他" }] as never, expenses: [{ ...x("8", "camp", "雑費", null, 100, "I"), burden: { mode: "filter", grades: [], genders: ["男", "その他"] } }] as never });
check("旧データ：性別「その他」は未設定に戻す", oldGender.members[0].gender === "未設定" && (oldGender.expenses[0].burden as { genders: string[] }).genders.join() === "男");

// 集金・返金：A が全員から1000ずつ集め、B に200返した
const withCollect: Data = {
  ...data,
  collections: [
    { id: "c1", eventId: "camp", kind: "集金", holderId: "A", perPerson: 1000, memberIds: ["A", "B", "C", "D", "E"], note: "" },
    { id: "c2", eventId: "camp", kind: "返金", holderId: "A", perPerson: 200, memberIds: ["B"], note: "" },
    { id: "c3", eventId: "camp", kind: "集金", holderId: null, perPerson: 500, memberIds: ["C"], note: "" },
  ],
};
const col = settle(withCollect, ["camp"]);
const netOf = (r: typeof col, id: string) => r.lines.find((l) => l.member.id === id)!.net;
check("集金：払った人は精算でその分だけ受け取る側に寄る", netOf(col, "C") === netOf(camp, "C") + 1000 && netOf(col, "B") === netOf(camp, "B") + 1000 - 200);
check("集金：預かった人は預かった分（返金を除く）を返す側に寄る", netOf(col, "A") === netOf(camp, "A") + 1000 - 5000 + 200);
check("集金：収支の合計はゼロのまま", col.lines.reduce((s, l) => s + l.net, 0) === 0);
check("集金：預かる人のない集金は警告して入れない", col.warnings.some((w) => w.includes("預かる人が選ばれていません")) && col.lines.find((l) => l.member.id === "C")!.collected === 1000);
check("集金：ほかの会計の精算には入らない", settle(withCollect, [ANNUAL]).lines.every((l) => l.collected === 0));
check("削除：集金の預かる人を消すと未選択になる", removeMember(withCollect, "A").collections[0].holderId === null);

// レシートの書き込み「〇〇先払い」から支出を作る
const named: Data = {
  ...data,
  expenses: [],
  members: data.members.map((mm, i) => ({ ...mm, name: ["田中 太郎", "田中 花子", "佐藤 健", "鈴木 美咲", "高橋 翔"][i] })),
};
const campEvent = named.events[1];
const rr = (id: string, amount: number | null, category: Receipt["category"], payerNote: string, eventId = "camp"): Receipt => ({ ...r(id, amount, eventId), category, payerNote });
check("書き込み：名前以外を落とす", cleanName("田中先輩 先払い") === "田中" && cleanName("佐藤立替") === "佐藤" && cleanName(" 鈴木さん ") === "鈴木");
check("書き込み：名字・名前・フルネームで部員が決まる", findPayer(named, campEvent, "佐藤")?.id === "C" && findPayer(named, campEvent, "花子")?.id === "B" && findPayer(named, campEvent, "田中　花子")?.id === "B");
check("書き込み：同じ名字が2人いれば決めない", findPayer(named, campEvent, "田中") === null && findPayer(named, campEvent, "") === null);
const made = (receipt: Receipt) => {
  const next = createFromReceipt({ ...named, receipts: [receipt] }, receipt.id);
  return { next, expense: next.expenses[0], linked: next.receipts[0].expenseId };
};
const gas = made(rr("g1", 4000, "ガソリン", "佐藤"));
check("書き込み：ガソリンは書いた人が運転・立て替え、運転した車で割る", gas.expense?.amount === 4000 && gas.expense.payerId === "C" && gas.expense.driverId === "C" && gas.expense.tripId === "t1" && gas.linked === gas.expense.id);
const misc = made(rr("g2", 1234, "雑費", "鈴木先払い"));
check("書き込み：雑費は参加者で割る支出になる", misc.expense?.category === "雑費" && misc.expense.payerId === "D" && misc.expense.burden.mode === "all" && misc.expense.driverId === null);
const highway = made(rr("g3", 800, "高速", "高橋"));
check("書き込み：運転手として載っている車を選ぶ", highway.expense?.tripId === "t2" && highway.expense.driverId === "E");
const rider = made(rr("g4", 900, "ガソリン", "花子"));
check("書き込み：どの車を運転したか決まらなければ作らない", rider.next.expenses.length === 0 && rider.linked === null);
check("書き込み：名前が決まらない・金額が読めない・書き込みなしは作らない", [rr("g5", 900, "雑費", "田中"), rr("g6", null, "雑費", "佐藤"), rr("g7", 900, "雑費", "")].every((x) => made(x).next.expenses.length === 0));
check("書き込み：結びつき済みのレシートからは作らない", createFromReceipt({ ...named, receipts: [{ ...rr("g8", 900, "雑費", "佐藤"), expenseId: "1" }] }, "g8").expenses.length === 0);
const annualGas = made(rr("g9", 3000, "ガソリン", "佐藤", ANNUAL));
check("書き込み：車のない通年では雑費にする", annualGas.expense?.category === "雑費" && annualGas.expense.eventId === ANNUAL);
const newDriver = createFromReceipt({ ...named, events: named.events.map((e) => (e.id === "camp" ? { ...e, trips: [e.trips[0]] } : e)), receipts: [rr("g10", 700, "高速", "鈴木")] }, "g10");
check("書き込み：車が1つなら、書いた人をその車の運転手に入れる", newDriver.expenses[0]?.tripId === "t1" && newDriver.events[1].trips[0].driverIds.includes("D"));

if (failed > 0) throw new Error(`${failed}件の確認に失敗`);
