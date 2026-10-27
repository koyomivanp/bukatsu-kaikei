import { ANNUAL, isActive, isTravel, type ClubEvent, type Data, type Expense, type Member } from "./types.ts";

/** collected は集金で払った分（プラス）と、預かった分・返金を受けた分（マイナス）の合計 */
export type Line = { member: Member; owed: number; paid: number; collected: number; net: number };
export type Transfer = { from: string; to: string; amount: number };
export type Settlement = {
  total: number;
  /** 立て替えた人・負担する人が決まらず、精算に入れていない金額 */
  excluded: number;
  lines: Line[];
  transfers: Transfer[];
  warnings: string[];
};

export function participantsOf(data: Data, event: ClubEvent): Member[] {
  if (event.id === ANNUAL) return data.members.filter(isActive);
  const ids = new Set(event.participantIds);
  return data.members.filter((m) => ids.has(m.id));
}

export function burdenOf(data: Data, event: ClubEvent, expense: Expense): Member[] {
  if (isTravel(expense.category)) {
    const trip = event.trips.find((t) => t.id === expense.tripId);
    if (!trip) return [];
    return data.members.filter((m) => trip.riderIds.includes(m.id) && !trip.driverIds.includes(m.id) && m.id !== expense.driverId);
  }
  const pool = participantsOf(data, event);
  const burden = expense.burden;
  if (burden.mode === "all") return pool;
  if (burden.mode === "filter") {
    return pool.filter(
      (m) =>
        (burden.grades.length === 0 || burden.grades.includes(m.grade)) &&
        (burden.genders.length === 0 || burden.genders.includes(m.gender)),
    );
  }
  return pool.filter((m) => burden.memberIds.includes(m.id));
}

/** 均等割り。割り切れない端数は名簿順に1円ずつ上乗せする。 */
export function split(amount: number, members: Member[]): Map<string, number> {
  const out = new Map<string, number>();
  if (members.length === 0) return out;
  const base = Math.floor(amount / members.length);
  let rest = amount - base * members.length;
  for (const m of members) {
    out.set(m.id, base + (rest > 0 ? 1 : 0));
    if (rest > 0) rest--;
  }
  return out;
}

export function settle(data: Data, eventIds: string[]): Settlement {
  const owed = new Map<string, number>();
  const paid = new Map<string, number>();
  const collected = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, yen: number) => map.set(id, (map.get(id) ?? 0) + yen);
  let total = 0;
  let excluded = 0;
  const warnings: string[] = [];

  for (const id of eventIds) {
    const event = data.events.find((e) => e.id === id);
    if (!event) continue;
    for (const expense of data.expenses.filter((x) => x.eventId === id)) {
      total += expense.amount;
      const who = burdenOf(data, event, expense);
      const why = !expense.payerId
        ? "立て替えた人が選ばれていません"
        : isTravel(expense.category) && !expense.driverId
          ? "運転した人が選ばれていません"
          : who.length === 0
            ? "負担する人がいません"
            : null;
      if (why) {
        excluded += expense.amount;
        warnings.push(`「${labelOf(expense)}」${yen(expense.amount)}（${event.name}）：${why}。精算に入っていません。`);
        continue;
      }
      add(paid, expense.payerId!, expense.amount);
      for (const [memberId, yen] of split(expense.amount, who)) add(owed, memberId, yen);
    }
  }

  for (const c of data.collections.filter((c) => eventIds.includes(c.eventId))) {
    const event = data.events.find((e) => e.id === c.eventId);
    if (!c.holderId || !data.members.some((m) => m.id === c.holderId)) {
      warnings.push(`${c.kind}「${c.note || yen(c.perPerson)}」（${event?.name}）：預かる人が選ばれていません。精算に入っていません。`);
      continue;
    }
    const sign = c.kind === "集金" ? 1 : -1;
    for (const id of c.memberIds) {
      add(collected, id, sign * c.perPerson);
      add(collected, c.holderId, -sign * c.perPerson);
    }
  }

  const lines = data.members
    .filter((m) => owed.has(m.id) || paid.has(m.id) || collected.has(m.id))
    .map((member) => {
      const o = owed.get(member.id) ?? 0;
      const p = paid.get(member.id) ?? 0;
      const c = collected.get(member.id) ?? 0;
      return { member, owed: o, paid: p, collected: c, net: p - o + c };
    });
  return { total, excluded, lines, transfers: transfersFor(lines.map((l) => ({ id: l.member.id, net: l.net }))), warnings };
}

/** 払う人から受け取る人へ、なるべく少ない回数で済む送金の組み合わせ */
export function transfersFor(parties: { id: string; net: number }[]): Transfer[] {
  const debtors = parties.filter((p) => p.net < 0).map((p) => ({ id: p.id, left: -p.net }));
  const creditors = parties.filter((p) => p.net > 0).map((p) => ({ id: p.id, left: p.net }));
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left === 0) i++;
    if (creditors[j].left === 0) j++;
  }
  return out;
}

export function labelOf(expense: Expense): string {
  return expense.title ? `${expense.category}：${expense.title}` : expense.category;
}

export function yen(n: number): string {
  return `${n < 0 ? "-" : ""}¥${Math.abs(n).toLocaleString("ja-JP")}`;
}
