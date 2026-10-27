import { useState } from "react";
import { burdenOf, participantsOf, split, yen } from "./settle.ts";
import { MemberOptions } from "./MemberOptions.tsx";
import { newId } from "./store.ts";
import { CATEGORIES, FILTER_GENDERS, isActive, isTravel, type Burden, type Category, type ClubEvent, type Data, type Expense, type Gender } from "./types.ts";

const travelInitial = (initial: Expense | null) => initial !== null && isTravel(initial.category);

export function ExpenseForm({
  data,
  event,
  initial,
  onSave,
  onCancel,
}: {
  data: Data;
  event: ClubEvent;
  initial: Expense | null;
  onSave: (expense: Expense) => void;
  onCancel: () => void;
}) {
  const people = participantsOf(data, event);
  const [category, setCategory] = useState<Category>(initial?.category ?? "雑費");
  // 運転した人を選ぶと移動も決まる。最初は運転手のいる最初の移動の、最初の運転手
  const firstTrip = event.trips.find((t) => t.driverIds.length > 0) ?? event.trips[0];
  const [tripId, setTripId] = useState(initial?.tripId ?? firstTrip?.id ?? "");
  const [driverId, setDriverId] = useState<string>(initial?.driverId ?? firstTrip?.driverIds[0] ?? "");
  const [otherPayer, setOtherPayer] = useState(travelInitial(initial) && initial!.payerId !== initial!.driverId);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [payerId, setPayerId] = useState<string>(initial?.payerId ?? "");
  const [mode, setMode] = useState<Burden["mode"]>(initial?.burden.mode ?? "all");
  const [grades, setGrades] = useState<number[]>(initial?.burden.mode === "filter" ? initial.burden.grades : []);
  const [genders, setGenders] = useState<Gender[]>(initial?.burden.mode === "filter" ? initial.burden.genders : []);
  const [picked, setPicked] = useState<string[]>(initial?.burden.mode === "pick" ? initial.burden.memberIds : []);
  const [note, setNote] = useState(initial?.note ?? "");

  const travel = isTravel(category);
  const trip = event.trips.find((t) => t.id === tripId);
  const multiTrip = event.trips.length > 1;
  const membersOf = (ids: string[]) => data.members.filter((m) => ids.includes(m.id));
  // 運転した人の候補。移動が1つなら運転手 → ほかの部員、複数なら移動ごとに運転手 → 乗った人
  const driverGroups = event.trips.flatMap((t) => [
    { trip: t, label: multiTrip ? `${t.name}：運転手` : "運転手", members: membersOf(t.driverIds) },
    multiTrip
      ? { trip: t, label: `${t.name}：乗った人`, members: membersOf(t.riderIds.filter((id) => !t.driverIds.includes(id))) }
      : { trip: t, label: t.driverIds.length > 0 ? "ほかの部員" : "部員", members: data.members.filter((m) => !t.driverIds.includes(m.id) && (isActive(m) || t.riderIds.includes(m.id))) },
  ]);
  const categories = event.trips.length > 0 || travelInitial(initial) ? CATEGORIES : CATEGORIES.filter((c) => !isTravel(c));
  const payerChoices = data.members.filter((m) => isActive(m) || m.id === payerId);
  const yenAmount = Math.round(Number(amount.replace(/[,，¥円\s]/g, "")));
  const burden: Burden =
    travel || mode === "all" ? { mode: "all" } : mode === "filter" ? { mode, grades, genders } : { mode, memberIds: picked };
  const draft: Expense = {
    id: initial?.id ?? newId(),
    eventId: event.id,
    category,
    tripId: travel ? tripId || null : null,
    driverId: travel ? driverId || null : null,
    title: title.trim(),
    amount: Number.isFinite(yenAmount) ? yenAmount : 0,
    payerId: (travel && !otherPayer ? driverId : payerId) || null,
    burden,
    note: note.trim(),
  };
  const who = burdenOf(data, event, draft);
  const shares = [...split(draft.amount, who).values()];
  const valid = draft.amount > 0 && draft.payerId !== null && (!travel || (draft.tripId !== null && draft.driverId !== null));
  const gradesHere = [...new Set(people.map((m) => m.grade))].sort();
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <form
      className="expense-form no-print"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (valid) onSave(draft);
      }}
    >
      <div className="segmented" role="radiogroup" aria-label="費目">
        {categories.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={category === c} className={category === c ? "on" : ""} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="grid">
        <label>
          金額（円）
          <input inputMode="numeric" placeholder="3000" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        {travel && (
          <label>
            運転した人
            <select
              value={tripId && driverId ? `${tripId}|${driverId}` : ""}
              onChange={(e) => {
                const [t, d] = e.target.value.split("|");
                setTripId(t ?? "");
                setDriverId(d ?? "");
              }}
              className={driverId ? "" : "unset"}
            >
              <option value="">選んでください</option>
              {driverGroups
                .filter((g) => g.members.length > 0)
                .map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.members.map((m) => (
                      <option key={m.id} value={`${g.trip.id}|${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </label>
        )}
        {(!travel || otherPayer) && (
          <label>
            立て替えた人
            <select value={payerId} onChange={(e) => setPayerId(e.target.value)} className={payerId ? "" : "unset"}>
              <option value="">選んでください</option>
              <MemberOptions members={payerChoices} />
            </select>
          </label>
        )}
        <label>
          内容（任意）
          <input placeholder={travel ? "例：Aさんの車" : "例：差し入れ、花火"} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>

      {travel && (
        <label className="check">
          <input type="checkbox" checked={otherPayer} onChange={(e) => setOtherPayer(e.target.checked)} />
          運転した人と立て替えた人が違う
        </label>
      )}
      {travel && driverId && trip && !trip.driverIds.includes(driverId) && (
        <p className="hint">保存すると、{data.members.find((m) => m.id === driverId)?.name} を{multiTrip ? `「${trip.name}」の` : ""}運転手にします（高速・ガソリンの割り勘から外れます）。</p>
      )}


      {!travel && (
        <fieldset>
          <legend>誰が負担する？</legend>
          <div className="row">
            {(
              [
                ["all", "部員全員"],
                ["filter", "学年・性別で絞る"],
                ["pick", "個別に選ぶ"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="check">
                <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} />
                {label}
              </label>
            ))}
          </div>
          {mode === "filter" && (
            <div className="row">
              {gradesHere.map((g) => (
                <label key={g} className="check">
                  <input type="checkbox" checked={grades.includes(g)} onChange={() => setGrades(toggle(grades, g))} />
                  {g}年
                </label>
              ))}
              <span className="sep" />
              {FILTER_GENDERS.map((g) => (
                <label key={g} className="check">
                  <input type="checkbox" checked={genders.includes(g)} onChange={() => setGenders(toggle(genders, g))} />
                  {g}
                </label>
              ))}
              <span className="hint">チェックなしの項目は絞りません</span>
            </div>
          )}
          {mode === "pick" && (
            <div className="row wrap">
              {people.map((m) => (
                <label key={m.id} className="check">
                  <input type="checkbox" checked={picked.includes(m.id)} onChange={() => setPicked(toggle(picked, m.id))} />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      <p className="preview">
        負担：{who.length}人
        {who.length > 0 && draft.amount > 0 && ` ・ 1人 ${yen(Math.min(...shares))}${Math.min(...shares) !== Math.max(...shares) ? `〜${yen(Math.max(...shares))}` : ""}`}
        {travel && who.length > 0 && <span className="hint">（乗った人から運転手を除いた人）</span>}
        {travel && draft.payerId && ` ・ 立て替え：${data.members.find((m) => m.id === draft.payerId)?.name}`}
      </p>

      <label>
        メモ
        <input placeholder="店名など（任意）" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row">
        <button type="submit" className="primary" disabled={!valid}>
          {initial ? "更新" : "追加"}
        </button>
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
