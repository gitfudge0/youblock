import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  EyeOff,
  Fingerprint,
  ListFilter,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "./api";
import {
  allRules,
  defaults,
  fields,
  normalize,
  optionLabels,
  type Action,
  type Field,
  type Rule,
  type Settings,
  type State,
} from "../core/model";
import { parseRuleEntries } from "../core/rule-entry";
import { BlurFade } from "./components/blur-fade";
import "./style.css";
const labels: Record<Field, string> = {
  title: "Video title",
  channelName: "Channel / author name",
  channelId: "Channel / author ID",
  videoId: "Video ID",
  comment: "Comment text",
};
const isPopup = location.pathname.endsWith("popup.html");
const freshRule = (): Rule => ({
  id: crypto.randomUUID(),
  field: "title",
  pattern: "",
  action: "inherit",
  enabled: true,
});
const optionDescriptions: Record<string, string> = {
  suggestions_only: "Allow direct links to matching videos.",
  autoplay: "Move past filtered items instead of stopping.",
  block_feedback: "Optional. Sends a signal to YouTube when you block content.",
  enable_javascript: "Advanced. Runs your filter in the YouTube page context.",
  disable_on_history:
    "Keep your watch history visible, even when a rule matches.",
};
function App() {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<Settings>(defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("rules");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Rule | null>(null);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);
  const openRule = (rule: Rule) => {
    editorTrigger.current = document.activeElement as HTMLElement;
    setError("");
    setNotice("");
    setEditing(rule);
  };
  const closeEditor = () => {
    setEditing(null);
    setError("");
    requestAnimationFrame(() => {
      const trigger = editorTrigger.current;
      if (trigger?.isConnected) trigger.focus();
      else document.querySelector<HTMLButtonElement>(".popup .button.wide")?.focus();
    });
  };
  useEffect(() => {
    // Repeated keyboard actions stay instant; pointer interactions get brief feedback.
    const keyboard = () => { document.documentElement.dataset.input = "keyboard"; };
    const pointer = () => { document.documentElement.dataset.input = "pointer"; };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);
  const refresh = async () => {
    const s = await api.get();
    setState(s);
    setDraft(s.settings);
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(id);
    }
  }, [notice]);
  const run = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (next = draft) => {
    await api.save(normalize(next));
    await refresh();
    setNotice("Your changes are saved.");
  };
  const patchOption = (key: string, value: boolean | string | number | null) =>
    setDraft((s) => ({ ...s, options: { ...s.options, [key]: value } }));
  const dirty =
    state && JSON.stringify(draft) !== JSON.stringify(state.settings);
  const rules = allRules(draft);
  const filtered = rules.filter((r) =>
    (r.pattern + " " + labels[r.field])
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const materialize = (s: Settings): Settings => ({
    ...s,
    rules: allRules(s).map((r) => ({
      ...r,
      id: r.id.startsWith("legacy-") ? crypto.randomUUID() : r.id,
    })),
    filterData: {
      ...s.filterData,
      ...Object.fromEntries(fields.map((f) => [f, []])),
    },
  });
  function changeRule(id: string, change: Partial<Rule> | null) {
    const index = allRules(draft).findIndex((r) => r.id === id);
    const next = materialize(draft);
    next.rules = change
      ? next.rules.map((r, i) => (i === index ? { ...r, ...change } : r))
      : next.rules.filter((_, i) => i !== index);
    setDraft(next);
  }
  function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const entries = parseRuleEntries(editing.pattern, editing);
      const index = rules.findIndex((r) => r.id === editing.id);
      const next = materialize(draft);
      if (index < 0) next.rules.push(...entries);
      else {
        entries[0].id = next.rules[index].id;
        next.rules.splice(index, 1, ...entries);
      }
      if (next.rules.length > 10000) throw new Error("You can save up to 10,000 rules. This batch was not added.");
      if (isPopup)
        void run(async () => {
          await save(next);
          closeEditor();
        });
      else {
        setDraft(next);
        closeEditor();
        setNotice(`${entries.length === 1 ? "Rule" : `${entries.length} rules`} added to your changes. Save to apply.`);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "youblock-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Backup exported. Password is not included.");
  };
  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await run(async () => {
      if (f.size > 5_000_000)
        throw new Error("Choose a backup smaller than 5 MB.");
      const imported = normalize(JSON.parse(await f.text()));
      imported.options.enable_javascript = false;
      if (
        confirm("Replace the current rules and preferences with this backup?")
      ) {
        setDraft(imported);
        setNotice(
          "Backup loaded. Custom JavaScript is disabled until you opt in again; passwords are not imported. Save changes to apply it.",
        );
      }
    });
    e.target.value = "";
  };
  const modeControl = (
    <div
      className="mode-switch"
      role="group"
      aria-label="Default filtering mode"
      aria-describedby={isPopup ? "mode-help" : undefined}
      data-mode={draft.mode}
    >
      <span className="mode-indicator" aria-hidden="true" />
      {(["hide", "blur"] as const).map((mode) => (
        <button
          key={mode}
          className={draft.mode === mode ? "selected" : ""}
          aria-pressed={draft.mode === mode}
          disabled={busy}
          onClick={() =>
            isPopup
              ? void run(() => save({ ...draft, mode }))
              : setDraft((s) => ({ ...s, mode }))
          }
        >
          {mode === "hide" ? <EyeOff size={17} /> : <Fingerprint size={17} />}
          <span>{mode === "hide" ? "Hide matches" : "Blur matches"}</span>
          {draft.mode === mode && (
            <span className="mode-dot" />
          )}
        </button>
      ))}
    </div>
  );
  const entryCount = editing?.pattern.split(/\r\n|\r|\n/).filter(line => line.trim()).length || 0;
  const ruleForm = editing && (
    <form className="rule-form" onSubmit={addRule} onKeyDown={(e) => {
      if (e.key === "Escape") { e.preventDefault(); closeEditor(); }
    }}>
      <div className="form-title">
        <strong>
          {rules.some((r) => r.id === editing.id) ? "Edit rule" : "New rule"}
        </strong>
        <button
          className="icon-button"
          type="button"
          aria-label="Close rule editor"
          onClick={closeEditor}
        >
          <X size={17} />
        </button>
      </div>
      <div className="rule-selectors">
      <label>
        Match in
        <select
          value={editing.field}
          onChange={(e) =>
            setEditing({ ...editing, field: e.target.value as Field })
          }
        >
          {fields.map((f) => (
            <option value={f} key={f}>
              {labels[f]}
            </option>
          ))}
        </select>
      </label>
      <label>
        When it matches
        <select
          value={editing.action}
          onChange={(e) =>
            setEditing({ ...editing, action: e.target.value as Action })
          }
        >
          <option value="inherit">Default · {draft.mode}</option>
          <option value="hide">Hide completely</option>
          <option value="blur">Blur strongly</option>
        </select>
      </label>
      </div>
      <label>
        Keyword, ID, or /regex/i
        <textarea
          autoFocus
          rows={4}
          aria-describedby="rule-entry-help"
          aria-invalid={Boolean(error)}
          value={editing.pattern}
          onChange={(e) => setEditing({ ...editing, pattern: e.target.value })}
          placeholder={"spoilers\nclickbait\n/season \\d+ finale/i"}
          required
          maxLength={50000}
        />
      </label>
      <p className="help" id="rule-entry-help">
        One rule per line. Blank lines are skipped. All rules use the field and action above.
      </p>
      {!isPopup && <details className="matching-help">
        <summary>How matching works</summary>
        <p>Keywords match whole words, ignoring case. IDs match exactly. Use /regex/i for patterns. Channel names also match comment authors.</p>
      </details>}
      <button className="button primary" disabled={busy}>
        <Check size={16} /> {isPopup
          ? entryCount > 1 ? `Save ${entryCount} rules` : "Save rule"
          : entryCount > 1 ? `Add ${entryCount} rules to changes` : "Add to changes"}
      </button>
    </form>
  );
  const feedback = (
    <>
      {error && (
        <div className="feedback error" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="feedback success" role="status">
          <CheckCheck size={17} />
          {notice}
        </div>
      )}
    </>
  );
  const brand = (
    <a
      className="brand"
      href={chrome.runtime?.getURL?.("options.html") || "options.html"}
      target={isPopup ? "_blank" : undefined}
    >
      <span className="brand-symbol">
        <ListFilter size={21} />
      </span>
      YouBlock<span className="brand-period">.</span>
    </a>
  );
  if (!state)
    return (
      <main className={isPopup ? "popup loading" : "loading"}>
        {brand}
        <p role="status">{error || "Preparing your space…"}</p>
        {error && (
          <button className="button" onClick={() => void run(refresh)}>
            Try again
          </button>
        )}
      </main>
    );
  if (state.locked)
    return (
      <main className={isPopup ? "popup locked" : "locked"}>
        {brand}
        <div>
          <div className="lock-emblem">
            <LockKeyhole size={28} />
          </div>
          <p className="eyebrow">YOUR SETTINGS ARE PROTECTED</p>
          <h1>Unlock your settings.</h1>
          <p className="muted">
            Unlock to change your rules and preferences. Filtering keeps running
            while settings are locked.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api.unlock(password);
                setPassword("");
                await refresh();
              });
            }}
          >
            <label>
              Password
              <input
                type="password"
                maxLength={1024}
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Unlock settings <ChevronRight size={16} />
            </button>
          </form>
          {feedback}
          <button
            className="text-button"
            onClick={() => setResetOpen((v) => !v)}
          >
            Forgot your password?
          </button>
          {resetOpen && (
            <div className="reset-warning">
              <p>
                Reset removes every rule, preference, and password. This cannot
                be undone. A saved backup can be imported afterward.
              </p>
              <button
                className="button danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Delete all YouBlock rules, preferences, and password?",
                    )
                  )
                    void run(async () => {
                      await api.reset();
                      setResetOpen(false);
                      await refresh();
                    });
                }}
              >
                Reset YouBlock
              </button>
            </div>
          )}
          <p className="footnote">
            This lock protects settings, not browser access. The browser owner
            can remove or reset the extension.
          </p>
        </div>
      </main>
    );
  if (isPopup)
    return (
      <main className="popup">
        <header>
          {brand}
          <button
            className="icon-button"
            aria-label="Open all settings"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <ArrowUpRight size={19} />
          </button>
        </header>
        <div>
          {!editing && <div className="popup-status">
            <span className={state.enabled ? "status-dot" : "status-dot off"} />
            {state.enabled ? "Filtering is on" : "Filtering is paused"}
            <button
              className={"switch " + (state.enabled ? "on" : "")}
              role="switch"
              aria-checked={state.enabled}
              aria-label="Enable filtering"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.toggle(!state.enabled);
                  const s = await api.get();
                  setState(s);
                })
              }
            >
              <span />
            </button>
          </div>}
          {editing ? <BlurFade key={editing.id}>{ruleForm}</BlurFade> : (
            <>
              <div className="popup-heading">
                <h1>A quieter YouTube.</h1>
                <p className="muted">A little more control over your feed.</p>
              </div>
              {modeControl}
              <div className="mode-preview" data-mode={draft.mode} id="mode-help">
                {draft.mode === "hide" ? <EyeOff size={18} /> : <Fingerprint size={18} />}
                <span>{draft.mode === "hide" ? "Matches are removed from your feed." : "Heavily blurred. Reveal for 3 seconds."}</span>
              </div>
              <div className="popup-count">
                <span><strong>{rules.filter((r) => r.enabled).length}</strong> active rules</span>
                <ShieldCheck size={18} />
              </div>
              <button className="button primary wide" onClick={() => openRule(freshRule())}>
                <Plus size={17} /> Add a rule
              </button>
            </>
          )}
          {feedback}
          <footer>
            <button
              className="text-button"
              onClick={() => chrome.runtime.openOptionsPage()}
            >
              Manage your rules <ArrowUpRight size={14} />
            </button>
            {state.protected && (
              <button
                className="icon-button"
                aria-label="Lock settings"
                onClick={() =>
                  void run(async () => {
                    await api.lock();
                    await refresh();
                  })
                }
              >
                <LockKeyhole size={15} />
              </button>
            )}
          </footer>
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        {brand}
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Settings sections">
          {[
            { id: "rules", icon: ListFilter, label: "Your rules" },
            {
              id: "preferences",
              icon: SlidersHorizontal,
              label: "Preferences",
            },
            { id: "security", icon: LockKeyhole, label: "Privacy & lock" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setTab(item.id); setError(""); }}
              aria-current={tab === item.id ? "page" : undefined}
              className={tab === item.id ? "active" : ""}
            >
              <item.icon size={18} />
              {item.label}
              {tab === item.id && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span className="status-dot" />
            Made for your browser
          </div>
          <p>
            Rules stay on this device.
            <br />
            No account. No tracking.
          </p>
          <span className="version">YOU BLOCK · 0.1</span>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span>
            <span className={state.enabled ? "status-dot" : "status-dot off"} />
            {state.enabled ? "Protection is on" : "Protection is paused"}
          </span>
          <div>
            <button
              className={"switch " + (state.enabled ? "on" : "")}
              role="switch"
              aria-checked={state.enabled}
              aria-label="Enable filtering"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.toggle(!state.enabled);
                  const s = await api.get();
                  setState(s);
                })
              }
            >
              <span />
            </button>
            {state.protected && (
              <button
                className="button small"
                disabled={busy || Boolean(dirty)}
                title={
                  dirty ? "Save or discard changes before locking" : undefined
                }
                onClick={() =>
                  void run(async () => {
                    await api.lock();
                    await refresh();
                  })
                }
              >
                <LockKeyhole size={14} />
                Lock
              </button>
            )}
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <h1>
                {tab === "rules"
                  ? "Your feed. Your rules."
                  : tab === "preferences"
                    ? "Preferences"
                    : "Privacy & lock"}
              </h1>
              <p className="muted">
                {tab === "rules"
                  ? "Choose what you see on YouTube. Everything else can wait."
                  : tab === "preferences"
                    ? "Fine-tune what gets filtered and how YouTube behaves."
                    : "Everything stays local. You decide who can change it."}
              </p>
            </div>
            {tab === "rules" && (
              <button
                className="button primary"
                onClick={() => openRule(freshRule())}
              >
                <Plus size={18} />
                New rule
              </button>
            )}
          </div>
          {feedback}
          {tab === "rules" && (
            <>
              <section className="mode-card">
                <div>
                  <p className="eyebrow">DEFAULT BEHAVIOR</p>
                  <h2>What happens to a match?</h2>
                  <p className="muted">
                    Hide removes it. Blur strongly obscures it, with a 3-second reveal.
                  </p>
                </div>
                {modeControl}
              </section>
              <section className="rule-section">
                <div className="section-toolbar">
                  <h2>
                    All rules <span className="count">{rules.length}</span>
                  </h2>
                  <label className="search">
                    <Search size={17} />
                    <span className="sr-only">Search rules</span>
                    <input
                      placeholder="Find a rule…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                {ruleForm && <BlurFade>{ruleForm}</BlurFade>}
                {filtered.length ? (
                  <div className="rules-list">
                    {filtered.map((r) => (
                      <div
                        className={"rule-row " + (!r.enabled ? "disabled" : "")}
                        key={r.id}
                      >
                        <button
                          className={"switch " + (r.enabled ? "on" : "")}
                          role="switch"
                          aria-label={"Enable rule " + r.pattern}
                          aria-checked={r.enabled}
                          onClick={() =>
                            changeRule(r.id, { enabled: !r.enabled })
                          }
                        >
                          <span />
                        </button>
                        <button
                          className="rule-summary"
                          onClick={() => openRule({ ...r })}
                        >
                          <strong>{r.pattern}</strong>
                          <span>{labels[r.field]}</span>
                        </button>
                        <span
                          className="action-label"
                          data-action={r.action === "inherit" ? draft.mode : r.action}
                        >
                          {r.action === "inherit"
                            ? `Default · ${draft.mode}`
                            : r.action}
                        </span>
                        <button
                          className="icon-button delete"
                          aria-label={"Delete rule " + r.pattern}
                          onClick={() => changeRule(r.id, null)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-mark">
                      <ListFilter size={29} />
                    </div>
                    <h3>
                      {query ? "No matching rules" : "Make your first rule"}
                    </h3>
                    <p>
                      {query
                        ? "Try another keyword or clear your search."
                        : "Filter a title, channel, or comment. Paste multiple lines to add a batch."}
                    </p>
                    {!query && (
                      <button
                        className="text-button"
                        onClick={() => openRule(freshRule())}
                      >
                        Create your first rule <Plus size={15} />
                      </button>
                    )}
                  </div>
                )}
              </section>
              <section className="backup-row">
                <div>
                  <h3>Back up your rules</h3>
                  <p>Import a YouBlock backup, or save a copy.</p>
                </div>
                <div className="button-group">
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/json,.json"
                    ref={file}
                    onChange={importData}
                  />
                  <button
                    className="button small"
                    disabled={busy}
                    onClick={() => file.current?.click()}
                  >
                    <Upload size={15} />
                    Import
                  </button>
                  <button className="button small" onClick={exportData}>
                    <Download size={15} />
                    Export
                  </button>
                </div>
              </section>
            </>
          )}
          {tab === "preferences" && (
            <>
              <section className="settings-section">
                <h2>Content & playback</h2>
                <p className="muted">
                  Choose the formats and behaviors you'd rather leave behind.
                </p>
                {Object.entries(optionLabels)
                  .filter(([key]) => key !== "enable_javascript")
                  .map(([key, label]) => (
                    <label className="setting-row" key={key}>
                      <span>
                        <strong>{label}</strong>
                        {optionDescriptions[key] && (
                          <small>{optionDescriptions[key]}</small>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        className="native-switch"
                        checked={Boolean(draft.options[key])}
                        onChange={(e) => patchOption(key, e.target.checked)}
                      />
                    </label>
                  ))}
              </section>
              <section className="settings-section">
                <h2>Duration & watch progress</h2>
                <div className="form-grid">
                  <label>
                    Video duration rule
                    <select
                      value={String(draft.options.vidLength_type)}
                      onChange={(e) =>
                        patchOption("vidLength_type", e.target.value)
                      }
                    >
                      <option value="allow">Allow within range</option>
                      <option value="block">Block within range</option>
                    </select>
                  </label>
                  <label>
                    Minimum duration (seconds)
                    <input
                      type="number"
                      min="0"
                      value={draft.filterData.vidLength[0] ?? ""}
                      onChange={(e) =>
                        setDraft((s) => ({
                          ...s,
                          filterData: {
                            ...s.filterData,
                            vidLength: [
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                              s.filterData.vidLength[1],
                            ],
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Maximum duration (seconds)
                    <input
                      type="number"
                      min="0"
                      value={draft.filterData.vidLength[1] ?? ""}
                      onChange={(e) =>
                        setDraft((s) => ({
                          ...s,
                          filterData: {
                            ...s.filterData,
                            vidLength: [
                              s.filterData.vidLength[0],
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            ],
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Hide watched videos at (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Off"
                      value={
                        draft.options.percent_watched_hide === null
                          ? ""
                          : String(draft.options.percent_watched_hide)
                      }
                      onChange={(e) =>
                        patchOption(
                          "percent_watched_hide",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Blocked playback message
                  <input
                    value={String(draft.options.block_message)}
                    maxLength={500}
                    onChange={(e) =>
                      patchOption("block_message", e.target.value)
                    }
                  />
                </label>
              </section>
              <section className="settings-section">
                <h2>Advanced filtering</h2>
                <label className="setting-row">
                  <span>
                    <strong>Custom JavaScript filter</strong>
                    <small>
                      Only use code you trust. Code runs in YouTube's page
                      context.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    className="native-switch"
                    checked={Boolean(draft.options.enable_javascript)}
                    onChange={(e) =>
                      patchOption("enable_javascript", e.target.checked)
                    }
                  />
                </label>
                <label>
                  Filter function
                  <textarea
                    rows={7}
                    spellCheck={false}
                    className="code-input"
                    placeholder="(metadata, kind, record) => false"
                    value={draft.filterData.javascript}
                    onChange={(e) =>
                      setDraft((s) => ({
                        ...s,
                        filterData: {
                          ...s.filterData,
                          javascript: e.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <p className="help">
                  Receives metadata (title, channelName, channelId, videoId,
                  comment), the renderer kind, and its original record. Return
                  true, "hide", or "blur" to match. Browser policy may restrict
                  execution. Never paste untrusted code.
                </p>
              </section>
            </>
          )}
          {tab === "security" && (
            <>
              <section className="privacy-card">
                <ShieldCheck size={25} />
                <div>
                  <h2>Private by default.</h2>
                  <p>
                    Your rules and preferences live in your browser. YouBlock
                    doesn't need an account or send your rules to a server.
                    Optional YouTube feedback is controlled in Preferences.
                  </p>
                </div>
              </section>
              <section className="settings-section">
                <div className="section-toolbar">
                  <h2>Protect your settings</h2>
                  <span className="action-label">
                    {state.protected ? "Password enabled" : "No password"}
                  </span>
                </div>
                <p className="muted">
                  A password gates changes in YouBlock. It doesn't stop the
                  browser owner from removing or resetting the extension.
                </p>
                {dirty && (
                  <p className="help">
                    Save or discard your changes before changing password
                    protection.
                  </p>
                )}
                <form
                  className="password-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      if (newPassword.length < 8)
                        throw new Error("Use at least 8 characters.");
                      if (newPassword !== confirmPassword)
                        throw new Error("The passwords do not match.");
                      await api.password(newPassword);
                      setNewPassword("");
                      setConfirmPassword("");
                      await refresh();
                      setNotice(
                        "Password saved. Lock settings when you are finished.",
                      );
                    });
                  }}
                >
                  <label>
                    {state.protected ? "New password" : "Choose a password"}
                    <input
                      type="password"
                maxLength={1024}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </label>
                  <label>
                    Confirm password
                    <input
                      type="password"
                maxLength={1024}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </label>
                  <button className="button" disabled={busy || Boolean(dirty)}>
                    <LockKeyhole size={16} />
                    {state.protected ? "Change password" : "Set password"}
                  </button>
                </form>
                {state.protected && (
                  <button
                    className="text-button"
                    disabled={busy || Boolean(dirty)}
                    onClick={() => {
                      if (
                        confirm("Remove the password from YouBlock settings?")
                      )
                        void run(async () => {
                          await api.password("");
                          await refresh();
                          setNotice("Password removed.");
                        });
                    }}
                  >
                    Remove password
                  </button>
                )}
              </section>
              <section className="settings-section danger-zone">
                <h2>Start over</h2>
                <p className="muted">
                  Delete all rules, preferences, and your password. Export a
                  backup first if you want to keep your rules.
                </p>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Permanently delete every YouBlock rule, preference, and password?",
                      )
                    )
                      void run(async () => {
                        await api.reset();
                        await refresh();
                        setNotice("YouBlock has been reset.");
                      });
                  }}
                >
                  <Trash2 size={16} />
                  Reset YouBlock
                </button>
              </section>
            </>
          )}
          <div className="page-footer">
            <span>Less noise. More intention.</span>
            <span>YouBlock · MIT</span>
          </div>
        </div>
        {dirty && (
          <div className="save-bar" role="status">
            <span>
              <span className="unsaved-dot" />
              Unsaved changes
            </span>
            <div>
              <button
                className="button small"
                disabled={busy}
                onClick={() => setDraft(state.settings)}
              >
                Discard
              </button>
              <button
                className="button primary small"
                disabled={busy}
                onClick={() => void run(() => save())}
              >
                {busy ? "Saving…" : "Save changes"}
                <Check size={16} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
