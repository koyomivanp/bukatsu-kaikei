import { participantsOf } from "./settle.ts";
import { isActive, type ClubEvent, type Data, type Member, type Trip } from "./types.ts";

const squash = (s: string) => s.replace(/[\s　・]/g, "");

/** 「田中先輩が立て替え」のような書き方から、名前の部分だけ残す */
export function cleanName(text: string): string {
  return squash(text)
    .replace(/(が|の)?(先払い|先払|立て替え|立替え|立替|建て替え|建替|払い|払|より|から|分|車)$/, "")
    .replace(/(さん|先輩|くん|君|ちゃん)$/, "");
}

/**
 * 書かれた名前に合う部員。名字だけ・名前だけでもよい。
 * 会計の参加者 → 在籍中の部員の順に探し、1人に決まったときだけ返す。
 */
export function findMember(data: Data, event: ClubEvent, text: string): Member | null {
  const name = cleanName(text);
  if (!name) return null;
  for (const pool of [participantsOf(data, event), data.members.filter(isActive)]) {
    const exact = pool.filter((m) => squash(m.name) === name);
    if (exact.length === 1) return exact[0];
    const part = pool.filter((m) => squash(m.name).startsWith(name) || squash(m.name).endsWith(name));
    if (part.length === 1) return part[0];
    if (exact.length + part.length > 1) return null;
  }
  return null;
}

/** その人が運転した車。運転手 → 乗った人 → 車が1つだけ、の順に、1つに決まれば返す */
export function tripOf(event: ClubEvent, memberId: string | null): Trip | null {
  if (memberId) {
    const drove = event.trips.filter((t) => t.driverIds.includes(memberId));
    if (drove.length === 1) return drove[0];
    const rode = event.trips.filter((t) => t.riderIds.includes(memberId));
    if (drove.length === 0 && rode.length === 1) return rode[0];
  }
  return event.trips.length === 1 ? event.trips[0] : null;
}
