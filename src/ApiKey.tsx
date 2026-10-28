import { saveApiKey } from "./claude.ts";

/** メッセージの読み取り・レシートの読み取りで共通の、Claude APIキーの設定欄 */
export function ApiKeyField({ apiKey, onChange }: { apiKey: string; onChange: (key: string) => void }) {
  return (
    <details className="api-key" open={!apiKey}>
      <summary>AIの設定（Claude APIキー）{apiKey ? "：設定済み" : "：未設定"}</summary>
      <p className="hint">
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          Anthropic Console
        </a>
        で作ったAPIキーを貼り付けてください。1回あたり数円以下が目安です。キーはこのブラウザにだけ保存され、バックアップには含まれません。
        貼り付けた文章やレシートの画像は、このPCから Anthropic に直接送られて読み取られます。
      </p>
      <input
        type="password"
        placeholder="sk-ant-..."
        value={apiKey}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value.trim());
          saveApiKey(e.target.value.trim());
        }}
      />
    </details>
  );
}
