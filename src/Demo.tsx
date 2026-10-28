import { sampleData } from "./sample.ts";
import { emptyData } from "./store.ts";
import type { Data } from "./types.ts";

const DEMO_KEY = "bukatsu-kaikei:demo";

/** サンプルデータを表示中かどうか。会計データとは別に保存する */
export function loadDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveDemo(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_KEY, "1");
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    // 保存できなくても、開いている間は使える
  }
}

/** まだ何も入っていないときの案内。サンプルデータで中身を見てから始められる */
export function DemoWelcome({ onLoad }: { onLoad: (data: Data) => void }) {
  return (
    <div className="card welcome no-print">
      <h3>はじめに</h3>
      <p>
        部活の立て替えと割り勘を精算するアプリです。まず「名簿」タブで部員を登録し、ここで会計（合宿・遠征など）を作って支出を入力します。
      </p>
      <p className="hint">どんな画面か先に見たいときは、架空の部活のサンプルデータで試せます。あとで消してから使い始められます。</p>
      <button type="button" className="primary" onClick={() => onLoad(sampleData())}>
        サンプルデータで試す
      </button>
    </div>
  );
}

/** サンプルを表示しているあいだ、画面の上に出す */
export function DemoBanner({ onClear }: { onClear: (data: Data) => void }) {
  return (
    <div className="reminder demo no-print">
      <span>サンプルデータ（架空の部活）を表示しています。自由に触って試せます。</span>
      <button
        type="button"
        className="small"
        onClick={() => {
          if (confirm("サンプルデータを消して、空の状態から始めますか？")) onClear(emptyData());
        }}
      >
        サンプルを消して始める
      </button>
    </div>
  );
}
