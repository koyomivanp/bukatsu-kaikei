import { CLUB, yen, type Settlement } from "./settle.ts";
import type { Data } from "./types.ts";

export function SettlementView({
  data,
  result,
  title = "精算",
  settled,
  onToggleSettled,
}: {
  data: Data;
  result: Settlement;
  title?: string;
  settled?: string[];
  onToggleSettled?: (memberId: string) => void;
}) {
  const nameOf = (id: string) => (id === CLUB ? "部費（会計）" : (data.members.find((m) => m.id === id)?.name ?? "（削除済み）"));

  return (
    <div className="card">
      <h3>{title}</h3>
      {result.warnings.map((w) => (
        <p key={w} className="warning">
          {w}
        </p>
      ))}
      <table>
        <thead>
          <tr>
            <th>名前</th>
            <th className="num">負担額</th>
            <th className="num">立て替え</th>
            <th className="num">差し引き</th>
            {onToggleSettled && <th>精算済み</th>}
          </tr>
        </thead>
        <tbody>
          {result.lines.map((l) => (
            <tr key={l.member.id} className={settled?.includes(l.member.id) ? "done" : ""}>
              <td>{l.member.name}</td>
              <td className="num">{yen(l.owed)}</td>
              <td className="num">{yen(l.paid)}</td>
              <td className={`num ${l.net < 0 ? "pay" : l.net > 0 ? "get" : ""}`}>
                {l.net < 0 ? `${yen(-l.net)} 払う` : l.net > 0 ? `${yen(l.net)} 受け取る` : "±0"}
              </td>
              {onToggleSettled && (
                <td>
                  <input type="checkbox" checked={settled?.includes(l.member.id) ?? false} onChange={() => onToggleSettled(l.member.id)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>部費（会計）</td>
            <td className="num">—</td>
            <td className="num">{yen(result.clubPaid)}</td>
            <td className={`num ${result.clubNet > 0 ? "get" : result.clubNet < 0 ? "pay" : ""}`}>
              {result.clubNet > 0 ? `${yen(result.clubNet)} 集める` : result.clubNet < 0 ? `${yen(-result.clubNet)} 払う` : "±0"}
            </td>
            {onToggleSettled && <td />}
          </tr>
        </tfoot>
      </table>
      <p className="hint">割り切れない端数は、名簿の順に1円ずつ上乗せしています。</p>

      {result.transfers.length > 0 && (
        <>
          <h4>お金の受け渡し（最少回数）</h4>
          <ul className="transfers">
            {result.transfers.map((t, i) => (
              <li key={i}>
                {nameOf(t.from)} → {nameOf(t.to)}　<strong>{yen(t.amount)}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
