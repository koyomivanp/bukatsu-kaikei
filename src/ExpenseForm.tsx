import { useState } from "react";
import { burdenOf, participantsOf, split, yen } from "./settle.ts";
import { newId, today } from "./store.ts";
import { CATEGORIES, FILTER_GENDERS, isActive, isTravel, type Burden, type Category, type ClubEvent, type Data, type Expense, type Gender } from "./types.ts";

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
  const [tripId, setTripId] = useState(initial?.tripId ?? event.trips[0]?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [payerId, setPayerId] = useState<string>(initial?.payerId ?? "");
  const [mode, setMode] = useState<Burden["mode"]>(initial?.burden.mode ?? "all");
  const [grades, setGrades] = useState<number[]>(initial?.burden.mode === "filter" ? initial.burden.grades : []);
  const [genders, setGenders] = useState<Gender[]>(initial?.burden.mode === "filter" ? initial.burden.genders : []);
  const [picked, setPicked] = useState<string[]>(initial?.burden.mode === "pick" ? initial.burden.memberIds : []);
  const [note, setNote] = useState(initial?.note ?? "");

  const travel = isTravel(category);
  const yenAmount = Math.round(Number(amount.replace(/[,，¥円\s]/g, "")));
  const burden: Burden =
    travel || mode === "all" ? { mode: "all" } : mode === "filter" ? { mode, grades, genders } : { mode, memberIds: picked };
  const draft: Expense = {
    id: initial?.id ?? newId(),
    eventId: event.id,
    category,
    tripId: travel ? tripId || null : null,
    date,
    title: title.trim(),
    amount: Number.isFinite(yenAmount) ? yenAmount : 0,
    payerId: payerId || null,
    burden,
    note: note.trim(),
  };
  const who = burdenOf(data, event, draft);
  const shares = [...split(draft.amount, who).values()];
  const valid = draft.amount > 0 && (!travel || draft.tripId !== null);
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
        {CATEGORIES.map((c) => (
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
        <label>
          立て替えた人
          <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            <option value="">部費から支払い</option>
            {data.members
              .filter((m) => isActive(m) || m.id === payerId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        {travel && (
          <label>
            どの移動？
            <select value={tripId} onChange={(e) => setTripId(e.target.value)}>
              {event.trips.length === 0 && <option value="">（移動がありません）</option>}
              {event.trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          日付
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          内容（任意）
          <input placeholder={travel ? "例：Aさんの車" : "例：差し入れ、花火"} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>

      {travel && event.trips.length === 0 && (
        <p className="warning">高速・ガソリンを登録するには、先に上の「＋ 移動（車）を追加」で移動を作り、乗った人と運転手を選んでください。</p>
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
