import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  DEFAULT_SETTINGS,
  MODE_INFO,
  MODES,
  PACKS,
  type Mode,
  type Question,
  type Settings,
  type Snapshot,
} from "../../shared/schema";
import { Connection, clearSession, readSession } from "./connection";

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 80 64" aria-hidden="true">
      <path d="M34 54 9 30C-5 12 21-1 34 18 45 0 65 10 57 27Z" />
      <path d="m45 54-23-24C10 14 34 4 45 20 57 1 81 12 70 29Z" />
    </svg>
  );
}
function Landscape() {
  return (
    <svg
      className="landscape"
      viewBox="0 0 1000 740"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="An illustrated twilight lake beneath rose-colored mountains"
    >
      <defs>
        <linearGradient id="sky" x2="0" y2="1">
          <stop stopColor="#20203f" />
          <stop offset=".55" stopColor="#775070" />
          <stop offset="1" stopColor="#f2998c" />
        </linearGradient>
        <linearGradient id="water" x2="0" y2="1">
          <stop stopColor="#876283" />
          <stop offset="1" stopColor="#12182d" />
        </linearGradient>
        <radialGradient id="glow">
          <stop stopColor="#ffd2ad" stopOpacity=".5" />
          <stop offset="1" stopColor="#ef8fa1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path fill="url(#sky)" d="M0 0h1000v740H0z" />
      <circle cx="682" cy="300" r="180" fill="url(#glow)" />
      <circle cx="682" cy="280" r="36" fill="#f8bba8" />
      <g fill="#ffe1cf" opacity=".7">
        <circle cx="145" cy="143" r="2" />
        <circle cx="290" cy="87" r="2" />
        <circle cx="490" cy="165" r="1.5" />
        <circle cx="801" cy="117" r="2" />
        <circle cx="872" cy="224" r="1.5" />
        <circle cx="368" cy="205" r="1.5" />
        <circle cx="590" cy="73" r="2" />
      </g>
      <path
        fill="#5c506f"
        d="m0 410 150-145 100 80 104-114 145 155 132-61 124 68 93-49 152 92v304H0Z"
      />
      <path
        fill="#353750"
        d="m0 415 119-68 154 100 181-117 156 151 139-79 103 43 148-90v385H0Z"
      />
      <path
        fill="#232a43"
        d="m0 458 158-66 146 97 172-57 118 69 193-66 213 52v253H0Z"
      />
      <path fill="url(#water)" d="M0 500h1000v240H0z" />
      <g stroke="#efa6a7" strokeWidth="2" opacity=".28">
        <path d="M610 519h138m-165 14h187m-142 20h75m-180 25h259m-154 20h91m-236 36h335m-351 25h298m-264 32h294" />
      </g>
      <path
        fill="#121a30"
        d="m0 484 85 22 113 30-45 41L0 585Zm1000-20-91 48-105 35 75 30 121 9Z"
      />
      <g fill="#ffc3a0">
        <circle cx="68" cy="503" r="3" />
        <circle cx="83" cy="508" r="2" />
        <circle cx="113" cy="515" r="3" />
        <circle cx="134" cy="522" r="2" />
        <circle cx="864" cy="529" r="3" />
        <circle cx="896" cy="517" r="2" />
        <circle cx="930" cy="504" r="3" />
      </g>
      <path
        fill="#101426"
        d="m0 644 128-14 129 59 109-18 65 69H0Zm1000-66-124 53-70-12-125 75-160 46h479Z"
      />
      <g fill="#101426">
        <path d="m53 637 18-365 17 365Z" />
        <path d="m71 277-57 83 41-10-63 94 63-18-56 87 121 8-47-95 60 12-50-82 38 8Z" />
        <path d="m945 641-15-315-15 315Z" />
        <path d="m930 315-47 77 32-9-51 78 50-11-48 85 116-10-51-76 45 7-43-73 32 8Z" />
      </g>
    </svg>
  );
}
function Button({
  children,
  secondary = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return (
    <button
      {...props}
      className={`${secondary ? "button secondary" : "button"} ${props.className || ""}`}
    >
      {children}
    </button>
  );
}
const initials = (name: string) => Array.from(name)[0]?.toUpperCase() || "?";
type Send = (type: string, payload?: unknown) => Promise<boolean>;

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState("offline");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<"home" | "entry">(() =>
    new URLSearchParams(location.search).has("room") ? "entry" : "home",
  );
  const [now, setNow] = useState(Date.now());
  const clockRef = useRef({ server: Date.now(), local: performance.now() });
  const connectionRef = useRef<Connection | null>(null);
  if (!connectionRef.current)
    connectionRef.current = new Connection(
      (s) => {
        clockRef.current = { server: s.serverNow, local: performance.now() };
        setNow(s.serverNow);
        setSnapshot(s);
      },
      setStatus,
      setError,
      () => {
        setSnapshot(null);
        setScreen("entry");
      },
    );
  const connection = connectionRef.current;
  useEffect(() => {
    if (readSession()) {
      try {
        connection.open();
      } catch (error) {
        setError((error as Error).message);
      }
    }
    const timer = setInterval(
      () =>
        setNow(
          clockRef.current.server + performance.now() - clockRef.current.local,
        ),
      200,
    );
    const sync = () => {
      if (connection.socket?.connected && readSession())
        void connection.send({ type: "sync" }).catch(() => {});
    };
    const heartbeat = setInterval(sync, 15000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    return () => {
      clearInterval(timer);
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
      connection.close();
    };
  }, [connection]);
  const send: Send = async (type, payload = {}) => {
    setError("");
    setBusy(true);
    try {
      await connection.send({
        type,
        payload,
        roundId: snapshot?.roundId ?? null,
        phaseId: snapshot?.phaseId,
      });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  async function leave() {
    if (snapshot && !(await send("leave"))) return;
    clearSession();
    connection.close();
    setSnapshot(null);
    setScreen("home");
    history.replaceState(null, "", location.pathname);
  }
  return (
    <div className="app">
      <header className="site-header">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          onClick={(e) => {
            e.preventDefault();
            if (!snapshot) setScreen("home");
          }}
          aria-label="Heart Sync home"
        >
          <Mark />
          <span>
            Heart<span>Sync</span>
          </span>
        </a>
        <div className="header-note">A LITTLE PLAY. A LITTLE CLOSER.</div>
        {snapshot ? (
          <button
            className="text-button"
            onClick={() => void leave()}
            disabled={busy}
          >
            Leave room <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <span className="edition">THE TWO-PLAYER EDITION</span>
        )}
      </header>
      {error && (
        <div className="banner error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {!snapshot && status === "reconnecting" && (
        <div className="banner" role="status">
          Reconnecting to your game…{" "}
          <button
            onClick={() => {
              clearSession();
              connection.close();
              setScreen("entry");
            }}
          >
            Return to entry
          </button>
        </div>
      )}
      {!snapshot ? (
        screen === "home" ? (
          <Home onPlay={() => setScreen("entry")} />
        ) : (
          <Entry
            busy={busy}
            send={send}
            back={() => {
              connection.close();
              setScreen("home");
            }}
          />
        )
      ) : (
        <div className="game-layout">
          <aside className="room-sidebar">
            <div className="eyebrow">YOUR LITTLE CORNER</div>
            <div className="room-code">{snapshot.code}</div>
            <div className="copy-row">
              <Copy text={snapshot.code} label="Copy code" />
              <Copy
                text={`${location.origin}${location.pathname}?room=${snapshot.code}`}
                label="Copy invite link"
              />
            </div>
            <div className="players">
              {snapshot.players.map((p, i) => (
                <div key={p.id} className="player">
                  <span className={`avatar player-${i}`}>
                    {initials(p.name)}
                  </span>
                  <div>
                    <strong>
                      {p.label}
                      {p.id === snapshot.selfId && <small> YOU</small>}
                    </strong>
                    <span>
                      {!p.connected
                        ? "Reconnecting…"
                        : snapshot.phase === "lobby"
                          ? p.ready
                            ? "✓ Ready to play"
                            : "Getting comfortable"
                          : snapshot.phase === "finished"
                            ? "✓ Game complete"
                            : p.continued
                              ? "✓ Ready to continue"
                              : p.voted
                                ? "✓ Evaluation locked"
                                : p.submitted
                                  ? "✓ Answer locked"
                                  : snapshot.phase === "answering"
                                    ? "Thinking…"
                                    : "Together in the room"}
                    </span>
                  </div>
                  {p.id === snapshot.hostId && (
                    <span className="host-label">HOST</span>
                  )}
                </div>
              ))}
              {snapshot.players.length < 2 && (
                <div className="player empty">
                  <span className="avatar">+</span>
                  <div>
                    <strong>A place for your person</strong>
                    <span>Send them the room code</span>
                  </div>
                </div>
              )}
            </div>
            <div className="sidebar-score">
              <span>Sync score</span>
              <strong>
                {snapshot.stats.percent === null
                  ? "—"
                  : `${snapshot.stats.percent}%`}
              </strong>
              <small>
                {snapshot.stats.complete} complete · {snapshot.stats.incomplete}{" "}
                incomplete · {snapshot.stats.skipped} skipped
              </small>
            </div>
            <div className="sidebar-bottom">
              <span className="tiny-star">✦</span>
              <p>
                Good conversations
                <br />
                <em>start with a little play.</em>
              </p>
              <span className="privacy-note">
                Just the two of you.
                <br />
                Answers stay secret until reveal.
              </span>
            </div>
          </aside>
          <main className="game-main" aria-busy={busy}>
            {status !== "connected" || snapshot.phase === "paused" ? (
              <section className="pause-panel">
                <div className="eyebrow">SAVING YOUR PLACE</div>
                <h1>A little intermission.</h1>
                <p>
                  {status !== "connected"
                    ? "Your connection dropped. We’re finding your way back."
                    : "Your partner is reconnecting. The game clock is paused."}
                </p>
                {snapshot.graceUntil && (
                  <p className="countdown-number">
                    {Math.max(0, Math.ceil((snapshot.graceUntil - now) / 1000))}
                    <small> seconds to reconnect</small>
                  </p>
                )}
                <p className="muted">
                  If the connection does not return, the remaining player goes
                  back to the lobby.
                </p>
              </section>
            ) : snapshot.phase === "lobby" ? (
              <Lobby s={snapshot} send={send} busy={busy} />
            ) : snapshot.phase === "finished" ? (
              <Final s={snapshot} send={send} busy={busy} leave={leave} />
            ) : (
              <Round
                key={snapshot.roundId}
                s={snapshot}
                send={send}
                busy={busy}
                now={now}
              />
            )}
          </main>
        </div>
      )}
      <footer className="site-footer">
        <span>HEART SYNC</span>
        <span>Made for two. Meant for a good time.</span>
        <span>A game, never a relationship test.</span>
      </footer>
    </div>
  );
}
function Home({ onPlay }: { onPlay: () => void }) {
  return (
    <main className="home">
      <section className="home-copy">
        <div className="eyebrow">
          <span className="live-dot" /> YOUR NEXT STAY-IN DATE
        </div>
        <h1>
          Same questions.
          <br />
          Different minds.
          <br />
          <em>A little closer.</em>
        </h1>
        <p className="home-description">
          A private game night for you and your favorite person. A few
          unexpected questions. A little friendly persuasion. A lot to talk
          about.
        </p>
        <Button onClick={onPlay}>
          Let’s play <span aria-hidden="true">↗</span>
        </Button>
        <span className="under-cta">
          Two players · Two devices · One shared moment
        </span>
        <div className="home-features">
          <div>
            <b>01</b>
            <span>
              No accounts.
              <br />
              Just a room code.
            </span>
          </div>
          <div>
            <b>02</b>
            <span>
              Secret answers.
              <br />
              Shared surprises.
            </span>
          </div>
          <div>
            <b>03</b>
            <span>
              Four ways
              <br />
              to find your sync.
            </span>
          </div>
        </div>
      </section>
      <section className="home-art">
        <Landscape />
        <div className="art-caption">
          Meet me on
          <br />
          <em>your wavelength.</em>
          <span>✦</span>
        </div>
        <div className="floating-question">
          <span className="eyebrow">A LITTLE PREVIEW</span>
          <p>
            Who is more likely to say
            <br />
            “one more game” and mean five?
          </p>
          <div>
            <span>You?</span>
            <span>Definitely them?</span>
          </div>
        </div>
        <div className="art-footnote">PLAY · LAUGH · LEARN · GROW TOGETHER</div>
      </section>
      <section className="mode-strip" aria-label="The four game modes">
        {MODES.map((m, i) => (
          <div key={m}>
            <span className="mode-icon">{MODE_INFO[m].symbol}</span>
            <span>
              <small>0{i + 1}</small>
              <strong>{MODE_INFO[m].name}</strong>
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
function Entry({
  send,
  busy,
  back,
}: {
  send: Send;
  busy: boolean;
  back: () => void;
}) {
  const [name, setName] = useState(
    () => localStorage.getItem("heart-sync-name") || "",
  );
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get("room") || "",
  );
  const [join, setJoin] = useState(!!code);
  async function submit(e: FormEvent) {
    e.preventDefault();
    localStorage.setItem("heart-sync-name", name.trim());
    await send(join ? "join" : "create", join ? { name, code } : { name });
  }
  return (
    <main className="entry-layout">
      <section className="entry-art">
        <Landscape />
        <div>
          <div className="eyebrow">SAVE A SEAT FOR YOUR PERSON</div>
          <h1>
            A small room.
            <br />
            <em>
              A whole world
              <br />
              of conversation.
            </em>
          </h1>
          <p>
            No sign-ups. No spectators.
            <br />
            Just you, them, and the next question.
          </p>
        </div>
      </section>
      <section className="entry-form">
        <button className="text-button" onClick={back}>
          ← Back
        </button>
        <div className="eyebrow">MAKE YOURSELF AT HOME</div>
        <h1>
          First, what
          <br />
          should we call you?
        </h1>
        <p className="muted">Your name is only used in this game room.</p>
        <form onSubmit={(e) => void submit(e)}>
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            autoComplete="given-name"
            maxLength={24}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
          />
          <div className="segmented entry-tabs">
            <button
              type="button"
              aria-pressed={!join}
              onClick={() => setJoin(false)}
            >
              Create a room
            </button>
            <button
              type="button"
              aria-pressed={join}
              onClick={() => setJoin(true)}
            >
              Join a room
            </button>
          </div>
          {join && (
            <>
              <label htmlFor="code">Room code</label>
              <input
                id="code"
                autoComplete="off"
                maxLength={30}
                autoCapitalize="characters"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC234"
                className="code-input"
              />
            </>
          )}
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy
              ? "Finding your corner…"
              : join
                ? "Join your person →"
                : "Create our room →"}
          </Button>
        </form>
        <div className="entry-note">
          <span>⌁</span>
          <p>
            {join
              ? "Enter the code your partner shared."
              : "You’ll get a private code to share with your partner."}
            <br />
            Exactly two players. No public room list.
          </p>
        </div>
      </section>
    </main>
  );
}
function Copy({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span>
      <button
        className="text-button"
        onClick={() =>
          void navigator.clipboard
            .writeText(text)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => setFailed(true))
        }
      >
        {copied ? "✓ Copied" : label}
      </button>
      {failed && (
        <input
          aria-label={`${label} manually`}
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
        />
      )}
    </span>
  );
}
function SectionTitle({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <span>{number}</span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
function Lobby({ s, send, busy }: { s: Snapshot; send: Send; busy: boolean }) {
  const host = s.selfId === s.hostId;
  const self = s.players.find((p) => p.id === s.selfId)!;
  const disabled = busy || !host;
  const change = (patch: Partial<Settings>) =>
    void send("settings", { settings: { ...s.settings, ...patch } });
  return (
    <>
      <div className="eyebrow">THE ROOM IS YOURS</div>
      <div className="page-heading">
        <h1>Set the mood.</h1>
        <span className="pill">{s.players.length} / 2 players</span>
      </div>
      <p className="muted">
        A quick catch-up or a longer adventure. Make it your kind of evening.
      </p>
      {s.notice && (
        <p className="notice" role="status">
          {s.notice}
        </p>
      )}
      {!host && (
        <p className="notice">
          Your host chooses the settings. Mark Ready when you’re happy with
          them.
        </p>
      )}
      <div className="lobby-body">
        <section className="lobby-modes" aria-label="Game modes">
          <SectionTitle number="01" title="How will you play?" />
          <div className="mode-grid">
            <button
              disabled={disabled}
              className={`mode-choice mixed ${s.settings.mode === "mixed" ? "selected" : ""}`}
              aria-pressed={s.settings.mode === "mixed"}
              onClick={() => change({ mode: "mixed" })}
            >
              <span>✧</span>
              <div>
                <strong>Mixed Game</strong>
                <p>A little of everything. Four modes, one shared adventure.</p>
              </div>
              <span className="choice-check">
                {s.settings.mode === "mixed" ? "✓" : "+"}
              </span>
            </button>
            {MODES.map((mode) => (
              <button
                key={mode}
                disabled={disabled}
                aria-pressed={s.settings.mode === mode}
                className={`mode-choice ${s.settings.mode === mode ? "selected" : ""}`}
                onClick={() => change({ mode })}
              >
                <span>{MODE_INFO[mode].symbol}</span>
                <div>
                  <strong>{MODE_INFO[mode].name}</strong>
                  <p>{MODE_INFO[mode].description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section
          className="lobby-settings"
          aria-label="Pace and question packs"
        >
          <SectionTitle number="02" title="Find your pace" />
          <div className="setup-row">
            <fieldset disabled={disabled}>
              <legend>Questions</legend>
              <div className="segmented">
                {([5, 10, 15, 20] as const).map((count) => (
                  <button
                    key={count}
                    aria-pressed={s.settings.count === count}
                    onClick={() => change({ count })}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={disabled}>
              <legend>Seconds per answer</legend>
              <div className="segmented">
                {([15, 30, 60, 0] as const).map((seconds) => (
                  <button
                    key={seconds}
                    aria-pressed={s.settings.seconds === seconds}
                    onClick={() => change({ seconds })}
                  >
                    {seconds || "No limit"}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <SectionTitle number="03" title="Pick your conversation" />
          <fieldset className="packs" disabled={disabled}>
            <legend className="sr-only">Question packs</legend>
            <button
              aria-pressed={s.settings.packs.length === 6}
              onClick={() =>
                change({
                  packs: s.settings.packs.length === 6 ? [] : [...PACKS],
                })
              }
            >
              All packs
            </button>
            {PACKS.map((pack) => (
              <button
                key={pack}
                aria-pressed={s.settings.packs.includes(pack)}
                onClick={() =>
                  change({
                    packs: s.settings.packs.includes(pack)
                      ? s.settings.packs.filter((p) => p !== pack)
                      : [...s.settings.packs, pack],
                  })
                }
              >
                {s.settings.packs.includes(pack) ? "✓ " : ""}
                {pack}
              </button>
            ))}
          </fieldset>
        </section>
      </div>
      <CustomEditor s={s} send={send} disabled={disabled} />
      <div className="availability">
        <span>{s.availability.total} questions available</span>
        <span>
          {s.availability.custom} room questions +{" "}
          {Math.max(0, s.settings.count - s.availability.custom)} from the bank
        </span>
      </div>
      {s.availability.error && (
        <p className="notice" role="status">
          {s.availability.error}
        </p>
      )}
      <div className="lobby-actions">
        <Button
          secondary={self.ready}
          disabled={busy}
          onClick={() => void send("ready", { ready: !self.ready })}
        >
          {self.ready ? "✓ Ready · undo" : "I’m ready"}
        </Button>
        {host ? (
          <Button
            disabled={
              busy ||
              !!s.availability.error ||
              s.players.length !== 2 ||
              !s.players.every((p) => p.ready && p.connected)
            }
            onClick={() => void send("start")}
          >
            Start our game <span>→</span>
          </Button>
        ) : (
          <p className="muted">
            {self.ready
              ? "Waiting for your host to start."
              : "Ready when you are."}
          </p>
        )}
      </div>
      <p className="fine-print">
        Both players must be Ready. Changing settings resets Ready.
      </p>
    </>
  );
}
function CustomEditor({
  s,
  send,
  disabled,
}: {
  s: Snapshot;
  send: Send;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("most_likely");
  const [text, setText] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [open, setOpen] = useState(false);
  function reset() {
    setEditing(null);
    setText("");
    setA("");
    setB("");
    setOpen(false);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const q: Question = {
      id: editing || `custom_${crypto.randomUUID()}`,
      mode,
      pack: "fun",
      text: text.trim(),
      ...(mode === "this_or_that"
        ? {
            options: [
              { id: "a" as const, text: a.trim() },
              { id: "b" as const, text: b.trim() },
            ],
          }
        : {}),
    };
    const questions = editing
      ? s.custom.map((old) => (old.id === editing ? q : old))
      : [...s.custom, q];
    if (await send("custom", { questions })) reset();
  }
  return (
    <details className="custom-details">
      <summary>
        Your own little plot twists <span>{s.custom.length} / 20</span>
      </summary>
      <p className="muted">Room questions disappear when this room closes.</p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          disabled={disabled}
          checked={s.settings.includeCustom}
          onChange={(e) =>
            void send("settings", {
              settings: { ...s.settings, includeCustom: e.target.checked },
            })
          }
        />{" "}
        Include room questions
      </label>
      <ol className="custom-list">
        {s.custom.map((q) => (
          <li key={q.id}>
            <div>
              <small>{MODE_INFO[q.mode].name}</small>
              <span>{q.text}</span>
            </div>
            {!disabled && (
              <div className="row-actions">
                <button
                  onClick={() => {
                    setEditing(q.id);
                    setMode(q.mode);
                    setText(q.text);
                    setA(q.options?.[0].text || "");
                    setB(q.options?.[1].text || "");
                    setOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() =>
                    void send("custom", {
                      questions: s.custom.filter((p) => p.id !== q.id),
                    })
                  }
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!disabled &&
        (open ? (
          <form className="custom-form" onSubmit={(e) => void save(e)}>
            <label htmlFor="custom-mode">Mode</label>
            <select
              id="custom-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              {MODES.filter((m) => m !== "guess_partner").map((m) => (
                <option key={m} value={m}>
                  {MODE_INFO[m].name}
                </option>
              ))}
            </select>
            <label htmlFor="custom-text">Question ({text.length}/240)</label>
            <textarea
              id="custom-text"
              required
              maxLength={240}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {mode === "this_or_that" && (
              <div className="setup-row">
                <label>
                  Option A
                  <input
                    required
                    maxLength={160}
                    value={a}
                    onChange={(e) => setA(e.target.value)}
                  />
                </label>
                <label>
                  Option B
                  <input
                    required
                    maxLength={160}
                    value={b}
                    onChange={(e) => setB(e.target.value)}
                  />
                </label>
              </div>
            )}
            <div className="row-actions">
              <Button disabled={!text.trim()}>Save question</Button>
              <Button secondary type="button" onClick={reset}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button
            className="text-button"
            disabled={s.custom.length === 20}
            onClick={() => setOpen(true)}
          >
            + Add a room question
          </button>
        ))}
    </details>
  );
}
function Round({
  s,
  send,
  busy,
  now,
}: {
  s: Snapshot;
  send: Send;
  busy: boolean;
  now: number;
}) {
  const [draft, setDraft] = useState("");
  const self = s.players.find((p) => p.id === s.selfId)!;
  const partner = s.players.find((p) => p.id !== s.selfId)!;
  const q = s.question!;
  const info = MODE_INFO[q.mode];
  const seconds =
    s.deadlineAt === null
      ? null
      : Math.max(0, Math.ceil((s.deadlineAt - now) / 1000));
  const result = s.phase === "round_result";
  const answerLabel = (id: string, value: string) =>
    q.mode === "most_likely"
      ? s.players.find((p) => p.id === value)?.label || value
      : q.mode === "this_or_that"
        ? q.options?.find((o) => o.id === value)?.text || value
        : value;
  const voteLabel = (value: string) =>
    ({
      yes: "You convinced me",
      no: "Not convinced",
      correct: "Correct",
      close: "Close enough",
      nope: "Nope",
    })[value] || value;
  return (
    <section className="round-screen">
      <div className="round-topline">
        <span>
          QUESTION {s.round.toString().padStart(2, "0")}{" "}
          <span className="muted">
            / {s.settings.count.toString().padStart(2, "0")}
          </span>
        </span>
        <span
          className={`timer ${seconds !== null && seconds <= 5 ? "urgent" : ""}`}
          aria-label="Time remaining"
        >
          ◷ {seconds === null ? "No time limit" : `${seconds}s`}
          {s.phase === "evaluating" && " · evaluation"}
        </span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="Game progress"
        aria-valuemin={0}
        aria-valuemax={s.settings.count}
        aria-valuenow={s.round}
      >
        <span style={{ width: `${(s.round / s.settings.count) * 100}%` }} />
      </div>
      <div className="mode-ribbon" role="group" aria-label="Current round mode">
        {MODES.map((m) => (
          <span key={m} className={m === q.mode ? "active" : ""}>
            {MODE_INFO[m].symbol} <span>{MODE_INFO[m].name}</span>
          </span>
        ))}
      </div>
      <div className="question-area">
        <div className="eyebrow">
          {info.symbol} {info.name} <span>· {q.pack}</span>
        </div>
        <h1>{q.text}</h1>
        {q.mode === "guess_partner" && (
          <p className="role-note">
            {s.targetId === s.selfId
              ? "Your role: answer about yourself. Then you’ll judge the prediction."
              : `Your role: predict ${s.players.find((p) => p.id === s.targetId)!.label}’s answer.`}
          </p>
        )}
        {s.phase === "countdown" ? (
          <div className="countdown-stage" role="status">
            <span className="countdown-number">{seconds}</span>
            <h2>One question. Two minds.</h2>
            <p>You’ll both answer at the same time.</p>
          </div>
        ) : s.phase === "answering" ? (
          <>
            {s.ownAnswer !== null ? (
              <div className="locked-answer" role="status">
                <span>✓</span>
                <h2>Your answer is locked.</h2>
                <p>{answerLabel(s.selfId, s.ownAnswer)}</p>
                <small>
                  Waiting for {partner.label}. Your answers will appear
                  together.
                </small>
              </div>
            ) : q.mode === "most_likely" || q.mode === "this_or_that" ? (
              <div className="answer-options">
                {(q.mode === "most_likely"
                  ? s.players.map((p) => ({ id: p.id, text: p.label }))
                  : q.options!
                ).map((option, i) => (
                  <button
                    className={`answer-option player-${i}`}
                    key={option.id}
                    disabled={busy || seconds === 0}
                    onClick={() => void send("answer", { value: option.id })}
                  >
                    <span className="option-letter">
                      {q.mode === "most_likely"
                        ? initials(option.text)
                        : i === 0
                          ? "A"
                          : "B"}
                    </span>
                    <strong>{option.text}</strong>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            ) : (
              <form
                className="answer-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send("answer", { value: draft });
                }}
              >
                <label htmlFor="answer">
                  {q.mode === "guess_partner" && s.targetId !== s.selfId
                    ? "Your prediction"
                    : "Your answer"}
                </label>
                <textarea
                  id="answer"
                  placeholder="A little thought goes a long way…"
                  maxLength={500}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                />
                <div className="answer-form-footer">
                  <small>{draft.length} / 500 · Enter adds a new line</small>
                  <Button disabled={busy || !draft.trim() || seconds === 0}>
                    Submit answer →
                  </Button>
                </div>
              </form>
            )}
            <div className="secret-note">
              ⌁ Your answers stay hidden until both submit or time runs out.
            </div>
            <div className="skip-row">
              <button
                className="text-button"
                disabled={busy || self.skip}
                onClick={() => void send("skip")}
              >
                {self.skip
                  ? "✓ Skip requested"
                  : partner.skip
                    ? "Confirm skip"
                    : "Skip this question"}
              </button>
              <span>
                {partner.skip
                  ? "Your partner wants to skip."
                  : self.skip
                    ? "Your partner also needs to confirm."
                    : "Only skipped if you both agree."}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="reveal-label">
              THE REVEAL <span>✦</span>
            </div>
            <div className="reveal-grid">
              {s.players.map((p, i) => (
                <article className={`revealed-answer player-${i}`} key={p.id}>
                  <div>
                    <span className="avatar">{initials(p.name)}</span>
                    <strong>{p.label}</strong>
                    {q.mode === "guess_partner" && (
                      <small>
                        {p.id === s.targetId ? "ACTUAL ANSWER" : "PREDICTION"}
                      </small>
                    )}
                  </div>
                  <p>
                    {s.answers?.[p.id] !== undefined
                      ? answerLabel(p.id, s.answers[p.id])
                      : "No answer submitted"}
                  </p>
                  {s.votes?.[p.id] && (
                    <small>Evaluation: {voteLabel(s.votes[p.id])}</small>
                  )}
                </article>
              ))}
            </div>
            {s.phase === "evaluating" && (
              <div className="evaluation">
                <h2>
                  {q.mode === "convince_me"
                    ? `Did ${partner.label} convince you?`
                    : "How close was the prediction?"}
                </h2>
                {q.mode === "guess_partner" && s.targetId !== s.selfId ? (
                  <p role="status">
                    Waiting for {partner.label} to evaluate your prediction.
                  </p>
                ) : s.ownVote ? (
                  <p className="notice" role="status">
                    ✓ Evaluation locked. Waiting for your partner.
                  </p>
                ) : (
                  <div className="vote-options">
                    {(q.mode === "convince_me"
                      ? [
                          ["yes", "You convinced me"],
                          ["no", "Not convinced"],
                        ]
                      : [
                          ["correct", "Correct"],
                          ["close", "Close enough"],
                          ["nope", "Nope"],
                        ]
                    ).map(([value, label], i) => (
                      <Button
                        secondary={i > 0}
                        key={value}
                        disabled={busy || seconds === 0}
                        onClick={() => void send("vote", { value })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
                <p className="fine-print">
                  {q.mode === "convince_me"
                    ? "Judge only your partner’s answer. Votes are revealed together."
                    : "The person being guessed makes the call. No automatic matching."}
                </p>
              </div>
            )}
            {result && s.result && (
              <div className="round-result" role="status">
                <span className="result-points">
                  {s.result.status === "complete"
                    ? `+${s.result.points}`
                    : s.result.status === "skipped"
                      ? "↷"
                      : "—"}
                </span>
                <div>
                  <span className="eyebrow">
                    {s.result.status === "complete"
                      ? "SHARED POINTS"
                      : s.result.status.toUpperCase()}
                  </span>
                  <h2>{s.result.message}</h2>
                  {s.result.status !== "complete" && (
                    <p>This round is not included in your Sync score.</p>
                  )}
                </div>
              </div>
            )}
            {result && (
              <div className="continue-row">
                <Button
                  disabled={busy || self.continued}
                  onClick={() => void send("continue")}
                >
                  {self.continued
                    ? "✓ Waiting for your partner"
                    : s.round === s.settings.count
                      ? "Continue to our results →"
                      : "Continue →"}
                </Button>
                <p className="fine-print">
                  Take your time. You both choose when to continue.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
function Final({
  s,
  send,
  busy,
  leave,
}: {
  s: Snapshot;
  send: Send;
  busy: boolean;
  leave: () => Promise<void>;
}) {
  return (
    <section className="final-screen">
      <div className="eyebrow">A SHARED MOMENT, WELL SPENT</div>
      <div className="final-avatars">
        {s.players.map((p, i) => (
          <span className={`avatar player-${i}`} key={p.id}>
            {initials(p.name)}
          </span>
        ))}
        <span>✦</span>
      </div>
      <h1>
        Your kind of <em>connection.</em>
      </h1>
      <p className="muted">{s.players.map((p) => p.label).join(" & ")}</p>
      <div className="final-summary">
        <div className="final-score">
          <span>Sync score</span>
          <strong>
            {s.stats.percent === null
              ? "No score this time"
              : `${s.stats.percent}%`}
          </strong>
          <p>{s.finalMessage}</p>
        </div>
        <div className="stat-grid">
          <div>
            <strong>
              {s.stats.points} / {s.stats.complete}
            </strong>
            <span>Shared points / complete rounds</span>
          </div>
          <div>
            <strong>{s.stats.incomplete}</strong>
            <span>Incomplete rounds</span>
          </div>
          <div>
            <strong>{s.stats.skipped}</strong>
            <span>Skipped together</span>
          </div>
        </div>
      </div>
      <div className="mode-statistics">
        {MODES.map((mode) => {
          const stats = s.stats.byMode[mode];
          return (
            <div key={mode}>
              <span>{MODE_INFO[mode].symbol}</span>
              <strong>{MODE_INFO[mode].name}</strong>
              <small>
                {mode === "convince_me"
                  ? `${stats.positiveVotes} positive votes`
                  : mode === "guess_partner"
                    ? `${stats.correct} correct · ${stats.partial} close`
                    : `${stats.matches} matches`}
                <br />
                {stats.complete} complete rounds
              </small>
            </div>
          );
        })}
      </div>
      <p className="fine-print">
        Shared points ÷ complete rounds × 100. Incomplete and skipped rounds sit
        out.
        <br />
        Just a game, never a measure of your relationship.
      </p>
      <div className="final-actions">
        <Button disabled={busy} onClick={() => void send("again")}>
          Play again ↻
        </Button>
        <Button secondary disabled={busy} onClick={() => void send("lobby")}>
          Back to lobby
        </Button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void leave()}
        >
          Leave room
        </button>
      </div>
      <p className="fine-print">
        A new game starts only after you both mark Ready again.
      </p>
      <details className="history">
        <summary>Your evening, question by question</summary>
        <ol>
          {s.history.map((r) => (
            <li key={r.roundId}>
              <span>
                {r.question.text.replaceAll(
                  "{name}",
                  s.players.find((p) => p.id === r.targetId)?.label ||
                    "your partner",
                )}
              </span>
              <strong>
                {r.status === "complete" ? `${r.points} pt` : r.status}
              </strong>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
