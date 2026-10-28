import { normalize, type Backup as BackupState } from "./store.ts";
import type { Data } from "./types.ts";

export function downloadBackup(data: Data, backup: BackupState) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `部活会計_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  backup.saved(true);
}

const dateText = (time: number) => new Date(time).toLocaleDateString("ja-JP");
export const daysSince = (time: number) => Math.floor((Date.now() - time) / 86_400_000);

/** 書き出していない変更がこの日数より前からあれば、画面の上で知らせる */
export const REMIND_AFTER_DAYS = 3;

/** 全画面の上に出す、バックアップ忘れのお知らせ */
export function BackupReminder({ data, backup }: { data: Data; backup: BackupState }) {
  if (backup.unsavedSince === null || daysSince(backup.unsavedSince) < REMIND_AFTER_DAYS) return null;
  return (
    <div className="reminder no-print">
      <span>
        {backup.lastBackup === null ? "まだ一度もバックアップを書き出していません。" : `最後のバックアップから${daysSince(backup.lastBackup)}日たち、その後の変更が保存されていません。`}
        データはこのブラウザの中にしかないので、閲覧データを消すと記録も消えます。
      </span>
      <button type="button" className="primary small" onClick={() => downloadBackup(data, backup)}>
        バックアップを書き出す
      </button>
    </div>
  );
}

export function Backup({ data, replace, backup }: { data: Data; replace: (data: Data) => void; backup: BackupState }) {

  return (
    <section>
      <h2>バックアップ</h2>
      <div className="card">
        <p>
          データはこのPCのブラウザの中だけに保存されています。ブラウザの履歴やサイトデータを消すと、データも消えます。
          <strong>会計を締めるたびに書き出しておく</strong>のがおすすめです。
        </p>
        <p className="hint">
          前回の書き出し：{backup.lastBackup === null ? "まだありません" : dateText(backup.lastBackup)}
          {backup.unsavedSince !== null && `（${dateText(backup.unsavedSince)}以降の変更は、まだ書き出していません）`}
        </p>
        <button type="button" className="primary" onClick={() => downloadBackup(data, backup)}>
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
              backup.saved(false);
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
