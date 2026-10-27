import { isActive, type Gender, type Member, type Status } from "./types.ts";

/** 継続届「部員名簿」シートの1行 */
export type RosterRow = { studentId: string; name: string; grade: number; faculty: string };

export type RosterSheet = { sheet: string; data: unknown[][] };

export type RosterPlan = {
  added: RosterRow[];
  updated: { member: Member; row: RosterRow }[];
  unchanged: Member[];
  /** 在籍中なのに継続届にいない人 */
  missing: Member[];
};

/** 継続届にいない人をどうするか */
export type MissingChoice = Status | "そのまま";

/** 4年生以上はOB、それ以外は退部を初期値にする */
export function defaultMissingChoice(member: Member): MissingChoice {
  return member.grade >= 4 ? "OB" : "退部";
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const squash = (v: unknown) => text(v).replace(/[\s　]/g, "");

/** 氏名の比較用。全角・半角スペースの違いは無視する。 */
export function sameName(a: string, b: string): boolean {
  return squash(a) === squash(b);
}

function findHeader(data: unknown[][]) {
  for (let r = 0; r < Math.min(data.length, 20); r++) {
    const row = data[r] ?? [];
    const col = (test: (s: string) => boolean) => row.findIndex((v) => test(squash(v)));
    const name = col((s) => s === "氏名" || s.startsWith("氏名"));
    const grade = col((s) => s.startsWith("学年"));
    if (name < 0 || grade < 0) continue;
    return { row: r, name, grade, studentId: col((s) => s.startsWith("学籍番号")), faculty: col((s) => s.startsWith("学部")) };
  }
  return null;
}

/** 継続届のブックから部員名簿を取り出す。見つからなければ null。 */
export function parseRoster(sheets: RosterSheet[]): { sheet: string; rows: RosterRow[] } | null {
  const ordered = [...sheets.filter((s) => s.sheet.includes("部員名簿")), ...sheets.filter((s) => !s.sheet.includes("部員名簿"))];
  for (const { sheet, data } of ordered) {
    const header = findHeader(data);
    if (!header) continue;
    const rows: RosterRow[] = [];
    for (const row of data.slice(header.row + 1)) {
      const name = text(row[header.name]);
      if (!name || name.startsWith("※")) continue;
      const grade = Number(squash(row[header.grade]).match(/\d+/)?.[0]);
      rows.push({
        name,
        grade: Number.isFinite(grade) && grade > 0 ? grade : 1,
        studentId: header.studentId >= 0 ? squash(row[header.studentId]) : "",
        faculty: header.faculty >= 0 ? text(row[header.faculty]) : "",
      });
    }
    if (rows.length > 0) return { sheet, rows };
  }
  return null;
}

/** 学籍番号で照合し、なければ氏名で照合する。 */
export function planImport(members: Member[], rows: RosterRow[]): RosterPlan {
  const plan: RosterPlan = { added: [], updated: [], unchanged: [], missing: [] };
  const matched = new Set<string>();
  for (const row of rows) {
    const member =
      (row.studentId && members.find((m) => m.studentId === row.studentId)) ||
      members.find((m) => !matched.has(m.id) && (!m.studentId || !row.studentId) && sameName(m.name, row.name));
    if (!member) {
      plan.added.push(row);
      continue;
    }
    matched.add(member.id);
    const changed =
      member.grade !== row.grade ||
      member.name !== row.name ||
      !isActive(member) ||
      (row.studentId !== "" && member.studentId !== row.studentId) ||
      (row.faculty !== "" && member.faculty !== row.faculty);
    if (changed) plan.updated.push({ member, row });
    else plan.unchanged.push(member);
  }
  plan.missing = members.filter((m) => isActive(m) && !matched.has(m.id));
  return plan;
}

export function applyImport(
  members: Member[],
  plan: RosterPlan,
  genders: Record<number, Gender>,
  missingChoices: Record<string, MissingChoice>,
  newId: () => string,
): Member[] {
  const updates = new Map(plan.updated.map((u) => [u.member.id, u.row]));
  const next = members.map((m) => {
    const row = updates.get(m.id);
    if (row) {
      return {
        ...m,
        name: row.name,
        grade: row.grade,
        status: "在籍" as const,
        studentId: row.studentId || m.studentId,
        faculty: row.faculty || m.faculty,
      };
    }
    const choice = plan.missing.some((x) => x.id === m.id) ? (missingChoices[m.id] ?? defaultMissingChoice(m)) : "そのまま";
    return choice === "そのまま" ? m : { ...m, status: choice };
  });
  const added = plan.added.map((row, i) => ({
    id: newId(),
    name: row.name,
    grade: row.grade,
    gender: genders[i] ?? "未設定",
    status: "在籍" as const,
    studentId: row.studentId || undefined,
    faculty: row.faculty || undefined,
  }));
  return [...next, ...added];
}
