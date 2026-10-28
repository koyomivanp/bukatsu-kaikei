import { useState } from "react";
import { newId, type Update } from "./store.ts";
import { FILTER_GENDERS, isActive, isDefaultParticipant, type ClubEvent, type Data, type Gender, type Member, type Trip } from "./types.ts";

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const names = (members: Member[], ids: string[]) => members.filter((m) => ids.includes(m.id)).map((m) => m.name).join("、") || "なし";

/** 会計の参加者と、車ごとの乗車・運転を、学年ごとに並べた名前ボタンで切り替える */
export function PeoplePanel({ data, update, event }: { data: Data; update: Update; event: ClubEvent }) {
  const [tab, setTab] = useState<string>("target");
  const [showInactive, setShowInactive] = useState(false);
  const trip = event.trips.find((t) => t.id === tab);
  const mode = trip ? "trip" : "target";

  const involved = new Set([...event.participantIds, ...event.trips.flatMap((t) => [...t.riderIds, ...t.driverIds])]);
  const shown = data.members.filter((m) => isActive(m) || involved.has(m.id) || showInactive);
  const inactive = data.members.filter((m) => !isActive(m)).length;
  const grades = [...new Set(shown.map((m) => m.grade))].sort();

  const patchEvent = (patch: Partial<ClubEvent>) =>
    update((d) => ({ ...d, events: d.events.map((e) => (e.id === event.id ? { ...e, ...patch } : e)) }));
  const patchTrip = (tripId: string, patch: Partial<Trip>) =>
    patchEvent({ trips: event.trips.map((t) => (t.id === tripId ? { ...t, ...patch } : t)) });

  // 移動では押すたびに 乗らない → 乗車 → 運転 → 乗らない
  const press = (m: Member) => {
    if (!trip) return patchEvent({ participantIds: toggle(event.participantIds, m.id) });
    if (!trip.riderIds.includes(m.id)) return patchTrip(trip.id, { riderIds: [...trip.riderIds, m.id] });
    if (!trip.driverIds.includes(m.id)) return patchTrip(trip.id, { driverIds: [...trip.driverIds, m.id] });
    patchTrip(trip.id, { riderIds: trip.riderIds.filter((x) => x !== m.id), driverIds: trip.driverIds.filter((x) => x !== m.id) });
  };
  const stateOf = (m: Member) =>
    trip ? (trip.driverIds.includes(m.id) ? "drive" : trip.riderIds.includes(m.id) ? "on" : "off") : event.participantIds.includes(m.id) ? "on" : "off";

  // 今選んでいる人のうち、その性別の人だけ残す（「1〜3年」→「男だけ」で1〜3年の男子）
  const onlyGender = (g: Gender) => {
    const keep = (ids: string[]) => ids.filter((id) => data.members.find((m) => m.id === id)?.gender === g);
    // 移動では運転手は残す（女子の移動を男子が運転することもあるため）
    if (trip) patchTrip(trip.id, { riderIds: trip.riderIds.filter((id) => trip.driverIds.includes(id) || keep([id]).length > 0) });
    else patchEvent({ participantIds: keep(event.participantIds) });
  };
  const genderButtons = (
    <>
      <span className="divider" />
      {FILTER_GENDERS.map((g) => (
        <button key={g} type="button" className="small" onClick={() => onlyGender(g)} title={`今選んでいる人のうち${g}子だけ残します`}>
          {g}だけ
        </button>
      ))}
    </>
  );

  const addTrip = () => {
    const id = newId();
    patchEvent({ trips: [...event.trips, { id, name: `車${"①②③④⑤⑥⑦⑧⑨"[event.trips.length] ?? event.trips.length + 1}`, riderIds: [], driverIds: [] }] });
    setTab(id);
  };
  const removeTrip = (t: Trip) => {
    const used = data.expenses.filter((x) => x.tripId === t.id).length;
    if (used > 0) return alert(`「${t.name}」には支出が${used}件あります。先に支出の運転した人を変えるか削除してください。`);
    if (event.trips.length === 1) return alert("高速・ガソリンを割るのに使うので、最後の車は消せません。");
    if (!confirm(`「${t.name}」を削除しますか？`)) return;
    patchEvent({ trips: event.trips.filter((x) => x.id !== t.id) });
    setTab("target");
  };

  return (
    <div className="card">
      <h3>参加者と車</h3>

      <div className="no-print">
        <div className="people-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "target"} className={mode === "target" ? "on" : ""} onClick={() => setTab("target")}>
            参加者<span className="count">{event.participantIds.length}人</span>
          </button>
          {event.trips.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.name}
              <span className="count">
                乗車{t.riderIds.length}・運転{t.driverIds.length}
              </span>
            </button>
          ))}
          <button type="button" className="add" onClick={addTrip}>
            ＋ 車を追加
          </button>
        </div>

        <div className="people-toolbar">
          <span className="label">まとめて</span>
          {trip ? (
            <>
              <button type="button" className="small" onClick={() => patchTrip(trip.id, { riderIds: [...new Set([...event.participantIds, ...trip.driverIds])] })}>
                参加者を全員乗せる
              </button>
              <button type="button" className="small" onClick={() => patchTrip(trip.id, { riderIds: [], driverIds: [] })}>
                全員降ろす
              </button>
              {genderButtons}
              <span className="spacer" />
              <input className="trip-name" value={trip.name} aria-label="車の名前" onChange={(e) => patchTrip(trip.id, { name: e.target.value })} />
              <button type="button" className="danger small" onClick={() => removeTrip(trip)}>
                この車を削除
              </button>
            </>
          ) : (
            <>
              <button type="button" className="small" onClick={() => patchEvent({ participantIds: data.members.filter(isDefaultParticipant).map((m) => m.id) })}>
                1〜3年
              </button>
              <button type="button" className="small" onClick={() => patchEvent({ participantIds: data.members.filter(isActive).map((m) => m.id) })}>
                全員
              </button>
              <button type="button" className="small" onClick={() => patchEvent({ participantIds: [] })}>
                全部外す
              </button>
              {genderButtons}
            </>
          )}
        </div>

        <p className="hint">
          {trip
            ? `名前を押すたびに「乗らない → 乗車 → 運転」と切り替わります。高速・ガソリンは乗車 ${trip.riderIds.length}人から運転手 ${trip.driverIds.length}人を除いた ${trip.riderIds.length - trip.driverIds.length}人で割ります。`
            : "名前を押して参加者を切り替えます。雑費は「イベント参加者」で割ります（4年生以上は最初は外れています）。"}
        </p>

        <div className="grade-rows">
          {grades.map((g) => (
            <div key={g} className="grade-row">
              <span className="grade-label">{g}年</span>
              <div className="chips">
                {shown
                  .filter((m) => m.grade === g)
                  .map((m) => {
                    const state = stateOf(m);
                    return (
                      <button key={m.id} type="button" className={`chip ${state}`} aria-pressed={state !== "off"} onClick={() => press(m)}>
                        {m.name}
                        {!isActive(m) && <span className="status">{m.status}</span>}
                        {state === "drive" && <span className="badge">運転</span>}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {inactive > 0 && (
          <label className="check">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            退部・OBの人も表示する（OBが合宿に来たときなど）
          </label>
        )}
        {data.members.length === 0 && <p className="empty">先に「名簿」タブで部員を登録してください。</p>}
      </div>

      <dl className="print-only people-print">
        <dt>参加者（{event.participantIds.length}人）</dt>
        <dd>{names(data.members, event.participantIds)}</dd>
        {event.trips.map((t) => (
          <div key={t.id}>
            <dt>{t.name}</dt>
            <dd>
              運転：{names(data.members, t.driverIds)}
              <br />
              高速・ガソリンを割る人（{t.riderIds.length - t.driverIds.length}人）：
              {names(data.members, t.riderIds.filter((id) => !t.driverIds.includes(id)))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
