import { SettlementView } from "./SettlementView.tsx";
import { settle, yen } from "./settle.ts";
import { ANNUAL, type Data } from "./types.ts";

export function Summary({ data }: { data: Data }) {
  const events = [...data.events].sort((a, b) => (a.id === ANNUAL ? -1 : b.id === ANNUAL ? 1 : 0));
  const results = events.map((e) => ({ event: e, result: settle(data, [e.id]) }));
  const all = settle(data, events.map((e) => e.id));
  const unsettledNet = (memberId: string) =>
    results.reduce((sum, { event, result }) => {
      if (data.settled[event.id]?.includes(memberId)) return sum;
      return sum + (result.lines.find((l) => l.member.id === memberId)?.net ?? 0);
    }, 0);

  return (
    <section>
      <div className="row spread">
        <h2>全期間の集計</h2>
        <button type="button" className="no-print" onClick={() => window.print()}>
          印刷 / PDFで保存
        </button>
      </div>

      <div className="card">
        <h3>会計ごとの支出</h3>
        <table>
          <thead>
            <tr>
              <th>会計</th>
              <th className="num">支出</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ event, result }) => (
              <tr key={event.id}>
                <td>{event.name}</td>
                <td className="num">{yen(result.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>合計</td>
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

      <SettlementView data={data} result={all} title="全期間をまとめて精算する場合" />
    </section>
  );
}
