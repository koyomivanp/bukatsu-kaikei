import { callTool } from "./claude.ts";
import type { Data, Expense, Receipt } from "./types.ts";

/** レシート読み取りに使うモデル。読み取りだけなので安くて速いものにする */
export const RECEIPT_MODEL = "claude-haiku-5-5";

export type ReceiptReading = Pick<Receipt, "store" | "date" | "amount" | "summary">;

const TOOL = {
  name: "record_receipt",
  description: "レシート・領収書から読み取った内容を記録する",
  input_schema: {
    type: "object",
    properties: {
      store: { type: "string", description: "店名・施設名（高速道路なら会社名や区間）。読めなければ空文字" },
      date: { type: "string", description: "日付を YYYY-MM-DD で。読めなければ空文字" },
      amount: { type: ["integer", "null"], description: "支払った合計金額（税込・円）。お預かりやお釣りではない。読めなければ null" },
      summary: { type: "string", description: "何を買ったかの短い要約（15文字程度）。例：ガソリン 30L、飲み物・お菓子" },
    },
    required: ["store", "date", "amount", "summary"],
  },
};

const PROMPT =
  "部活の会計用のレシート（または領収書・高速道路の利用明細）です。record_receipt で内容を記録してください。" +
  "レシートでない画像や読めない場合は、分かる項目だけ埋めて残りは空にしてください。";

/** 長い辺を 1568px までに縮めて JPEG にする（送るデータと料金を減らすため） */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

async function base64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function isReadable(file: File): boolean {
  return file.type === "application/pdf" || /^image\/(jpeg|png|webp|gif)$/.test(file.type);
}

/** レシート1枚を Claude に読ませる */
export async function readReceipt(file: File, apiKey: string): Promise<ReceiptReading> {
  const source =
    file.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: await base64(file) } }
      : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await shrink(file) } };
  const input = await callTool(apiKey, RECEIPT_MODEL, 512, TOOL, [source, { type: "text", text: PROMPT }]);
  const amount = Number(input.amount);
  const date = String(input.date ?? "");
  return {
    store: String(input.store ?? "").trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    amount: input.amount !== null && Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null,
    summary: String(input.summary ?? "").trim(),
  };
}

/**
 * 金額が同じで、まだレシートのない支出に結びつける。
 * 同じ金額の候補が複数あって決められないものは、手で選んでもらうため残す。
 */
export function autoMatch(data: Data, eventId: string): Data {
  const expenses = data.expenses.filter((x) => x.eventId === eventId);
  const taken = new Set(data.receipts.map((r) => r.expenseId).filter((id): id is string => id !== null));
  const free = (amount: number) => expenses.filter((x) => x.amount === amount && !taken.has(x.id));
  const waiting = data.receipts.filter((r) => r.eventId === eventId && r.expenseId === null && r.amount !== null);
  const links = new Map<string, string>();
  for (const r of waiting) {
    const sameAmount = waiting.filter((o) => o.amount === r.amount).length;
    const candidates = free(r.amount!);
    if (sameAmount === 1 && candidates.length === 1) {
      links.set(r.id, candidates[0].id);
      taken.add(candidates[0].id);
    }
  }
  if (links.size === 0) return data;
  return { ...data, receipts: data.receipts.map((r) => (links.has(r.id) ? { ...r, expenseId: links.get(r.id)! } : r)) };
}

export function receiptsOf(data: Data, expense: Expense): Receipt[] {
  return data.receipts.filter((r) => r.expenseId === expense.id);
}

/** 例：ENEOS 8/1 */
export function receiptLabel(r: Receipt): string {
  const date = r.date ? ` ${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8, 10))}` : "";
  return `${r.store || r.fileName}${date}`;
}
