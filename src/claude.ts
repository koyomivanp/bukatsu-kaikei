/** Claude API の呼び出し。APIキーはこのPCのブラウザから Anthropic に直接送られる。 */

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

export type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

/** 決まった形（tool）で答えさせ、その入力をそのまま返す */
export async function callTool(apiKey: string, model: string, maxTokens: number, tool: Tool, content: unknown[]): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content }],
    }),
  }).catch(() => {
    throw new Error("通信できませんでした。");
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("APIキーが正しくありません。");
    if (res.status === 429) throw new Error("短い時間に送りすぎました。少し待ってからもう一度試してください。");
    if (res.status === 400 && (await res.text()).includes("credit")) throw new Error("APIの残高が足りません。");
    throw new Error(`読み取りに失敗しました（${res.status}）。`);
  }
  const json = (await res.json()) as { content: { type: string; input?: Record<string, unknown> }[] };
  return json.content.find((c) => c.type === "tool_use")?.input ?? {};
}
