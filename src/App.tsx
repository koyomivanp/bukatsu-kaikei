import { useState } from "react";
import { Backup } from "./Backup.tsx";
import { EventList } from "./EventList.tsx";
import { EventView } from "./EventView.tsx";
import { Members } from "./Members.tsx";
import { useData } from "./store.ts";
import { Summary } from "./Summary.tsx";

type Tab = "events" | "members" | "summary" | "backup";

const TABS: { id: Tab; label: string }[] = [
  { id: "events", label: "会計" },
  { id: "members", label: "名簿" },
  { id: "summary", label: "まとめて集計" },
  { id: "backup", label: "バックアップ" },
];

export function App() {
  const [data, update, replace] = useData();
  const [tab, setTab] = useState<Tab>("events");
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const event = data.events.find((e) => e.id === openEvent);

  return (
    <div className="app">
      <header className="top no-print">
        <h1>部活会計</h1>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "tab active" : "tab"}
              onClick={() => {
                setTab(t.id);
                setOpenEvent(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === "events" && event && <EventView data={data} update={update} event={event} onBack={() => setOpenEvent(null)} />}
        {tab === "events" && !event && <EventList data={data} update={update} onOpen={setOpenEvent} />}
        {tab === "members" && <Members data={data} update={update} />}
        {tab === "summary" && <Summary data={data} />}
        {tab === "backup" && <Backup data={data} replace={replace} />}
      </main>
    </div>
  );
}
