import { useState } from "react";
import { SettlementView } from "./SettlementView.tsx";
import { settle, yen } from "./settle.ts";
import { ANNUAL, type Data } from "./types.ts";

export function Summary({ data }: { data: Data }) {
  const events = [...data.events].sort((a, b) => (a.id === ANNUAL ? -1 : b.id === ANNUAL ? 1 : 0));
  // 通年は事前に集金して年度末に余りを返す使い方が多いので、最初は外しておく
  const [excluded, setExcluded] = useState<string[]>([ANNUAL]);
  const selected = events.filter((e) => !excluded.includes(e.id));
  const results = events.map((e) => ({ event: e, result: settle(data, [e.id]) }));
  const chosen = results.filter(({ event }) => !excluded.includes(event.id));
  const all = settle(data, selected.map((e) => e.id));
  const toggle = (id: string) => setExcluded(excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id]);
  const unsettledNet = (memberId: string) =>
    chosen.reduce((sum, { event, result }) => {
      if (data.settled[event.id]?.includes(memberId)) return sum;
      return sum + (result.lines.find((l) => l.member.id === memberId)?.net ?? 0);
    }, 0);

  return (
    <section>
      <div className="row spread">
        <h2>まとめて集計</h2>
        <button type="button" className="no-print" onClick={() => window.print()}>
          印刷 / PDFで保存
        </button>
      </div>

      <div className="card">
        <h3>会計ごとの支出</h3>
        <p className="hint no-print">チェックした会計だけをまとめて集計します。</p>
        <table>
          <thead>
            <tr>
              <th className="no-print">集計</th>
              <th>会計</th>
              <th className="num">支出</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ event, result }) => (
              <tr key={event.id} className={excluded.includes(event.id) ? "muted print-hide" : ""}>
                <td className="no-print">
                  <input type="checkbox" checked={!excluded.includes(event.id)} onChange={() => toggle(event.id)} aria-label={`${event.name}を集計に入れる`} />
                </td>
                <td>{event.name}</td>
                <td className="num">{yen(result.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="no-print" />
              <td>選んだ会計の合計</td>
              <td className="num">{yen(all.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card">
        <h3>まだ精算していない分</h3>
        <p className="hint">各会計で「精算済み」にしていない分だけを合計しています。</p>
        <table>
          <thead>
            <tr>
              <th>名前</th>
              <th className="num">未精算</th>
            </tr>
          </thead>
          <tbody>
            {all.lines
              .map((l) => ({ member: l.member, net: unsettledNet(l.member.id) }))
              .filter((x) => x.net !== 0)
              .map(({ member, net }) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td className={`num ${net < 0 ? "pay" : "get"}`}>{net < 0 ? `${yen(-net)} 払う` : `${yen(net)} 受け取る`}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <SettlementView
        result={all}
        title={`まとめて精算する場合（${selected.map((e) => e.name).join("・") || "会計を選んでください"}）`}
        shareTitle={`${selected.map((e) => e.name).join("・")}の精算`}
      />
    </section>
  );
}
