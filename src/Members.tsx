import { useState } from "react";
import { RosterImport } from "./RosterImport.tsx";
import { newId, removeMember, usageOf, type Update } from "./store.ts";
import { GENDERS, GRADES, isActive, STATUSES, type Data, type Gender, type Member, type Status } from "./types.ts";

function parseLine(line: string): Member | null {
  const parts = line.split(/[,\t、\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const grade = Number(parts.find((p) => /^\d+/.test(p))?.match(/\d+/)?.[0] ?? 1);
  const genderText = parts.slice(1).find((p) => /男|女/.test(p)) ?? "";
  const gender: Gender = genderText.includes("男") ? "男" : genderText.includes("女") ? "女" : "未設定";
  return { id: newId(), name: parts[0], grade, gender, status: "在籍" };
}

export function Members({ data, update }: { data: Data; update: Update }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(1);
  const [gender, setGender] = useState<Gender>("男");
  const [bulk, setBulk] = useState("");
  const [view, setView] = useState<Status | "すべて">("在籍");

  const edit = (id: string, patch: Partial<Member>) =>
    update((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  const addMembers = (list: Member[]) => update((d) => ({ ...d, members: [...d.members, ...list] }));

  const shown = data.members.filter((m) => view === "すべて" || m.status === view);
  const unset = data.members.filter((m) => isActive(m) && m.gender === "未設定").length;
  const count = (v: Status | "すべて") => (v === "すべて" ? data.members.length : data.members.filter((m) => m.status === v).length);

  const remove = (m: Member) => {
    const { paid, other } = usageOf(data, m.id);
    const lines = [`${m.name} を名簿から削除しますか？元に戻せません。`];
    if (paid > 0) lines.push(`・${m.name} が立て替えた支出 ${paid}件は立て替えた人が未選択になり、選び直すまで精算に入りません。`);
    if (other > 0) lines.push(`・会計の対象・乗車・運転・個別指定・集金から外れ、割り勘の金額が変わります。`);
    if (paid + other > 0) lines.push("", "記録を残したいだけなら、削除せず「OB」や「退部」にしてください。");
    if (confirm(lines.join("\n"))) update((d) => removeMember(d, m.id));
  };

  return (
    <section>
      <h2>名簿</h2>
      <RosterImport data={data} update={update} />
      <details className="card">
        <summary>手で追加する</summary>
        <h3>1人ずつ追加</h3>
        <form
          className="row"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!name.trim()) return;
            addMembers([{ id: newId(), name: name.trim(), grade, gender, status: "在籍" }]);
            setName("");
          }}
        >
          <input placeholder="名前" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}年
              </option>
            ))}
          </select>
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            {GENDERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <button type="submit" className="primary">
            追加
          </button>
        </form>
        <details>
          <summary>まとめて追加</summary>
          <p className="hint">1行に1人、「名前 学年 性別」の順で。例：山田太郎 1 男</p>
          <textarea rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <button
            type="button"
            className="primary"
            onClick={() => {
              const list = bulk.split("\n").map(parseLine).filter((m): m is Member => m !== null);
              if (list.length === 0) return;
              addMembers(list);
              setBulk("");
            }}
          >
            まとめて追加
          </button>
        </details>
      </details>

      {unset > 0 && <p className="warning">性別が「未設定」の人が{unset}人います。「男子のみ」などの割り勘から外れるので、下の表で設定してください。</p>}

      <div className="segmented" role="radiogroup" aria-label="表示する部員">
        {([...STATUSES, "すべて"] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
            {v}（{count(v)}）
          </button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>学籍番号</th>
            <th>名前</th>
            <th>学年</th>
            <th>性別</th>
            <th>状態</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map((m) => (
            <tr key={m.id} className={isActive(m) ? "" : "muted"}>
              <td className="hint">{m.studentId ?? "—"}</td>
              <td>
                <input value={m.name} onChange={(e) => edit(m.id, { name: e.target.value })} />
              </td>
              <td>
                <select value={m.grade} onChange={(e) => edit(m.id, { grade: Number(e.target.value) })}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}年
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select className={m.gender === "未設定" ? "unset" : ""} value={m.gender} onChange={(e) => edit(m.id, { gender: e.target.value as Gender })}>
                  {GENDERS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </td>
              <td>
                <select value={m.status} onChange={(e) => edit(m.id, { status: e.target.value as Status })}>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td>
                <button type="button" className="danger" onClick={() => remove(m)}>
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="empty">{data.members.length === 0 ? "まだ部員がいません。" : "該当する部員はいません。"}</p>}
    </section>
  );
}
