import { normalize } from "./store.ts";
import type { Data } from "./types.ts";

export function Backup({ data, replace }: { data: Data; replace: (data: Data) => void }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `部活会計_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <h2>バックアップ</h2>
      <div className="card">
        <p>
          データはこのPCのブラウザの中だけに保存されています。ブラウザの履歴やサイトデータを消すと、データも消えます。
          <strong>会計を締めるたびに書き出しておく</strong>のがおすすめです。
        </p>
        <button type="button" className="primary" onClick={download}>
          バックアップを書き出す
        </button>
      </div>
      <div className="card">
        <h3>バックアップから復元</h3>
        <p className="hint">今のデータは、選んだファイルの内容で置き換わります。</p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const parsed = JSON.parse(await file.text());
              if (!Array.isArray(parsed.members) || !Array.isArray(parsed.expenses)) throw new Error();
              if (!confirm(`部員 ${parsed.members.length}人・支出 ${parsed.expenses.length}件 のデータで置き換えますか？`)) return;
              replace(normalize(parsed));
              alert("復元しました。");
            } catch {
              alert("このファイルは読み込めませんでした。");
            }
          }}
        />
      </div>
    </section>
  );
}
