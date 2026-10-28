import { burdenOf, labelOf, settle, split, yen } from "./settle.ts";
import { ANNUAL, isTravel, type Burden, type ClubEvent, type Collection, type Data, type Expense, type Member } from "./types.ts";

export function burdenLabel(expense: Expense, event: ClubEvent): string {
  if (isTravel(expense.category)) {
    const trip = event.trips.find((t) => t.id === expense.tripId);
    return trip ? `${trip.name}に乗った人（運転手除く）` : "（車が未選択）";
  }
  const burden: Burden = expense.burden;
  if (burden.mode === "all") return event.id === ANNUAL ? "部員全員（在籍中）" : "イベント参加者";
  if (burden.mode === "pick") return "個別指定";
  return [burden.grades.map((g) => `${g}年`).join("・"), burden.genders.join("・")].filter(Boolean).join(" / ") + "のみ";
}

export type BreakdownRow = {
  expense: Expense;
  payer: string;
  /** 誰で割ったか（個別指定なら名前を並べる） */
  who: string;
  count: number;
  /** 1人あたり。端数で1円違う人がいれば min と max が違う */
  min: number;
  max: number;
  /** 立て替えた人・負担する人が決まらず、精算に入っていない */
  excluded: boolean;
};

export type EventBreakdown = { event: ClubEvent; total: number; rows: BreakdownRow[]; collections: Collection[] };

/** 部員に説明するための、会計ごとの支出の内訳 */
export function breakdownOf(data: Data, eventIds: string[]): EventBreakdown[] {
  const nameOf = (id: string | null) => data.members.find((m) => m.id === id)?.name ?? "未選択";
  return eventIds.flatMap((id) => {
    const event = data.events.find((e) => e.id === id);
    if (!event) return [];
    const expenses = data.expenses.filter((x) => x.eventId === id);
    const rows = expenses.map((expense): BreakdownRow => {
      const members: Member[] = burdenOf(data, event, expense);
      const shares = [...split(expense.amount, members).values()];
      return {
        expense,
        payer: nameOf(expense.payerId),
        who: expense.burden.mode === "pick" && !isTravel(expense.category) ? members.map((m) => m.name).join("・") : burdenLabel(expense, event),
        count: members.length,
        min: shares.length ? Math.min(...shares) : 0,
        max: shares.length ? Math.max(...shares) : 0,
        excluded: !expense.payerId || (isTravel(expense.category) && !expense.driverId) || members.length === 0,
      };
    });
    return [{ event, total: expenses.reduce((s, x) => s + x.amount, 0), rows, collections: data.collections.filter((c) => c.eventId === id) }];
  });
}

export const perPersonText = (row: BreakdownRow) => (row.count === 0 ? "—" : row.min === row.max ? yen(row.min) : `${yen(row.min)}〜${yen(row.max)}`);

/** LINE などに貼る支出の内訳。withPeople なら最後に一人ずつの負担額も載せる */
export function breakdownText(data: Data, eventIds: string[], withPeople: boolean): string {
  const list = breakdownOf(data, eventIds);
  const out = [`【支出の内訳】${list.map((b) => b.event.name).join("・")}`];
  for (const { event, total, rows, collections } of list) {
    out.push("", `■ ${event.name}（支出 ${rows.length}件・合計 ${yen(total)}）`);
    if (rows.length === 0) out.push("支出はありません。");
    for (const r of rows) {
      out.push(`・${labelOf(r.expense)}　${yen(r.expense.amount)}`);
      out.push(
        r.excluded
          ? "　※立て替えた人か負担する人が決まっていないため、精算に入っていません"
          : `　立て替え：${r.payer}／${r.who} ${r.count}人で割って1人 ${perPersonText(r)}`,
      );
    }
    for (const c of collections) out.push(`${c.kind}${c.note ? `（${c.note}）` : ""}：1人 ${yen(c.perPerson)} × ${c.memberIds.length}人`);
  }
  if (withPeople) {
    const lines = settle(data, eventIds).lines.filter((l) => l.owed > 0);
    if (lines.length > 0) out.push("", "▼一人ずつの負担額（上の支出の合計）", ...lines.map((l) => `・${l.member.name}　${yen(l.owed)}`));
  }
  return out.join("\n");
}
