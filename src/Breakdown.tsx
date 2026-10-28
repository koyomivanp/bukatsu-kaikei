import { useState } from "react";
import { breakdownOf, breakdownText, perPersonText } from "./breakdown.ts";
import { CopyButton } from "./CopyButton.tsx";
import { settle, yen } from "./settle.ts";
import { isTravel, type Data } from "./types.ts";

/** この内訳だけを印刷する（ほかのカードは印刷のあいだだけ隠す） */
function printOnlyBreakdown() {
  document.body.classList.add("print-breakdown");
  const done = () => {
    document.body.classList.remove("print-breakdown");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

/** 部員に「どんな支出があったか」を説明するための、選んだ会計の支出の内訳 */
export function Breakdown({ data, eventIds }: { data: Data; eventIds: string[] }) {
  const [withPeople, setWithPeople] = useState(true);
  const [showText, setShowText] = useState(false);
  const list = breakdownOf(data, eventIds);
  const people = settle(data, eventIds).lines.filter((l) => l.owed > 0);
  const text = breakdownText(data, eventIds, withPeople);

  return (
    <div className="card breakdown">
      <div className="row spread">
        <h3>支出の内訳（部員への説明用）</h3>
        {list.length > 0 && (
          <div className="row no-print">
            <CopyButton text={text} />
            <button type="button" onClick={printOnlyBreakdown}>
              内訳だけ印刷 / PDF
            </button>
          </div>
        )}
      </div>
      {list.length === 0 && <p className="empty">上で会計を選んでください。</p>}
      {list.length > 0 && (
        <>
          <p className="hint no-print">
            上でチェックした会計の支出を、何にいくら使い、誰が立て替えて、何人で割ったかの形で書き出します。LINE に貼るか、PDF にして共有してください。
          </p>
          <label className="check no-print">
            <input type="checkbox" checked={withPeople} onChange={(e) => setWithPeople(e.target.checked)} />
            一人ずつの負担額も載せる
          </label>
        </>
      )}

      {list.map(({ event, total, rows, collections }) => (
        <div key={event.id} className="breakdown-event">
          <h4>
            {event.name}
            <span className="hint">
              支出 {rows.length}件・合計 {yen(total)}
            </span>
          </h4>
          {rows.length === 0 ? (
            <p className="hint">支出はありません。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>費目</th>
                  <th>内容</th>
                  <th className="num">金額</th>
                  <th>立て替え</th>
                  <th>負担する人</th>
                  <th className="num">1人あたり</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.expense.id}>
                    <td>
                      <span className={`tag ${isTravel(r.expense.category) ? "travel" : ""}`}>{r.expense.category}</span>
                    </td>
                    <td>{r.expense.title || "—"}</td>
                    <td className="num">{yen(r.expense.amount)}</td>
                    <td>{r.payer}</td>
                    {r.excluded ? (
                      <td colSpan={2} className="caution">
                        立て替えた人か負担する人が決まっていないため、精算に入っていません
                      </td>
                    ) : (
                      <>
                        <td>
                          {r.who}（{r.count}人）
                        </td>
                        <td className="num">{perPersonText(r)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {collections.map((c) => (
            <p key={c.id} className="hint">
              {c.kind}
              {c.note && `（${c.note}）`}：1人 {yen(c.perPerson)} × {c.memberIds.length}人
            </p>
          ))}
        </div>
      ))}

      {withPeople && people.length > 0 && (
        <div className="breakdown-event">
          <h4>一人ずつの負担額（上の支出の合計）</h4>
          <table className="settlement">
            <tbody>
              {people.map((l) => (
                <tr key={l.member.id}>
                  <td>{l.member.name}</td>
                  <td className="num">{yen(l.owed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.length > 0 && (
        <div className="no-print">
          <button type="button" className="link" onClick={() => setShowText(!showText)}>
            {showText ? "LINE用の文章を閉じる" : "LINE用の文章を見る"}
          </button>
          {showText && <pre className="share-text">{text}</pre>}
        </div>
      )}
    </div>
  );
}
