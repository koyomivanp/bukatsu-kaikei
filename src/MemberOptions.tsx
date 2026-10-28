import { isActive, type ClubEvent, type Data, type Member } from "./types.ts";

/** 学年ごとにまとめた部員の選択肢 */
export function MemberOptions({ members }: { members: Member[] }) {
  const grades = [...new Set(members.map((m) => m.grade))].sort();
  return grades.map((g) => (
    <optgroup key={g} label={`${g}年`}>
      {members
        .filter((m) => m.grade === g)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
    </optgroup>
  ));
}

/**
 * 運転した人の選択肢。値は「車ID|部員ID」で、運転した人を選ぶと車も決まる。
 * 車が1つなら運転手 → ほかの部員、複数なら車ごとに運転手 → 乗った人。
 */
export function DriverOptions({ data, event }: { data: Data; event: ClubEvent }) {
  const multiTrip = event.trips.length > 1;
  const membersOf = (ids: string[]) => data.members.filter((m) => ids.includes(m.id));
  const groups = event.trips.flatMap((t) => [
    { trip: t, label: multiTrip ? `${t.name}：運転手` : "運転手", members: membersOf(t.driverIds) },
    multiTrip
      ? { trip: t, label: `${t.name}：乗った人`, members: membersOf(t.riderIds.filter((id) => !t.driverIds.includes(id))) }
      : { trip: t, label: t.driverIds.length > 0 ? "ほかの部員" : "部員", members: data.members.filter((m) => !t.driverIds.includes(m.id) && (isActive(m) || t.riderIds.includes(m.id))) },
  ]);
  return groups
    .filter((g) => g.members.length > 0)
    .map((g) => (
      <optgroup key={g.label} label={g.label}>
        {g.members.map((m) => (
          <option key={m.id} value={`${g.trip.id}|${m.id}`}>
            {m.name}
          </option>
        ))}
      </optgroup>
    ));
}
