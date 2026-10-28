import { useState } from "react";
import { MemberOptions } from "./MemberOptions.tsx";
import { participantsOf, yen } from "./settle.ts";
import { newId, type Update } from "./store.ts";
import { isActive, type ClubEvent, type Collection, type Data } from "./types.ts";

const KINDS: Collection["kind"][] = ["集金", "返金"];

function CollectionForm({
  data,
  event,
  initial,
  onSave,
  onCancel,
}: {
  data: Data;
  event: ClubEvent;
  initial: Collection | null;
  onSave: (c: Collection) => void;
  onCancel: () => void;
}) {
  const people = participantsOf(data, event);
  const [kind, setKind] = useState<Collection["kind"]>(initial?.kind ?? "集金");
  const [holderId, setHolderId] = useState(initial?.holderId ?? "");
  const [perPerson, setPerPerson] = useState(initial ? String(initial.perPerson) : "");
  const [memberIds, setMemberIds] = useState<string[]>(initial?.memberIds ?? people.map((m) => m.id));
  const [note, setNote] = useState(initial?.note ?? "");
  const yenAmount = Math.round(Number(perPerson.replace(/[,，¥円\s]/g, "")));
  const amount = Number.isFinite(yenAmount) && yenAmount > 0 ? yenAmount : 0;
  const valid = amount > 0 && holderId !== "" && memberIds.length > 0;
  // 対象外の部員でも、すでに選ばれていれば表示する
  const shown = data.members.filter((m) => people.some((p) => p.id === m.id) || memberIds.includes(m.id));
  const holderChoices = data.members.filter((m) => isActive(m) || m.id === holderId);

  return (
    <form
      className="expense-form no-print"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (valid) onSave({ id: initial?.id ?? newId(), eventId: event.id, kind, holderId, perPerson: amount, memberIds, note: note.trim() });
      }}
    >
      <div className="segmented" role="radiogroup" aria-label="種類">
        {KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="grid">
        <label>
          1人あたり（円）
          <input inputMode="numeric" placeholder="2300" value={perPerson} onChange={(e) => setPerPerson(e.target.value)} autoFocus />
        </label>
        <label>
          {kind === "集金" ? "集めた人（預かる人）" : "返した人"}
          <select value={holderId} onChange={(e) => setHolderId(e.target.value)} className={holderId ? "" : "unset"}>
            <option value="">選んでください</option>
            <MemberOptions members={holderChoices} />
          </select>
        </label>
        <label>
          メモ
          <input placeholder={kind === "集金" ? "例：合宿費の前払い" : "例：合宿費の余り"} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend>{kind === "集金" ? "払った人" : "返してもらった人"}</legend>
        <div className="row">
          <button type="button" className="small" onClick={() => setMemberIds(people.map((m) => m.id))}>
            参加者全員
          </button>
          <button type="button" className="small" onClick={() => setMemberIds([])}>
            全部外す
          </button>
        </div>
        <div className="row wrap">
          {shown.map((m) => (
            <label key={m.id} className="check">
              <input
                type="checkbox"
                checked={memberIds.includes(m.id)}
                onChange={() => setMemberIds(memberIds.includes(m.id) ? memberIds.filter((x) => x !== m.id) : [...memberIds, m.id])}
              />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="preview">
        {memberIds.length}人 × {yen(amount)} = {yen(amount * memberIds.length)}
        <span className="hint">{kind === "集金" ? "（精算で、払った人の負担から差し引きます）" : "（精算で、返してもらった人に上乗せします）"}</span>
      </p>
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

/** 事前の集金と返金。精算に入るので、集めすぎた分は精算結果で返す相手と金額が分かる */
export function Collections({ data, update, event }: { data: Data; update: Update; event: ClubEvent }) {
  const [editing, setEditing] = useState<Collection | "new" | null>(null);
  const list = data.collections.filter((c) => c.eventId === event.id);
  const nameOf = (id: string | null) => (id ? (data.members.find((m) => m.id === id)?.name ?? "（削除済み）") : "未選択");

  const save = (c: Collection) => {
    update((d) => ({
      ...d,
      collections: d.collections.some((x) => x.id === c.id) ? d.collections.map((x) => (x.id === c.id ? c : x)) : [...d.collections, c],
    }));
    setEditing(null);
  };

  return (
    <div className={`card ${list.length === 0 && !editing ? "no-print" : ""}`}>
      <div className="row spread">
        <h3>集金・返金</h3>
        <button type="button" className="no-print" onClick={() => setEditing("new")}>
          ＋ 集金・返金を追加
        </button>
      </div>
      <p className="hint no-print">
        合宿費などを先に集めたときや、集めたお金から返したときに記録します。精算に入るので、集めすぎた分は下の精算で「受け取る」として出てきます。
      </p>
      {editing && (
        <CollectionForm
          key={editing === "new" ? "new" : editing.id}
          data={data}
          event={event}
          initial={editing === "new" ? null : editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
      {list.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>種類</th>
              <th>メモ</th>
              <th>預かる人・返した人</th>
              <th className="num">1人あたり</th>
              <th className="num">人数</th>
              <th className="num">合計</th>
              <th className="no-print" />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className={`tag ${c.kind === "返金" ? "travel" : ""}`}>{c.kind}</span>
                </td>
                <td>{c.note}</td>
                <td>{nameOf(c.holderId)}</td>
                <td className="num">{yen(c.perPerson)}</td>
                <td className="num">{c.memberIds.length}人</td>
                <td className="num">{yen(c.perPerson * c.memberIds.length)}</td>
                <td className="no-print actions">
                  <button type="button" onClick={() => setEditing(c)}>
                    編集
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (confirm(`${c.kind}「${c.note || yen(c.perPerson)}」を削除しますか？`))
                        update((d) => ({ ...d, collections: d.collections.filter((x) => x.id !== c.id) }));
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
