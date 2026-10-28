import { useRef, useState } from "react";
import { autoMatch, createFromReceipt, findPayer, isReadable, loadApiKey, readReceipt, receiptLabel, saveApiKey } from "./receipts.ts";
import { labelOf, yen } from "./settle.ts";
import { newId, type Update } from "./store.ts";
import type { ClubEvent, Data, Receipt } from "./types.ts";

export function Receipts({
  data,
  update,
  event,
  onCreateExpense,
}: {
  data: Data;
  update: Update;
  event: ClubEvent;
  onCreateExpense: (receipt: Receipt) => void;
}) {
  const [apiKey, setApiKey] = useState(loadApiKey);
  // 今回の読み込みで支出を自動で作ったレシート（更新の計算の中で記録するので、何度呼ばれても同じになる Set にする）
  const created = useRef(new Set<string>());
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const receipts = data.receipts.filter((r) => r.eventId === event.id);
  const expenses = data.expenses.filter((x) => x.eventId === event.id);
  const unmatched = receipts.filter((r) => r.expenseId === null);
  const linkedExpenses = new Set(receipts.map((r) => r.expenseId));
  const withoutReceipt = expenses.filter((x) => !linkedExpenses.has(x.id));

  const payerOf = (r: Receipt) => findPayer(data, event, r.payerNote);

  const patch = (id: string, change: Partial<Receipt>) =>
    update((d) => ({ ...d, receipts: d.receipts.map((r) => (r.id === id ? { ...r, ...change } : r)) }));

  const read = async (files: File[]) => {
    const problems: string[] = [];
    const known = new Set(data.receipts.map((r) => `${r.fileName}:${r.fileSize}`));
    const todo = files.filter((f) => {
      if (known.has(`${f.name}:${f.size}`)) return false;
      if (!isReadable(f)) problems.push(`${f.name}：読めない形式です（JPEG・PNG・PDF にしてください。iPhone の HEIC は不可）。`);
      return isReadable(f);
    });
    if (files.length > 0 && todo.length === 0 && problems.length === 0) problems.push("選んだレシートはすべて読み込み済みです。");
    created.current = new Set();
    for (const [i, file] of todo.entries()) {
      setProgress(`読み取り中… ${i + 1} / ${todo.length}（${file.name}）`);
      try {
        const reading = await readReceipt(file, apiKey);
        const receipt: Receipt = { id: newId(), eventId: event.id, fileName: file.name, fileSize: file.size, expenseId: null, ...reading };
        // 同じ金額の支出があれば結びつけ、なければ書いてある立て替えた人で支出を作る
        update((d) => {
          const next = createFromReceipt(autoMatch({ ...d, receipts: [...d.receipts, receipt] }, event.id), receipt.id);
          if (next.expenses.length > d.expenses.length) created.current.add(receipt.id);
          return next;
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        problems.push(`${file.name}：${message === "Failed to fetch" ? "通信できませんでした。" : message}`);
        if (message.includes("APIキー") || message.includes("残高")) break;
      }
    }
    setProgress("");
    setErrors(problems);
  };

  return (
    <div className="card no-print">
      <div className="row spread">
        <h3>レシート</h3>
        {receipts.length > 0 && (
          <span className="hint">
            {receipts.length}枚・支出と結びついていない {unmatched.length}枚 / レシートのない支出 {withoutReceipt.length}件
          </span>
        )}
      </div>
      <p className="hint">
        レシートの写真（JPEG・PNG）や PDF をまとめて選ぶと、AI が店名・日付・合計金額を読み取り、同じ金額の支出に自動で結びつけます。
        同じ金額の支出がなくても、レシートに「田中先払い」のように立て替えた人が書いてあれば、その人が立て替えた支出を自動で作ります
        （高速・ガソリンはその人が運転したことになります）。画像はこのアプリには保存されず、読み取った内容だけが残ります。
      </p>

      <details className="api-key" open={!apiKey}>
        <summary>AIの設定（Claude APIキー）{apiKey ? "：設定済み" : "：未設定"}</summary>
        <p className="hint">
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
            Anthropic Console
          </a>
          で作ったAPIキーを貼り付けてください。1枚あたり1円未満が目安です。キーはこのブラウザにだけ保存され、バックアップには含まれません。
          レシートの画像はこのPCから Anthropic に直接送られて読み取られます。
        </p>
        <input
          type="password"
          placeholder="sk-ant-..."
          value={apiKey}
          autoComplete="off"
          onChange={(e) => {
            setApiKey(e.target.value.trim());
            saveApiKey(e.target.value.trim());
          }}
        />
      </details>

      <div className="row">
        <label className={`file-button ${!apiKey || progress ? "disabled" : ""}`}>
          レシートを読み込む
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            disabled={!apiKey || progress !== ""}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              void read(files);
            }}
          />
        </label>
        {progress && <span className="hint">{progress}</span>}
      </div>
      {created.current.size > 0 && !progress && (
        <p className="notice">
          立て替えた人が書いてあったレシート{created.current.size}枚から、支出を作りました。上の「支出」で金額や負担する人を確かめてください。
        </p>
      )}
      {errors.map((e) => (
        <p key={e} className="warning">
          {e}
        </p>
      ))}

      {receipts.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>店・内容</th>
              <th>日付</th>
              <th className="num">金額</th>
              <th>結びつける支出</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => {
              const expense = expenses.find((x) => x.id === r.expenseId);
              return (
                <tr key={r.id} className={expense ? "" : "unmatched"}>
                  <td>
                    {r.store || "（店名不明）"}
                    <div className="hint">
                      {r.summary}
                      {r.summary && " ・ "}
                      {r.fileName}
                    </div>
                    {r.payerNote && (
                      <div className="hint">
                        書き込み：{r.payerNote}
                        {payerOf(r) ? `（→ ${payerOf(r)!.name}）` : "（名簿の誰か決められません）"}
                      </div>
                    )}
                  </td>
                  <td>{r.date || "—"}</td>
                  <td className="num">
                    <input
                      className="amount"
                      inputMode="numeric"
                      value={r.amount ?? ""}
                      placeholder="読めず"
                      onChange={(e) => {
                        const n = Math.round(Number(e.target.value.replace(/[,，¥円\s]/g, "")));
                        patch(r.id, { amount: e.target.value.trim() && Number.isFinite(n) ? n : null });
                      }}
                    />
                  </td>
                  <td>
                    {created.current.has(r.id) && <span className="tag">自動で作成</span>}
                    <select value={r.expenseId ?? ""} onChange={(e) => patch(r.id, { expenseId: e.target.value || null })} className={expense ? "" : "unset"}>
                      <option value="">結びつけない</option>
                      {expenses.map((x) => (
                        <option key={x.id} value={x.id}>
                          {yen(x.amount)} {labelOf(x)}
                          {x.amount === r.amount ? "（金額一致）" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="actions">
                    {!expense && (
                      <button type="button" className="small" onClick={() => onCreateExpense(r)}>
                        支出を作る
                      </button>
                    )}
                    <button
                      type="button"
                      className="danger small"
                      onClick={() => {
                        if (confirm(`${receiptLabel(r)} のレシートを一覧から外しますか？`)) update((d) => ({ ...d, receipts: d.receipts.filter((x) => x.id !== r.id) }));
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {unmatched.some((r) => r.amount !== null) && (
        <button type="button" onClick={() => update((d) => autoMatch(d, event.id))}>
          金額でもう一度照合する
        </button>
      )}
    </div>
  );
}
