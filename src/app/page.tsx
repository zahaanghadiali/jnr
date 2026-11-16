"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";
type Card = { kind: "truth" | "dare"; prompt: string; started: number };
type Entry = Card & {
  name: string;
  answer?: string;
  mediaUrl?: string;
  mediaType?: string;
  swapped?: boolean;
  at: number;
  seconds: number;
};
type Game = {
  me: {
    name: string;
    active: Card | null;
    swaps: number;
    entries: Entry[];
  } | null;
  wall: Entry[];
  leaders: { name: string; dares: number; seconds: number }[];
};
const tabs = ["Play", "The Wall", "Leaderboard", "Upload"];
function PartyButton({
  children,
  disabled,
  ...props
}: HTMLMotionProps<"button">) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      {...props}
      disabled={disabled}
      whileTap={disabled || reduced ? undefined : { scale: 0.96 }}
      whileHover={disabled || reduced ? undefined : { y: -2 }}
      transition={{ type: "spring", stiffness: 450, damping: 24 }}
    >
      {children}
    </motion.button>
  );
}
export default function Home() {
  return (
    <MotionConfig reducedMotion="user">
      <GameScreen />
    </MotionConfig>
  );
}
function GameScreen() {
  const reduced = useReducedMotion();
  const [celebrate, setCelebrate] = useState(0);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(0), 2600);
    return () => clearTimeout(timer);
  }, [celebrate]);
  const [game, setGame] = useState<Game>({ me: null, wall: [], leaders: [] });
  const [tab, setTab] = useState("Play"),
    [name, setName] = useState(""),
    [answer, setAnswer] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [host, setHost] = useState(false),
    [password, setPassword] = useState(""),
    [mediaKey, setMediaKey] = useState(""),
    [fileName, setFileName] = useState(""),
    [hostEntries, setHostEntries] = useState<Entry[]>([]);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/game", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setGame(data);
    setReady(true);
  }, []);
  useEffect(() => {
    const load = () => refresh().catch((e) => setError(e.message));
    void load();
    const timer = setInterval(load, 8000);
    const hash = () => setHost(location.hash === "#host");
    hash();
    window.addEventListener("hashchange", hash);
    return () => {
      clearInterval(timer);
      window.removeEventListener("hashchange", hash);
    };
  }, [refresh]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnswer("");
      setMediaKey("");
      setFileName("");
      await refresh();
      if (action === "complete") setCelebrate(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: file.type, size: file.size }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const form = new FormData();
      Object.entries(data.fields).forEach(([k, v]) =>
        form.append(k, String(v)),
      );
      form.append("file", file);
      const stored = await fetch(data.url, { method: "POST", body: form });
      if (!stored.ok)
        throw new Error(
          "Upload failed. Check your connection or the bucket’s allowed site address.",
        );
      setMediaKey(data.key);
      setFileName(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportData(download: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/game?export=1", {
        headers: { "x-host-password": password },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (download) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "jnr-export.json";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setHostEntries(
          data.flatMap((p: { name: string; entries: Entry[] }) =>
            p.entries
              .filter((e) => e.mediaUrl)
              .map((e) => ({ ...e, name: p.name })),
          ),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const me = game.me,
    card = me?.active;
  const count = (kind: string) =>
    me?.entries.filter((e) => e.kind === kind && !e.swapped).length || 0;
  function media(e: Entry) {
    return e.mediaUrl ? (
      <div className="media">
        {e.mediaType?.startsWith("video/") ? (
          <video src={e.mediaUrl} controls preload="metadata" />
        ) : e.mediaType?.includes("hei") ? (
          <a href={e.mediaUrl} target="_blank" rel="noreferrer">
            Open original photo ↗
          </a>
        ) : (
          <img
            src={e.mediaUrl}
            alt={`Dare completed by ${e.name}`}
            loading="lazy"
          />
        )}
      </div>
    ) : null;
  }
  return (
    <div className="shell">
      <AnimatePresence>
        {celebrate > 0 && (
          <motion.div
            className="celebration"
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span>✦</span> Another memory, made.
            {!reduced && (
              <div className="confetti" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <i key={i} style={{ "--i": i } as React.CSSProperties} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <header>
        <Link className="brand" href="/">
          J<span>&</span>R<span className="brand-dot">✳</span>
        </Link>
        <span className="event-label">THE WEDDING AFTERPARTY</span>
        <span className="live">
          <i /> Let the good times roll
        </span>
      </header>
      <main>
        <motion.section
          className="hero"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65 }}
        >
          <div className="eyebrow">GOOD COMPANY. GREAT STORIES.</div>
          <h1>
            <motion.span
              className="title-line"
              initial={{
                opacity: 0,
                y: reduced ? 0 : 22,
                filter: reduced ? "none" : "blur(5px)",
              }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.8,
                delay: 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              A little truth.
            </motion.span>
            <motion.span
              className="title-line"
              initial={{
                opacity: 0,
                y: reduced ? 0 : 22,
                filter: reduced ? "none" : "blur(5px)",
              }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.8,
                delay: 0.22,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              A little <em>dare.</em>
            </motion.span>
          </h1>
          <p>
            Break the ice. Make a memory.
            <br className="mobile" /> Give us something to talk about tomorrow.
          </p>
          <div className="hero-stamp" aria-hidden="true">
            ONE NIGHT
            <br />
            <strong>∞</strong>
            <br />
            STORIES
          </div>
        </motion.section>
        <nav aria-label="Game sections">
          {tabs.map((t, i) => (
            <PartyButton
              key={t}
              className={tab === t ? "selected" : ""}
              aria-current={tab === t ? "page" : undefined}
              onClick={() => setTab(t)}
            >
              <span>0{i + 1}</span>
              {t}
              {tab === t && (
                <motion.i
                  className="nav-indicator"
                  layoutId="tab-highlight"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
            </PartyButton>
          ))}
        </nav>
        {error && (
          <div className="alert" role="alert">
            {error}
            <PartyButton
              onClick={() => {
                setError("");
                void refresh().catch((e) => setError(e.message));
              }}
            >
              Retry
            </PartyButton>
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -6 }}
            transition={{ duration: 0.18 }}
          >
            {tab === "Play" && (
              <section className="play-grid">
                <div className="game-panel">
                  <div className="section-top">
                    <span className="eyebrow">YOUR MOMENT STARTS HERE</span>
                    <span className="spark">✳</span>
                  </div>
                  {!me ? (
                    <>
                      <h2>Hey, party person.</h2>
                      <p>
                        Tell us your name. We’ll take care of the icebreaker.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act("join", { name });
                        }}
                      >
                        <label htmlFor="name">What should we call you?</label>
                        <input
                          id="name"
                          maxLength={40}
                          placeholder="Your name or party alter ego"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                        <PartyButton
                          className="primary"
                          disabled={busy || !name.trim() || !ready}
                        >
                          {busy ? "Joining…" : "Let’s play ↗"}
                        </PartyButton>
                      </form>
                      <small>
                        Your answers and media appear on the shared party Wall.
                      </small>
                    </>
                  ) : (
                    <>
                      <h2>You’re up, {me.name}.</h2>
                      <div className="counters">
                        <span>{count("truth")}/2 truths</span>
                        <span>{count("dare")}/2 dares</span>
                        <span>{1 - me.swaps} swap left</span>
                      </div>
                      {card ? (
                        <motion.div
                          key={card.started}
                          className={`active-card ${card.kind}`}
                          initial={{
                            opacity: 0,
                            rotate: reduced ? 0 : -3,
                            scale: reduced ? 1 : 0.94,
                            y: reduced ? 0 : 20,
                          }}
                          animate={{ opacity: 1, rotate: 0, scale: 1, y: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 220,
                            damping: 22,
                          }}
                        >
                          <span className="eyebrow">
                            YOUR {card.kind.toUpperCase()}
                          </span>
                          <h3>
                            {card.prompt}
                            {card.kind === "dare" ? "." : ""}
                          </h3>
                          {card.kind === "truth" ? (
                            <>
                              <label htmlFor="answer">The truth, please</label>
                              <textarea
                                id="answer"
                                maxLength={2000}
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                placeholder="Tell us the story…"
                              />
                            </>
                          ) : (
                            <label className="file-picker">
                              {fileName
                                ? `✓ ${fileName}`
                                : "＋ Add your photo or video"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
                                disabled={busy}
                                onChange={(e) =>
                                  void upload(e.target.files?.[0])
                                }
                              />
                              <small>
                                Photos up to 20 MB · Videos up to 100 MB
                              </small>
                            </label>
                          )}
                          <PartyButton
                            className="primary"
                            disabled={
                              busy ||
                              (card.kind === "truth"
                                ? !answer.trim()
                                : !mediaKey)
                            }
                            onClick={() =>
                              void act("complete", { answer, mediaKey })
                            }
                          >
                            {busy
                              ? "Saving / uploading…"
                              : card.kind === "truth"
                                ? "Answered. Put it on the Wall ↗"
                                : "Done. Put it on the Wall ↗"}
                          </PartyButton>
                          <PartyButton
                            className="text-button"
                            disabled={busy || me.swaps >= 1}
                            onClick={() => {
                              if (
                                confirm(
                                  "Take a proper sip of any drink (water counts!), then swap? You get one swap all night, and it appears on the Wall.",
                                )
                              )
                                void act("swap");
                            }}
                          >
                            Sip & swap ↻
                          </PartyButton>
                        </motion.div>
                      ) : count("truth") + count("dare") === 4 ? (
                        <div className="finished">
                          <span>✦</span>
                          <h3>You understood the assignment.</h3>
                          <p>
                            Four memories made. Head to the Wall to see what
                            everyone else is up to.
                          </p>
                          <PartyButton
                            className="primary"
                            onClick={() => setTab("The Wall")}
                          >
                            See the Wall ↗
                          </PartyButton>
                        </div>
                      ) : (
                        <>
                          <p>Be honest or be bold. Pick your next move.</p>
                          <div className="choices">
                            <PartyButton
                              className="truth"
                              initial={{ opacity: 0, y: reduced ? 0 : 25 }}
                              animate={{ opacity: 1, y: 0 }}
                              disabled={busy || count("truth") >= 2}
                              onClick={() =>
                                void act("draw", { kind: "truth" })
                              }
                            >
                              <span>“</span>
                              <strong>Truth</strong>
                              <small>A story worth telling ↗</small>
                            </PartyButton>
                            <PartyButton
                              className="dare"
                              initial={{ opacity: 0, y: reduced ? 0 : 40 }}
                              animate={{ opacity: 1, y: 0 }}
                              disabled={busy || count("dare") >= 2}
                              onClick={() => void act("draw", { kind: "dare" })}
                            >
                              <span>✳</span>
                              <strong>Dare</strong>
                              <small>A moment worth capturing ↗</small>
                            </PartyButton>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
                <aside>
                  <span className="eyebrow">THE HOUSE RULES</span>
                  <h2>
                    A night to
                    <br />
                    <em>remember.</em>
                  </h2>
                  <ol>
                    <li>
                      <b>Pick your adventure.</b>
                      <p>Two truths. Two dares. Make them count.</p>
                    </li>
                    <li>
                      <b>Bring the receipts.</b>
                      <p>Truths need an answer. Dares need a photo or video.</p>
                    </li>
                    <li>
                      <b>One little escape.</b>
                      <p>
                        Take a sip of any drink and swap once. Water counts.
                      </p>
                    </li>
                  </ol>
                  <div className="aside-note">
                    Keep it kind. Ask before filming.
                    <br />
                    The best memories include everyone.
                  </div>
                </aside>
              </section>
            )}
            {tab === "The Wall" && (
              <section className="content wall-content">
                <div className="section-top">
                  <div>
                    <span className="eyebrow">THE NIGHT, AS IT HAPPENS</span>
                    <h2>
                      A beautiful <em>mess.</em>
                    </h2>
                    <p className="wall-subtitle">
                      The stories. The evidence. The night we won’t forget.
                    </p>
                  </div>
                  <span className="pill">Updates every 8 seconds</span>
                </div>
                {!game.wall.length ? (
                  <div className="empty">
                    ✳<h3>The first story could be yours.</h3>
                    <p>Answers, dares and cheeky swaps will appear here.</p>
                  </div>
                ) : (
                  <div className="wall collage">
                    {game.wall.map((e) => (
                      <motion.article
                        key={`${e.at}-${e.name}-${e.started}`}
                        className={`scrap ${e.swapped ? "swap-note" : e.mediaUrl ? "photo-print" : "truth-note"}`}
                        style={
                          {
                            "--tilt": `${(e.at % 9) - 4}deg`,
                            "--offset": `${(e.at % 3) * 13}px`,
                          } as React.CSSProperties
                        }
                        initial={{ opacity: 0, y: reduced ? 0 : 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.1 }}
                        transition={{
                          type: "spring",
                          stiffness: 190,
                          damping: 22,
                        }}
                      >
                        <span className="tape" aria-hidden="true" />
                        {!e.swapped && media(e)}
                        <div className="section-top">
                          <b>{e.name}</b>
                          <span className="pill">
                            {e.swapped ? "SIP & SWAP" : e.kind}
                          </span>
                        </div>
                        <h3>{e.prompt}</h3>
                        {e.answer && <p>{e.answer}</p>}
                        {e.swapped && <p>One sip. A fresh start. ↻</p>}
                        <small>
                          {new Date(e.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {e.kind === "dare" && !e.swapped
                            ? ` · ${e.seconds}s`
                            : ""}
                        </small>
                      </motion.article>
                    ))}
                  </div>
                )}
              </section>
            )}
            {tab === "Leaderboard" && (
              <section className="content">
                <span className="eyebrow">BRAGGING RIGHTS INCLUDED</span>
                <h2>The party legends.</h2>
                <p>Most dares completed, then fastest total completion time.</p>
                {game.leaders.length ? (
                  game.leaders.map((p, i) => (
                    <div className="leader" key={i}>
                      <span className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>{p.name}</h3>
                        <small>
                          {["Legend", "Troublemaker", "Party Menace"][i] ||
                            "Memory maker"}
                        </small>
                      </div>
                      <b>
                        {p.dares} dares <span>· {p.seconds}s</span>
                      </b>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    ✦<h3>A crown waiting for its owner.</h3>
                    <p>Complete a dare to join the leaderboard.</p>
                  </div>
                )}
              </section>
            )}
            {tab === "Upload" && (
              <section className="content">
                <span className="eyebrow">KEEP THE GOOD STUFF</span>
                <h2>Memories, in full colour.</h2>
                <p>
                  Photos and videos attached to your dares are saved in their
                  original quality.
                </p>
                <div className="upload-info">
                  <h3>Got a dare to document?</h3>
                  <p>
                    Open your dare in Play, choose a photo or video, then mark
                    it done to share it on the Wall.
                  </p>
                  <PartyButton
                    className="primary"
                    onClick={() => setTab("Play")}
                  >
                    Back to Play ↗
                  </PartyButton>
                </div>
                {process.env.NEXT_PUBLIC_GOOGLE_FORM_URL && (
                  <a
                    className="external"
                    href={process.env.NEXT_PUBLIC_GOOGLE_FORM_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Upload extra party photos ↗
                  </a>
                )}
                {process.env.NEXT_PUBLIC_DRIVE_FOLDER_URL && (
                  <a
                    className="external"
                    href={process.env.NEXT_PUBLIC_DRIVE_FOLDER_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open the backup album ↗
                  </a>
                )}
                <PartyButton
                  className="text-button"
                  onClick={() => window.print()}
                >
                  Print table card ↗
                </PartyButton>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
        {host && (
          <section className="host content">
            <span className="eyebrow">HOST DESK</span>
            <h2>The morning-after collection.</h2>
            <label htmlFor="host">Host password</label>
            <input
              id="host"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <div className="host-actions">
              <PartyButton
                className="primary"
                disabled={busy || !password}
                onClick={() => void exportData(false)}
              >
                Load all photos & videos
              </PartyButton>
              <PartyButton
                className="text-button"
                disabled={busy || !password}
                onClick={() => void exportData(true)}
              >
                Export raw JSON ↓
              </PartyButton>
            </div>
            <p>
              Download links expire after one hour. Reload to generate new
              links.
            </p>
            <div className="wall">
              {hostEntries.map((e, i) => (
                <article key={i}>
                  <b>{e.name}</b>
                  {media(e)}
                  <a href={e.mediaUrl} target="_blank" rel="noreferrer">
                    Open / save original ↗
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}
        <footer>
          <span>J&R · MADE FOR THIS NIGHT</span>
          <span>A little courage. A lot of love. ♡</span>
        </footer>
      </main>
      <div className="print-card">
        <h1>J&R</h1>
        <h2>A little truth. A little dare.</h2>
        <p>Join the party on your phone</p>
        <PrintAddress />
      </div>
    </div>
  );
}
const subscribe = () => () => {};
function PrintAddress() {
  const url = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
  return (
    <>
      <QRCodeImage url={url} />
      <strong>{url}</strong>
    </>
  );
}
function QRCodeImage({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (url)
      void QRCode.toDataURL(url, {
        width: 250,
        margin: 2,
        color: { dark: "#171717", light: "#ffffff" },
      }).then(setSrc);
  }, [url]);
  return src ? <img className="qr" src={src} alt="Scan to join JnR" /> : null;
}
