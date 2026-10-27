import { useState } from "react";
import { autoMatch, isReadable, loadApiKey, readReceipt, receiptLabel, saveApiKey } from "./receipts.ts";
import { labelOf, yen } from "./settle.ts";
import { newId, type Update } from "./store.ts";
import type { ClubEvent, Data, Receipt } from "./types.ts";

export function Receipts({ data, update, event }: { data: Data; update: Update; event: ClubEvent }) {
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const receipts = data.receipts.filter((r) => r.eventId === event.id);
  const expenses = data.expenses.filter((x) => x.eventId === event.id);
  const unmatched = receipts.filter((r) => r.expenseId === null);
  const linkedExpenses = new Set(receipts.map((r) => r.expenseId));
  const withoutReceipt = expenses.filter((x) => !linkedExpenses.has(x.id));

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
    for (const [i, file] of todo.entries()) {
      setProgress(`読み取り中… ${i + 1} / ${todo.length}（${file.name}）`);
      try {
        const reading = await readReceipt(file, apiKey);
        const receipt: Receipt = { id: newId(), eventId: event.id, fileName: file.name, fileSize: file.size, expenseId: null, ...reading };
        update((d) => autoMatch({ ...d, receipts: [...d.receipts, receipt] }, event.id));
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
        画像はこのアプリには保存されず、読み取った内容だけが残ります。
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
                  <td>
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
