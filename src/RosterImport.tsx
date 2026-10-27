import { useState } from "react";
import { applyImport, defaultMissingChoice, parseRoster, planImport, type MissingChoice, type RosterPlan } from "./roster.ts";
import { newId, type Update } from "./store.ts";
import { FILTER_GENDERS, GENDERS, isActive, type Data, type Gender } from "./types.ts";

const MISSING_CHOICES: MissingChoice[] = ["OB", "退部", "そのまま"];

export function RosterImport({ data, update }: { data: Data; update: Update }) {
  const [plan, setPlan] = useState<RosterPlan | null>(null);
  const [source, setSource] = useState("");
  const [genders, setGenders] = useState<Record<number, Gender>>({});
  const [missingChoices, setMissingChoices] = useState<Record<string, MissingChoice>>({});
  const [error, setError] = useState("");

  const read = async (file: File) => {
    setError("");
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const parsed = parseRoster((await readXlsxFile(file)) as never);
      if (!parsed) {
        setError("「部員名簿」のシート（学年・氏名の列）が見つかりませんでした。");
        return;
      }
      setPlan(planImport(data.members, parsed.rows));
      setSource(`${file.name}（${parsed.sheet}・${parsed.rows.length}人）`);
      setGenders({});
      setMissingChoices({});
    } catch {
      setError("このファイルは読み込めませんでした。継続届の .xlsx を選んでください。");
    }
  };

  const close = () => {
    setPlan(null);
    setSource("");
  };

  return (
    <div className="card">
      <h3>継続届から読み込む</h3>
      <p className="hint">
        毎年の継続届（.xlsx）の「部員名簿」から、名前・学年・学籍番号を読み込みます。学籍番号で同じ人を見分けるので、
        翌年に読み込むと学年だけ更新され、設定した性別はそのまま残ります。
      </p>
      {!plan && (
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void read(file);
          }}
        />
      )}
      {error && <p className="warning">{error}</p>}

      {plan && (
        <div className="import-plan">
          <p>
            <strong>{source}</strong>
          </p>

          <h4>新しく追加する人（{plan.added.length}人）</h4>
          {plan.added.length === 0 ? (
            <p className="hint">いません。</p>
          ) : (
            <>
              <p className="hint">継続届には性別がないので、ここで選んでください。あとから名簿でも変えられます。</p>
              <div className="row">
                <span className="hint">まとめて：</span>
                {FILTER_GENDERS.map((g) => (
                  <button key={g} type="button" className="small" onClick={() => setGenders(Object.fromEntries(plan.added.map((_, i) => [i, g])))}>
                    全員を{g}にする
                  </button>
                ))}
                <span className="hint">（多いほうに揃えてから、違う人だけ直すと早いです）</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>学籍番号</th>
                    <th>名前</th>
                    <th>学年</th>
                    <th>学部</th>
                    <th>性別</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.added.map((row, i) => (
                    <tr key={`${row.studentId}-${i}`}>
                      <td>{row.studentId}</td>
                      <td>{row.name}</td>
                      <td>{row.grade}年</td>
                      <td>{row.faculty}</td>
                      <td>
                        <div className="segmented small">
                          {GENDERS.map((g) => (
                            <button
                              key={g}
                              type="button"
                              className={(genders[i] ?? "未設定") === g ? "on" : ""}
                              onClick={() => setGenders({ ...genders, [i]: g })}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h4>情報が変わる人（{plan.updated.length}人）</h4>
          {plan.updated.length === 0 ? (
            <p className="hint">いません。</p>
          ) : (
            <ul className="changes">
              {plan.updated.map(({ member, row }) => (
                <li key={member.id}>
                  {member.name}
                  {member.name !== row.name && ` → ${row.name}`}
                  {member.grade !== row.grade && `：${member.grade}年 → ${row.grade}年`}
                  {!isActive(member) && `：${member.status} → 在籍`}
                  {row.studentId && member.studentId !== row.studentId && "（学籍番号を登録）"}
                </li>
              ))}
            </ul>
          )}
          {plan.unchanged.length > 0 && <p className="hint">変わらない人：{plan.unchanged.length}人</p>}

          <h4>継続届にいない人（{plan.missing.length}人）</h4>
          {plan.missing.length === 0 ? (
            <p className="hint">いません。</p>
          ) : (
            <>
              <p className="hint">卒業・引退した人は「OB」、やめた人は「退部」に。どちらも新しい会計の対象から外れますが、過去の会計の記録は残ります。</p>
              <table>
                <tbody>
                  {plan.missing.map((m) => {
                    const choice = missingChoices[m.id] ?? defaultMissingChoice(m);
                    return (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{m.grade}年</td>
                        <td>
                          <div className="segmented small">
                            {MISSING_CHOICES.map((c) => (
                              <button
                                key={c}
                                type="button"
                                className={choice === c ? "on" : ""}
                                onClick={() => setMissingChoices({ ...missingChoices, [m.id]: c })}
                              >
                                {c === "そのまま" ? "在籍のまま" : c}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="primary"
              onClick={() => {
                update((d) => ({ ...d, members: applyImport(d.members, plan, genders, missingChoices, newId) }));
                close();
              }}
            >
              名簿に反映する
            </button>
            <button type="button" onClick={close}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
