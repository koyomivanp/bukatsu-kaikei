import readXlsxFile from "read-excel-file/node";
import { applyImport, parseRoster, planImport } from "../src/roster.ts";
import type { Member } from "../src/types.ts";

const path = process.argv[2];
let failed = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "OK " : "NG "} ${label}`);
  if (!ok) failed++;
};

const parsed = parseRoster((await readXlsxFile(path)) as never);
check("部員名簿シートが見つかる", parsed !== null);
const rows = parsed!.rows;
console.log(`  シート「${parsed!.sheet}」から ${rows.length}人`, "学年別:", JSON.stringify(Object.fromEntries([1, 2, 3, 4, 5, 6].map((g) => [g, rows.filter((r) => r.grade === g).length]))));
check("注意書き（※）は読み込まない", rows.every((r) => !r.name.startsWith("※")));
check("全員に学籍番号がある", rows.every((r) => /^\d+$/.test(r.studentId)));
check("学籍番号に重複がない", new Set(rows.map((r) => r.studentId)).size === rows.length);

let n = 0;
const newId = () => `m${++n}`;
// 1年目：空の名簿に読み込む。性別は先頭の人だけ設定してみる
const first = planImport([], rows);
check("1年目：全員が新規", first.added.length === rows.length);
let members: Member[] = applyImport([], first, { 0: "男" }, {}, newId);
check("1年目：性別未設定の人は「未設定」", members[1].gender === "未設定" && members[0].gender === "男");

// 2年目：学年+1、最上級の1人が抜け、新入生1人が入る。名前のスペースが半角に変わった人もいる
const nextRows = rows
  .filter((r) => r.studentId !== rows[rows.length - 1].studentId)
  .map((r, i) => ({ ...r, grade: r.grade + 1, name: i === 2 ? r.name.replace("　", " ") : r.name }));
nextRows.push({ studentId: "279999", name: "新入 太郎", grade: 1, faculty: "経済学部" });
const second = planImport(members, nextRows);
check("2年目：新入生1人だけが新規", second.added.length === 1 && second.added[0].name === "新入 太郎");
check("2年目：抜けた1人が「いない人」", second.missing.length === 1 && second.missing[0].studentId === rows[rows.length - 1].studentId);
const before = members;
members = applyImport(members, second, {}, {}, newId);
check("2年目：学年が上がる", members[0].grade === rows[0].grade + 1);
check("2年目：設定した性別は残る", members[0].gender === "男");
const gone = members.find((m) => m.studentId === rows[rows.length - 1].studentId)!;
check("2年目：抜けた人は学年に応じて OB / 退部", gone.status === (gone.grade >= 4 ? "OB" : "退部"));
check("2年目：人数は増えない（同じ人を二重登録しない）", members.length === rows.length + 1);

// 退部した人が翌年また継続届に載れば在籍に戻る
const back = planImport(members, [...nextRows, rows[rows.length - 1]]);
check("戻ってきた人は「情報が変わる人」", back.updated.some((u) => u.member.id === gone.id));
check("戻ってきた人は在籍に戻る", applyImport(members, back, {}, {}, newId).find((m) => m.id === gone.id)!.status === "在籍");
check("「そのまま」を選ぶと在籍のまま", applyImport(before, second, {}, { [gone.id]: "そのまま" }, newId).find((m) => m.id === gone.id)!.status === "在籍");

// 学籍番号のない手入力の部員は、氏名で照合して学籍番号がつく
const manual: Member[] = [{ id: "x", name: rows[0].name.replace("　", ""), grade: 1, gender: "女", status: "在籍" }];
const third = planImport(manual, rows);
check("手入力の部員は氏名で照合", third.updated.length + third.unchanged.length === 1 && third.added.length === rows.length - 1);
check("照合した人に学籍番号がつく", applyImport(manual, third, {}, {}, newId)[0].studentId === rows[0].studentId);

if (failed > 0) throw new Error(`${failed}件の確認に失敗`);
