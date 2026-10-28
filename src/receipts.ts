import { participantsOf } from "./settle.ts";
import { newId, withDriver } from "./store.ts";
import { CATEGORIES, isActive, isTravel, type Category, type ClubEvent, type Data, type Expense, type Member, type Receipt, type Trip } from "./types.ts";

/** レシート読み取りに使うモデル。読み取りだけなので安くて速いものにする */
export const RECEIPT_MODEL = "claude-haiku-5-5";

const KEY_STORAGE = "bukatsu-kaikei:api-key";

/** APIキーはバックアップに含めないよう、会計データとは別に保存する */
export function loadApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // 保存できなくても、開いている間は使える
  }
}

export type ReceiptReading = Pick<Receipt, "store" | "date" | "amount" | "summary" | "category" | "payerNote">;

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
      category: {
        type: "string",
        enum: CATEGORIES,
        description: "高速道路・有料道路の料金なら「高速」、ガソリンスタンドでの給油なら「ガソリン」、それ以外は「雑費」",
      },
      payer: {
        type: "string",
        description:
          "レシートの余白・裏・付箋などに手書きや印字で「田中先払い」「田中立替」「田中払い」のように、印刷された店の情報とは別に書き込まれた立て替えた人の名前。" +
          "名前の部分だけ（例：田中）。書き込みがなければ空文字。店員名やカード名義は含めない",
      },
    },
    required: ["store", "date", "amount", "summary", "category", "payer"],
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

/** レシート1枚を Claude に読ませる。APIキーはこのPCのブラウザから Anthropic に直接送られる。 */
export async function readReceipt(file: File, apiKey: string): Promise<ReceiptReading> {
  const source =
    file.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: await base64(file) } }
      : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await shrink(file) } };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: RECEIPT_MODEL,
      max_tokens: 512,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: [source, { type: "text", text: PROMPT }] }],
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("APIキーが正しくありません。");
    if (res.status === 429) throw new Error("短い時間に送りすぎました。少し待ってからもう一度読み込んでください。");
    if (res.status === 400 && (await res.text()).includes("credit")) throw new Error("APIの残高が足りません。");
    throw new Error(`読み取りに失敗しました（${res.status}）。`);
  }
  const json = (await res.json()) as { content: { type: string; input?: Record<string, unknown> }[] };
  const input = json.content.find((c) => c.type === "tool_use")?.input ?? {};
  const amount = Number(input.amount);
  const date = String(input.date ?? "");
  return {
    store: String(input.store ?? "").trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    amount: input.amount !== null && Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null,
    summary: String(input.summary ?? "").trim(),
    category: CATEGORIES.find((c) => c === input.category) ?? "雑費",
    payerNote: cleanName(String(input.payer ?? "")),
  };
}

const squash = (s: string) => s.replace(/[\s　・]/g, "");

/** 「田中先輩 先払い」のような書き込みから、名前の部分だけ残す */
export function cleanName(note: string): string {
  return squash(note)
    .replace(/(先払い|先払|立て替え|立替え|立替|建て替え|建替|払い|払|より|から|分)$/, "")
    .replace(/(さん|先輩|くん|君|ちゃん)$/, "");
}

/**
 * 書かれた名前に合う部員。名字だけ・名前だけでもよい。
 * 会計の参加者 → 在籍中の部員の順に探し、1人に決まったときだけ返す。
 */
export function findPayer(data: Data, event: ClubEvent, note: string): Member | null {
  const name = cleanName(note);
  if (!name) return null;
  for (const pool of [participantsOf(data, event), data.members.filter(isActive)]) {
    const exact = pool.filter((m) => squash(m.name) === name);
    if (exact.length === 1) return exact[0];
    const part = pool.filter((m) => squash(m.name).startsWith(name) || squash(m.name).endsWith(name));
    if (part.length === 1) return part[0];
    if (exact.length + part.length > 1) return null;
  }
  return null;
}

/** 立て替えた人が運転した車。運転手 → 乗った人 → 車が1つだけ、の順に、1つに決まれば返す */
function tripOf(event: ClubEvent, memberId: string | null): Trip | null {
  if (memberId) {
    const drove = event.trips.filter((t) => t.driverIds.includes(memberId));
    if (drove.length === 1) return drove[0];
    const rode = event.trips.filter((t) => t.riderIds.includes(memberId));
    if (drove.length === 0 && rode.length === 1) return rode[0];
  }
  return event.trips.length === 1 ? event.trips[0] : null;
}

/** レシートから作る支出の下書き。高速・ガソリンは立て替えた人が運転したものとする */
export function draftFromReceipt(data: Data, event: ClubEvent, receipt: Receipt): Expense {
  const payer = findPayer(data, event, receipt.payerNote);
  const category: Category = isTravel(receipt.category) && event.trips.length > 0 ? receipt.category : "雑費";
  const travel = isTravel(category);
  const trip = travel ? (tripOf(event, payer?.id ?? null) ?? event.trips[0]) : null;
  return {
    id: newId(),
    eventId: event.id,
    category,
    tripId: trip?.id ?? null,
    driverId: travel ? (payer?.id ?? null) : null,
    title: travel ? "" : receipt.summary,
    amount: receipt.amount ?? 0,
    payerId: payer?.id ?? null,
    burden: { mode: "all" },
    note: receipt.store,
  };
}

/**
 * 立て替えた人が書いてあり、どの支出とも結びつかなかったレシートから、支出を作って結びつける。
 * 金額が読めない・名前が1人に決まらない・どの車か決まらないものは、手で作ってもらうため残す。
 */
export function createFromReceipt(data: Data, receiptId: string): Data {
  const receipt = data.receipts.find((r) => r.id === receiptId);
  const event = data.events.find((e) => e.id === receipt?.eventId);
  if (!receipt || !event || receipt.expenseId !== null || receipt.amount === null || !receipt.payerNote) return data;
  const expense = draftFromReceipt(data, event, receipt);
  if (expense.payerId === null) return data;
  if (isTravel(expense.category) && tripOf(event, expense.payerId) === null) return data;
  return {
    ...data,
    events: data.events.map((e) => withDriver(e, expense)),
    expenses: [...data.expenses, expense],
    receipts: data.receipts.map((r) => (r.id === receipt.id ? { ...r, expenseId: expense.id } : r)),
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
