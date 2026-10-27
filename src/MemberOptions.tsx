import type { Member } from "./types.ts";

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
