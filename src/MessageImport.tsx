import { useState } from "react";
import { ApiKeyField } from "./ApiKey.tsx";
import { DriverOptions, MemberOptions } from "./MemberOptions.tsx";
import { expenseFromRow, isComplete, missingOf, readMessages, rowsFromMessages, type MessageRow } from "./messages.ts";
import { CATEGORIES, isActive, isTravel, type Category, type ClubEvent, type Data, type Expense } from "./types.ts";

const EXAMPLE = "例：\n高宮 拓：高宮車 高速 2000円\n田中 葵：花火買いました！3,280円\n佐藤：ガソリン代 4500円（鈴木払い）";

/** LINE のトークやノートをコピーして貼り付けると、AI が支出に分けて、確認してから追加する */
export function MessageImport({
  data,
  event,
  apiKey,
  setApiKey,
  onAdd,
  onClose,
}: {
  data: Data;
  event: ClubEvent;
  apiKey: string;
  setApiKey: (key: string) => void;
  onAdd: (expenses: Expense[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<MessageRow[] | null>(null);
  const categories = event.trips.length > 0 ? CATEGORIES : CATEGORIES.filter((c) => !isTravel(c));
  const payerChoices = data.members.filter(isActive);
  const chosen = rows?.filter((r) => r.include && isComplete(r)) ?? [];

  const patch = (id: string, change: Partial<MessageRow>) =>
    setRows((prev) =>
      prev!.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...change };
        // 足りないものを埋めたら、そのまま取り込む対象にする
        return "include" in change || isComplete(r) || !isComplete(next) ? next : { ...next, include: true };
      }),
    );

  const read = async () => {
    setReading(true);
    setError("");
    try {
      const items = await readMessages(text, apiKey);
      if (items.length === 0) setError("支出が見つかりませんでした。金額の書かれたメッセージを貼り付けてください。");
      setRows(rowsFromMessages(data, event, items));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setReading(false);
  };

  return (
    <div className="message-import no-print">
      <h4>メッセージから支出を追加</h4>
      {!rows && (
        <>
          <p className="hint">
            LINE のトークやノートの文章をコピーして貼り付けると、AI が支出ごとに分けます。追加する前に確認できます。
            「高宮車」は高宮さんが運転した車、立て替えた人は「〇〇払い」とあればその人、なければ送った人（高速・ガソリンは運転した人）になります。
          </p>
          <ApiKeyField apiKey={apiKey} onChange={setApiKey} />
          <textarea rows={8} value={text} placeholder={EXAMPLE} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button type="button" className="primary" disabled={!apiKey || !text.trim() || reading} onClick={() => void read()}>
              {reading ? "読み取り中…" : "読み取る"}
            </button>
            <button type="button" onClick={onClose}>
              やめる
            </button>
          </div>
        </>
      )}
      {error && <p className="warning">{error}</p>}

      {rows && rows.length > 0 && (
        <>
          <p className="hint">
            内容を確かめて、追加するものにチェックを入れてください。黄色の行は名簿の誰か決められなかったところがあるので、選んでください。
            雑費は「イベント参加者」で割ります（あとから支出の編集で変えられます）。
          </p>
          <div className="table-scroll">
            <table className="message-rows">
              <thead>
                <tr>
                  <th>追加</th>
                  <th>メッセージ</th>
                  <th>費目</th>
                  <th className="num">金額</th>
                  <th>運転した人</th>
                  <th>立て替えた人</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const missing = missingOf(r);
                  return (
                    <tr key={r.id} className={missing.length > 0 ? "unmatched" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={missing.length > 0}
                          onChange={(e) => patch(r.id, { include: e.target.checked })}
                          aria-label="この支出を追加する"
                        />
                      </td>
                      <td className="quote">
                        {r.item.quote}
                        <div className="hint">
                          {r.item.sender && `送った人：${r.item.sender}`}
                          {r.duplicate && <span className="tag">同じ支出がすでにあるかも</span>}
                          {missing.length > 0 && <span className="caution"> {missing.join("・")}を選んでください</span>}
                        </div>
                      </td>
                      <td>
                        <select value={r.category} onChange={(e) => patch(r.id, { category: e.target.value as Category })}>
                          {categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="num">
                        <input
                          className="amount"
                          inputMode="numeric"
                          value={r.amount ?? ""}
                          placeholder="金額"
                          onChange={(e) => {
                            const n = Math.round(Number(e.target.value.replace(/[,，¥円\s]/g, "")));
                            patch(r.id, { amount: e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : null });
                          }}
                        />
                      </td>
                      <td>
                        {isTravel(r.category) ? (
                          <select
                            value={r.tripId && r.driverId ? `${r.tripId}|${r.driverId}` : ""}
                            className={r.tripId && r.driverId ? "" : "unset"}
                            onChange={(e) => {
                              const [tripId, driverId] = e.target.value.split("|");
                              // 立て替えた人が運転した人のままなら、一緒に変える
                              const follow = !r.item.payer && (r.payerId === null || r.payerId === r.driverId);
                              patch(r.id, { tripId: tripId || null, driverId: driverId || null, ...(follow ? { payerId: driverId || null } : {}) });
                            }}
                          >
                            <option value="">選んでください</option>
                            <DriverOptions data={data} event={event} />
                          </select>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td>
                        <select value={r.payerId ?? ""} className={r.payerId ? "" : "unset"} onChange={(e) => patch(r.id, { payerId: e.target.value || null })}>
                          <option value="">選んでください</option>
                          <MemberOptions members={payerChoices} />
                        </select>
                      </td>
                      <td>
                        <input value={r.title} placeholder="任意" onChange={(e) => patch(r.id, { title: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button type="button" className="primary" disabled={chosen.length === 0} onClick={() => onAdd(chosen.map((r) => expenseFromRow(event, r)))}>
              {chosen.length}件を支出に追加
            </button>
            <button type="button" onClick={() => setRows(null)}>
              文章を貼り直す
            </button>
            <button type="button" onClick={onClose}>
              やめる
            </button>
          </div>
        </>
      )}
    </div>
  );
}
