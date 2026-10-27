import { useState } from "react";
import { ExpenseForm } from "./ExpenseForm.tsx";
import { SettlementView } from "./SettlementView.tsx";
import { burdenOf, settle, yen } from "./settle.ts";
import { newId, type Update } from "./store.ts";
import { ANNUAL, isActive, isTravel, type Burden, type ClubEvent, type Data, type Expense, type Trip } from "./types.ts";

function burdenLabel(expense: Expense, event: ClubEvent): string {
  if (isTravel(expense.category)) {
    const trip = event.trips.find((t) => t.id === expense.tripId);
    return trip ? `${trip.name}に乗った人（運転手除く）` : "（移動が未選択）";
  }
  const burden: Burden = expense.burden;
  if (burden.mode === "all") return "部員全員";
  if (burden.mode === "pick") return "個別指定";
  return [burden.grades.map((g) => `${g}年`).join("・"), burden.genders.join("・")].filter(Boolean).join(" / ") + "のみ";
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function EventView({ data, update, event, onBack }: { data: Data; update: Update; event: ClubEvent; onBack: () => void }) {
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const annual = event.id === ANNUAL;
  const expenses = data.expenses.filter((x) => x.eventId === event.id).sort((a, b) => a.date.localeCompare(b.date));
  const result = settle(data, [event.id]);
  const nameOf = (id: string | null) => (id ? (data.members.find((m) => m.id === id)?.name ?? "（削除済み）") : "部費");
  const involved = new Set([...event.participantIds, ...event.trips.flatMap((t) => [...t.riderIds, ...t.driverIds])]);
  const rows = data.members.filter((m) => isActive(m) || involved.has(m.id) || showInactive);
  const inactive = data.members.filter((m) => !isActive(m)).length;

  const patchEvent = (patch: Partial<ClubEvent>) =>
    update((d) => ({ ...d, events: d.events.map((e) => (e.id === event.id ? { ...e, ...patch } : e)) }));
  const patchTrip = (tripId: string, patch: Partial<Trip>) =>
    patchEvent({ trips: event.trips.map((t) => (t.id === tripId ? { ...t, ...patch } : t)) });

  const saveExpense = (expense: Expense) => {
    update((d) => ({
      ...d,
      expenses: d.expenses.some((x) => x.id === expense.id)
        ? d.expenses.map((x) => (x.id === expense.id ? expense : x))
        : [...d.expenses, expense],
    }));
    setEditing(null);
  };

  return (
    <section>
      <div className="no-print">
        <button type="button" className="link" onClick={onBack}>
          ← 会計一覧
        </button>
      </div>

      <div className="event-head">
        {annual ? (
          <h2 className="no-print">{event.name}</h2>
        ) : (
          <div className="row no-print">
            <input className="title-input" value={event.name} onChange={(e) => patchEvent({ name: e.target.value })} />
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (!confirm(`「${event.name}」と、その支出 ${expenses.length}件を削除しますか？`)) return;
                update((d) => ({
                  ...d,
                  events: d.events.filter((e) => e.id !== event.id),
                  expenses: d.expenses.filter((x) => x.eventId !== event.id),
                }));
                onBack();
              }}
            >
              会計を削除
            </button>
          </div>
        )}
        <h2 className="print-only">{event.name} 精算書</h2>
        <button type="button" className="no-print" onClick={() => window.print()}>
          印刷 / PDFで保存
        </button>
      </div>

      <div className="card">
        <div className="row spread">
          <h3>部員と移動</h3>
          <button
            type="button"
            className="no-print"
            onClick={() =>
              patchEvent({
                trips: [
                  ...event.trips,
                  { id: newId(), name: `移動${"①②③④⑤⑥⑦⑧⑨"[event.trips.length] ?? event.trips.length + 1}`, riderIds: [], driverIds: [] },
                ],
              })
            }
          >
            ＋ 移動（車）を追加
          </button>
        </div>
        <p className="hint no-print">
          {annual ? "雑費は在籍中の部員全員で割ります。" : "雑費は「対象」の部員全員で割ります。"}
          高速・ガソリンは、移動ごとに「乗った人」から運転手を除いた人数で割ります。
        </p>
        <table className="people">
          <thead>
            <tr>
              <th rowSpan={2}>名前</th>
              <th rowSpan={2}>学年</th>
              <th rowSpan={2}>性別</th>
              <th rowSpan={2}>対象</th>
              {event.trips.map((t) => (
                <th key={t.id} colSpan={2} className="trip-head">
                  <input className="no-print" value={t.name} onChange={(e) => patchTrip(t.id, { name: e.target.value })} />
                  <span className="print-only">{t.name}</span>
                  <button
                    type="button"
                    className="danger small no-print"
                    title="この移動を削除"
                    onClick={() => {
                      const used = data.expenses.filter((x) => x.tripId === t.id).length;
                      if (used > 0) return alert(`「${t.name}」には支出が${used}件あります。先に支出の移動を変えるか削除してください。`);
                      patchEvent({ trips: event.trips.filter((x) => x.id !== t.id) });
                    }}
                  >
                    ×
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              {event.trips.map((t) => [
                <th key={`${t.id}-r`}>乗車</th>,
                <th key={`${t.id}-d`}>運転</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const target = annual ? isActive(m) : event.participantIds.includes(m.id);
              return (
                <tr key={m.id} className={target ? "" : "muted"}>
                  <td>
                    {m.name}
                    {!isActive(m) && <span className="tag">{m.status}</span>}
                  </td>
                  <td>{m.grade}年</td>
                  <td>{m.gender}</td>
                  <td>
                    <input
                      type="checkbox"
                      disabled={annual}
                      checked={target}
                      onChange={() => patchEvent({ participantIds: toggle(event.participantIds, m.id) })}
                    />
                  </td>
                  {event.trips.map((t) => {
                    const rides = t.riderIds.includes(m.id);
                    return [
                      <td key={`${t.id}-r`} className="trip-cell">
                        <input
                          type="checkbox"
                          checked={rides}
                          onChange={() =>
                            patchTrip(t.id, {
                              riderIds: toggle(t.riderIds, m.id),
                              driverIds: rides ? t.driverIds.filter((x) => x !== m.id) : t.driverIds,
                            })
                          }
                        />
                      </td>,
                      <td key={`${t.id}-d`}>
                        <input
                          type="checkbox"
                          disabled={!rides}
                          checked={t.driverIds.includes(m.id)}
                          onChange={() => patchTrip(t.id, { driverIds: toggle(t.driverIds, m.id) })}
                        />
                      </td>,
                    ];
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="no-print">
            <tr>
              <td colSpan={3}>まとめて</td>
              <td>
                {!annual && (
                  <button type="button" className="small" onClick={() => patchEvent({ participantIds: data.members.filter(isActive).map((m) => m.id) })}>
                    全員
                  </button>
                )}
              </td>
              {event.trips.map((t) => (
                <td key={t.id} colSpan={2}>
                  <button
                    type="button"
                    className="small"
                    onClick={() =>
                      patchTrip(t.id, {
                        riderIds: annual ? data.members.filter(isActive).map((m) => m.id) : event.participantIds,
                      })
                    }
                  >
                    対象者を全員乗せる
                  </button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        {event.trips.length > 0 && (
          <p className="hint">
            {event.trips
              .map((t) => `${t.name}：乗車 ${t.riderIds.length}人・運転 ${t.driverIds.length}人 → 高速・ガソリンは ${t.riderIds.length - t.driverIds.length}人で割る`)
              .join("　/　")}
          </p>
        )}
        {inactive > 0 && (
          <label className="check no-print">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            退部・OBの人も表示する（OBが合宿に来たときなど）
          </label>
        )}
        {data.members.length === 0 && <p className="empty">先に「名簿」タブで部員を登録してください。</p>}
      </div>

      <div className="card">
        <div className="row spread">
          <h3>支出</h3>
          <button type="button" className="primary no-print" onClick={() => setEditing("new")}>
            ＋ 支出を追加
          </button>
        </div>
        {editing && (
          <ExpenseForm
            key={editing === "new" ? "new" : editing.id}
            data={data}
            event={event}
            initial={editing === "new" ? null : editing}
            onSave={saveExpense}
            onCancel={() => setEditing(null)}
          />
        )}
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>費目</th>
              <th>内容</th>
              <th className="num">金額</th>
              <th>立て替え</th>
              <th>負担</th>
              <th className="num">人数</th>
              <th className="no-print" />
            </tr>
          </thead>
          <tbody>
            {expenses.map((x) => (
              <tr key={x.id}>
                <td>{x.date}</td>
                <td>
                  <span className={`tag ${isTravel(x.category) ? "travel" : ""}`}>{x.category}</span>
                </td>
                <td>
                  {x.title}
                  {x.note && <div className="hint">{x.note}</div>}
                </td>
                <td className="num">{yen(x.amount)}</td>
                <td>{nameOf(x.payerId)}</td>
                <td>{burdenLabel(x, event)}</td>
                <td className="num">{burdenOf(data, event, x).length}人</td>
                <td className="no-print actions">
                  <button type="button" onClick={() => setEditing(x)}>
                    編集
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      if (confirm(`${yen(x.amount)} の「${x.title || x.category}」を削除しますか？`))
                        update((d) => ({ ...d, expenses: d.expenses.filter((y) => y.id !== x.id) }));
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>合計</td>
              <td className="num">{yen(result.total)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
        {expenses.length === 0 && <p className="empty">まだ支出がありません。</p>}
      </div>

      <SettlementView
        data={data}
        result={result}
        settled={data.settled[event.id] ?? []}
        onToggleSettled={(id) =>
          update((d) => ({ ...d, settled: { ...d.settled, [event.id]: toggle(d.settled[event.id] ?? [], id) } }))
        }
      />
      <p className="print-only hint">出力日時：{new Date().toLocaleString("ja-JP")}</p>
    </section>
  );
}
