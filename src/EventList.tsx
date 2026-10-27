import { useState } from "react";
import { yen } from "./settle.ts";
import { newId, type Update } from "./store.ts";
import { ANNUAL, isActive, type Data } from "./types.ts";

export function EventList({ data, update, onOpen }: { data: Data; update: Update; onOpen: (id: string) => void }) {
  const [name, setName] = useState("");

  const totalOf = (id: string) => data.expenses.filter((x) => x.eventId === id).reduce((s, x) => s + x.amount, 0);
  const events = [...data.events].sort((a, b) => (a.id === ANNUAL ? -1 : b.id === ANNUAL ? 1 : 0));

  return (
    <section>
      <h2>会計</h2>
      <form
        className="card row"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!name.trim()) return;
          const id = newId();
          update((d) => ({
            ...d,
            events: [
              ...d.events,
              { id, name: name.trim(), participantIds: d.members.filter(isActive).map((m) => m.id), trips: [] },
            ],
          }));
          setName("");
          onOpen(id);
        }}
      >
        <input placeholder="会計の名前（例：夏合宿まで）" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="primary">
          作成
        </button>
      </form>
      <ul className="events">
        {events.map((e) => {
          const settled = data.settled[e.id]?.length ?? 0;
          return (
            <li key={e.id}>
              <button type="button" className="event" onClick={() => onOpen(e.id)}>
                <span className="event-name">{e.name}</span>
                <span className="event-meta">
                  {e.id === ANNUAL && "全期間 ・ "}支出 {data.expenses.filter((x) => x.eventId === e.id).length}件 ・ {yen(totalOf(e.id))}
                  {settled > 0 && ` ・ 精算済み ${settled}人`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
