import { callTool } from "./claude.ts";
import { findMember, tripOf } from "./names.ts";
import { newId } from "./store.ts";
import { CATEGORIES, isTravel, type Category, type ClubEvent, type Data, type Expense } from "./types.ts";

/** メッセージの読み取りに使うモデル。お金の話なので、言い回しの読み違いが少ないものにする */
export const MESSAGE_MODEL = "claude-sonnet-5-5";

/** AIが読み取った支出1件。名前は書かれたまま（名簿との照合はこのアプリでする） */
export type MessageItem = {
  /** メッセージを送った人の表示名。分からなければ空 */
  sender: string;
  category: Category;
  /** 高速・ガソリンで、運転した人（「高宮車」なら高宮）。書かれていなければ空 */
  driver: string;
  /** 「〇〇払い」のように、立て替えた人がはっきり書かれていればその名前 */
  payer: string;
  amount: number | null;
  title: string;
  /** 元のメッセージ（確認用） */
  quote: string;
};

const TOOL = {
  name: "record_expenses",
  description: "メッセージに書かれた、部員が立て替えた支出を記録する",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sender: { type: "string", description: "そのメッセージを送った人の表示名。文章から分からなければ空文字" },
            category: {
              type: "string",
              enum: CATEGORIES,
              description: "高速道路・有料道路・ETCの料金なら「高速」、ガソリン・給油なら「ガソリン」、それ以外は「雑費」",
            },
            driver: { type: "string", description: "高速・ガソリンで運転した人の名前（「高宮車」なら「高宮」）。書かれていなければ空文字。雑費では空文字" },
            payer: { type: "string", description: "「田中払い」「田中が立て替え」のように、払った人がはっきり書かれていればその名前だけ。なければ空文字" },
            amount: { type: ["integer", "null"], description: "金額（円の整数。「2千円」は 2000）。分からなければ null" },
            title: { type: "string", description: "何のお金かの短い言葉（例：花火、差し入れ、BBQの肉）。高速・ガソリンは空文字でよい" },
            quote: { type: "string", description: "根拠になった元の文章を、そのまま短く（1行程度）" },
          },
          required: ["sender", "category", "driver", "payer", "amount", "title", "quote"],
        },
      },
    },
    required: ["items"],
  },
};

const PROMPT = `大学の部活の会計係です。部員が立て替えたお金を、LINE のトークやノートに書いてもらっています。
次の文章はそれをコピーしたものです。立て替えた支出を1件ずつ record_expenses で記録してください。

- 「高宮車 高速 2000円」のような「〇〇車」は、〇〇が運転した車の意味です（driver に〇〇）
- 雑談・お礼・質問・「了解」などの返事は記録しないでください
- 訂正（「さっきの2000円じゃなくて2100円」）があれば訂正後の内容だけを、取り消されたものは記録しないでください
- 同じ支出が何度か書かれていたら（貼り付けの重なりなど）1件にしてください
- 名前は書かれたままにしてください（推測で補ったり、フルネームに直したりしない）

<文章>
`;

/** 貼り付けた文章を Claude に読ませる */
export async function readMessages(text: string, apiKey: string): Promise<MessageItem[]> {
  const input = await callTool(apiKey, MESSAGE_MODEL, 4096, TOOL, [{ type: "text", text: `${PROMPT}${text}\n</文章>` }]);
  const items = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
  const str = (v: unknown) => String(v ?? "").trim();
  return items.map((i) => {
    const amount = Number(i.amount);
    return {
      sender: str(i.sender),
      category: CATEGORIES.find((c) => c === i.category) ?? "雑費",
      driver: str(i.driver),
      payer: str(i.payer),
      amount: i.amount !== null && Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null,
      title: str(i.title),
      quote: str(i.quote),
    };
  });
}

/** 確認画面の1行。名簿の誰か決まらないところは null のまま、手で選んでもらう */
export type MessageRow = {
  id: string;
  item: MessageItem;
  category: Category;
  amount: number | null;
  tripId: string | null;
  driverId: string | null;
  payerId: string | null;
  title: string;
  /** すでに同じ支出（費目・金額・立て替えた人）があるか、上の行と同じ */
  duplicate: boolean;
  include: boolean;
};

/**
 * 読み取った支出を、名簿・車と照らし合わせて確認画面の行にする。
 * 立て替えた人は、はっきり書かれていればその人、なければ高速・ガソリンは運転した人、雑費は送った人。
 * 高速・ガソリンで運転した人が書かれていなければ、立て替えた人（送った人）が運転したものとする。
 */
export function rowsFromMessages(data: Data, event: ClubEvent, items: MessageItem[]): MessageRow[] {
  const rows: MessageRow[] = [];
  for (const item of items) {
    // 車のない会計（通年）では、高速・ガソリンも雑費として扱う
    const category = isTravel(item.category) && event.trips.length > 0 ? item.category : "雑費";
    const travel = isTravel(category);
    const sender = findMember(data, event, item.sender);
    const named = item.payer ? findMember(data, event, item.payer) : null;
    const driver = travel ? (item.driver ? findMember(data, event, item.driver) : item.payer ? named : sender) : null;
    const payerId = item.payer ? (named?.id ?? null) : ((travel ? driver : sender)?.id ?? null);
    const row: MessageRow = {
      id: newId(),
      item,
      category,
      amount: item.amount,
      tripId: travel ? (tripOf(event, driver?.id ?? null)?.id ?? null) : null,
      driverId: driver?.id ?? null,
      payerId,
      title: item.title,
      duplicate: false,
      include: false,
    };
    const same = (x: { category: Category; amount: number | null; payerId: string | null }) =>
      x.category === row.category && x.amount === row.amount && x.payerId === row.payerId;
    row.duplicate = data.expenses.some((x) => x.eventId === event.id && same(x)) || rows.some(same);
    row.include = isComplete(row) && !row.duplicate;
    rows.push(row);
  }
  return rows;
}

/** 支出にするのに足りないもの。なければ空 */
export function missingOf(row: MessageRow): string[] {
  const out: string[] = [];
  if (!row.amount || row.amount <= 0) out.push("金額");
  if (isTravel(row.category) && (!row.driverId || !row.tripId)) out.push("運転した人");
  if (!row.payerId) out.push("立て替えた人");
  return out;
}

export const isComplete = (row: MessageRow) => missingOf(row).length === 0;

export function expenseFromRow(event: ClubEvent, row: MessageRow): Expense {
  const travel = isTravel(row.category);
  return {
    id: newId(),
    eventId: event.id,
    category: row.category,
    tripId: travel ? row.tripId : null,
    driverId: travel ? row.driverId : null,
    title: row.title,
    amount: row.amount ?? 0,
    payerId: row.payerId,
    burden: { mode: "all" },
    note: row.item.quote.length > 60 ? `${row.item.quote.slice(0, 60)}…` : row.item.quote,
  };
}
