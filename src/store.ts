import { useEffect, useState } from "react";
import { ANNUAL, type ClubEvent, type Data, type Expense, type Member, type Trip } from "./types.ts";

const KEY = "bukatsu-kaikei:v1";

export type Update = (fn: (data: Data) => Data) => void;

export function emptyData(): Data {
  return { version: 2, members: [], events: [], expenses: [], settled: {} };
}

type OldEvent = Partial<ClubEvent> & { driverIds?: string[] };
type OldExpense = Partial<Expense> & { driverExempt?: boolean };
type OldMember = Partial<Member> & { retired?: boolean };

/** 会計を作ったときの移動。最初は対象の部員が全員乗っていることにする */
export function defaultTrip(id: string, riderIds: string[]): Trip {
  return { id, name: "移動", riderIds, driverIds: [] };
}

/** 読み込んだデータの欠けを補い、古い形式（運転手が会計ごとに1組、引退チェック）を今の形に直す。通年は常に先頭。 */
export function normalize(raw: Partial<Omit<Data, "version">>): Data {
  const base = { ...emptyData(), ...raw };
  const members: Member[] = (base.members as OldMember[]).map(({ retired, ...m }) => ({
    id: m.id!,
    name: m.name ?? "",
    grade: m.grade ?? 1,
    gender: m.gender ?? "未設定",
    status: m.status ?? (retired ? "OB" : "在籍"),
    ...(m.studentId ? { studentId: m.studentId } : {}),
    ...(m.faculty ? { faculty: m.faculty } : {}),
  }));
  const events: ClubEvent[] = (base.events as OldEvent[]).map((e) => {
    let trips = e.trips ?? (e.driverIds?.length ? [{ id: `${e.id}-trip`, name: "移動", riderIds: e.participantIds ?? [], driverIds: e.driverIds }] : []);
    // 通年以外の会計には、高速・ガソリン用の移動を必ず1つ置く
    if (trips.length === 0 && e.id !== ANNUAL) trips = [defaultTrip(`${e.id}-trip`, e.participantIds ?? [])];
    return { id: e.id!, name: e.name ?? "", participantIds: e.participantIds ?? [], trips };
  });
  const expenses: Expense[] = (base.expenses as OldExpense[]).map((x) => {
    const event = events.find((e) => e.id === x.eventId);
    const travel = x.category ? x.category !== "雑費" : x.driverExempt === true;
    const tripId = x.tripId !== undefined ? x.tripId : travel ? (event?.trips[0]?.id ?? null) : null;
    const trip = event?.trips.find((t) => t.id === tripId);
    return {
      id: x.id!,
      eventId: x.eventId!,
      category: x.category ?? (travel ? "ガソリン" : "雑費"),
      tripId,
      title: x.title ?? "",
      amount: x.amount ?? 0,
      driverId: x.driverId !== undefined ? x.driverId : travel && x.payerId && trip?.driverIds.includes(x.payerId) ? x.payerId : null,
      payerId: x.payerId ?? null,
      burden: x.burden ?? { mode: "all" },
      note: x.note ?? "",
    };
  });
  if (!events.some((e) => e.id === ANNUAL)) {
    events.unshift({ id: ANNUAL, name: "通年（全期間）", participantIds: [], trips: [] });
  }
  return { version: 2, members, events, expenses, settled: base.settled };
}

/** その部員が記録に出てくる回数（立て替え・運転・個別指定・対象・乗車） */
export function usageOf(data: Data, id: string): { paid: number; other: number } {
  const paid = data.expenses.filter((x) => x.payerId === id).length;
  const drove = data.expenses.filter((x) => x.driverId === id && x.payerId !== id).length;
  const picked = data.expenses.filter((x) => x.burden.mode === "pick" && x.burden.memberIds.includes(id)).length;
  const inEvents = data.events.filter((e) => [...e.participantIds, ...e.trips.flatMap((t) => [...t.riderIds, ...t.driverIds])].includes(id)).length;
  return { paid, other: drove + picked + inEvents };
}

/** 部員を消し、記録からも外す。その人が立て替えた支出は「立て替えた人：未選択」になる。 */
export function removeMember(data: Data, id: string): Data {
  const drop = (ids: string[]) => ids.filter((x) => x !== id);
  return {
    ...data,
    members: data.members.filter((m) => m.id !== id),
    events: data.events.map((e) => ({
      ...e,
      participantIds: drop(e.participantIds),
      trips: e.trips.map((t) => ({ ...t, riderIds: drop(t.riderIds), driverIds: drop(t.driverIds) })),
    })),
    expenses: data.expenses.map((x) => ({
      ...x,
      driverId: x.driverId === id ? null : x.driverId,
      payerId: x.payerId === id ? null : x.payerId,
      burden: x.burden.mode === "pick" ? { ...x.burden, memberIds: drop(x.burden.memberIds) } : x.burden,
    })),
    settled: Object.fromEntries(Object.entries(data.settled).map(([k, v]) => [k, drop(v)])),
  };
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    // 壊れたデータは読まずに空から始める
  }
  return normalize({});
}

export function useData(): [Data, Update, (data: Data) => void] {
  const [data, setData] = useState(load);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [data]);
  useEffect(() => {
    if (saveError) alert("ブラウザへの保存に失敗しました。バックアップを書き出してください。");
  }, [saveError]);
  return [data, (fn) => setData((d) => fn(d)), (next) => setData(normalize(next))];
}

export function newId(): string {
  return crypto.randomUUID();
}
