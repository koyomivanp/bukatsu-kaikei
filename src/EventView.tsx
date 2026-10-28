import { useState } from "react";
import { Collections } from "./Collections.tsx";
import { ExpenseForm } from "./ExpenseForm.tsx";
import { PeoplePanel } from "./PeoplePanel.tsx";
import { autoMatch, receiptLabel, receiptsOf } from "./receipts.ts";
import { Receipts } from "./Receipts.tsx";
import { SettlementView } from "./SettlementView.tsx";
import { burdenOf, settle, yen } from "./settle.ts";
import type { Update } from "./store.ts";
import { ANNUAL, isTravel, type Burden, type ClubEvent, type Data, type Expense, type Receipt, type Trip } from "./types.ts";

function burdenLabel(expense: Expense, event: ClubEvent): string {
  if (isTravel(expense.category)) {
    const trip = event.trips.find((t) => t.id === expense.tripId);
    return trip ? `${trip.name}に乗った人（運転手除く）` : "（車が未選択）";
  }
  const burden: Burden = expense.burden;
  if (burden.mode === "all") return event.id === ANNUAL ? "部員全員（在籍中）" : "イベント参加者";
  if (burden.mode === "pick") return "個別指定";
  return [burden.grades.map((g) => `${g}年`).join("・"), burden.genders.join("・")].filter(Boolean).join(" / ") + "のみ";
}

/** 支出についたレシート。合計が支出の金額と違えば知らせる */
function ReceiptNote({ receipts, amount }: { receipts: Receipt[]; amount: number }) {
  if (receipts.length === 0) return null;
  const sum = receipts.reduce((s, r) => s + (r.amount ?? 0), 0);
  return (
    <div className="hint receipt-note">
      レシート：{receipts.map((r) => `${receiptLabel(r)} ${r.amount === null ? "" : yen(r.amount)}`).join("、")}
      {sum !== amount && <span className="mismatch">（レシート合計 {yen(sum)} と金額が違います）</span>}
    </div>
  );
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function EventView({ data, update, event, onBack }: { data: Data; update: Update; event: ClubEvent; onBack: () => void }) {
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const annual = event.id === ANNUAL;
  const expenses = data.expenses.filter((x) => x.eventId === event.id);
  const result = settle(data, [event.id]);
  const nameOf = (id: string | null) => (id ? (data.members.find((m) => m.id === id)?.name ?? "（削除済み）") : "未選択");

  const patchEvent = (patch: Partial<ClubEvent>) =>
    update((d) => ({ ...d, events: d.events.map((e) => (e.id === event.id ? { ...e, ...patch } : e)) }));

  const saveExpense = (expense: Expense) => {
    const driver = expense.driverId;
    // 運転した人は、その移動の乗車・運転手にも入れる
    const withDriver = (t: Trip): Trip =>
      !driver || t.id !== expense.tripId || t.driverIds.includes(driver)
        ? t
        : { ...t, riderIds: t.riderIds.includes(driver) ? t.riderIds : [...t.riderIds, driver], driverIds: [...t.driverIds, driver] };
    update((d) =>
      autoMatch(
        {
          ...d,
          events: d.events.map((e) => (e.id === event.id ? { ...e, trips: e.trips.map(withDriver) } : e)),
          expenses: d.expenses.some((x) => x.id === expense.id) ? d.expenses.map((x) => (x.id === expense.id ? expense : x)) : [...d.expenses, expense],
        },
        event.id,
      ),
    );
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
                if (!confirm(`「${event.name}」と、その支出 ${expenses.length}件・レシート ${data.receipts.filter((r) => r.eventId === event.id).length}枚を削除しますか？`)) return;
                update((d) => ({
                  ...d,
                  events: d.events.filter((e) => e.id !== event.id),
                  receipts: d.receipts.filter((r) => r.eventId !== event.id),
                  collections: d.collections.filter((c) => c.eventId !== event.id),
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

      {annual ? (
        <p className="hint">通年の雑費は、在籍中の部員全員で割ります。</p>
      ) : (
        <PeoplePanel data={data} update={update} event={event} />
      )}

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
                <td>
                  <span className={`tag ${isTravel(x.category) ? "travel" : ""}`}>{x.category}</span>
                </td>
                <td>
                  {x.title}
                  {x.note && <div className="hint">{x.note}</div>}
                  <ReceiptNote receipts={receiptsOf(data, x)} amount={x.amount} />
                </td>
                <td className="num">{yen(x.amount)}</td>
                <td>
                  {nameOf(x.payerId)}
                  {x.driverId && x.driverId !== x.payerId && <div className="hint">運転：{nameOf(x.driverId)}</div>}
                </td>
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
                        update((d) => ({
                          ...d,
                          expenses: d.expenses.filter((y) => y.id !== x.id),
                          receipts: d.receipts.map((r) => (r.expenseId === x.id ? { ...r, expenseId: null } : r)),
                        }));
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
              <td colSpan={2}>合計</td>
              <td className="num">{yen(result.total)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
        {expenses.length === 0 && <p className="empty">まだ支出がありません。</p>}
      </div>

      <Collections data={data} update={update} event={event} />

      <Receipts data={data} update={update} event={event} />

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
