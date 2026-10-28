import { CopyButton } from "./CopyButton.tsx";
import { settlementText, yen, type Settlement } from "./settle.ts";

export function SettlementView({
  result,
  title = "精算",
  shareTitle,
  settled,
  onToggleSettled,
}: {
  result: Settlement;
  title?: string;
  /** LINE に貼る文章の見出し */
  shareTitle: string;
  settled?: string[];
  onToggleSettled?: (memberId: string) => void;
}) {
  const hasCollections = result.lines.some((l) => l.collected !== 0);
  // 精算済みの人は載せないので、あとから「まだの人」への催促にも使える
  const open = result.lines.filter((l) => !settled?.includes(l.member.id));
  const text = settlementText(shareTitle, open);

  return (
    <div className="card">
      <h3>{title}</h3>
      {result.warnings.map((w) => (
        <p key={w} className="warning">
          {w}
        </p>
      ))}
      <table className="settlement">
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

      {result.lines.length > 0 && (
        <div className="share no-print">
          <div className="row spread">
            <h4>LINEで知らせる</h4>
            <CopyButton text={text} />
          </div>
          <pre className="share-text">{text}</pre>
          {settled && settled.length > 0 && <p className="hint">精算済みにした人は載せていません。</p>}
        </div>
      )}
    </div>
  );
}
