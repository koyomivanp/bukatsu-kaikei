import { yen, type Settlement } from "./settle.ts";
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
  const hasCollections = result.lines.some((l) => l.collected !== 0);
  const nameOf = (id: string) => data.members.find((m) => m.id === id)?.name ?? "（削除済み）";

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
            {hasCollections && <th className="num">集金・返金</th>}
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
              {hasCollections && <td className="num">{l.collected === 0 ? "—" : l.collected > 0 ? `${yen(l.collected)} 払済` : `${yen(-l.collected)} 預かり`}</td>}
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
      </table>
      <p className="hint">
        割り切れない端数は、名簿の順に1円ずつ上乗せしています。
        {hasCollections && "「集金・返金」は、集金で払った分を「払済」、集めたお金を持っている分（返金した分を除く）を「預かり」としています。"}
      </p>

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
