import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScrollLock } from '../hooks/smoothScroll';
import { bytesToB64, checkAccess, readText, utf8ToB64, writeFile, type Creds } from './github';

/**
 * Hidden owner editor. It is code-split (loaded only when the owner opens it) and does
 * nothing without a GitHub token. It edits `src/data/content.json` — the same file the
 * public site is built from — so every change keeps the exact format of the site.
 */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
type Upload = (file: File, key: string) => Promise<string>;
type Status = { kind: 'idle' | 'busy' | 'ok' | 'err'; msg: string };

const DATA_PATH = 'src/data/content.json';
const STORE_KEY = 'owner-session';

const TABS: { key: string; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'education', label: 'Education' },
  { key: 'experience', label: 'Experience' },
  { key: 'projects', label: 'Projects' },
  { key: 'achievements', label: 'Certificates' },
  { key: 'skillCategories', label: 'Skills' },
  { key: 'seasons', label: 'Journey' },
  { key: 'topPicks', label: 'Highlights' },
  { key: 'introSlides', label: 'Intro reel' },
];

const LONG = new Set(['intro', 'logline', 'detail', 'description', 'synopsis']);
const FILE_KEYS = new Set(['link', 'resumePdf', 'src']);
const COLOR_KEYS = new Set(['from', 'via', 'to', 'accent']);
const ENUMS: Record<string, string[]> = { motif: ['shield', 'flow', 'tenants'] };
const STRING_LISTS = new Set(['tags', 'stack', 'build', 'features', 'lines', 'chips', 'points', 'tagline', 'interests']);
const SHORT_LISTS = new Set(['tags', 'stack', 'chips', 'tagline', 'interests']);
const TITLE_KEYS = ['title', 'name', 'school', 'company', 'label', 'kicker', 'code', 'id'];

const pretty = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const newId = () => `item-${Date.now().toString(36)}`;
const isObj = (v: Json): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function blank(v: Json, key = ''): Json {
  if (typeof v === 'string') {
    if (key === 'id') return newId();
    if (COLOR_KEYS.has(key) || key in ENUMS) return v;
    return '';
  }
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return [];
  if (isObj(v)) {
    const o: Obj = {};
    for (const k of Object.keys(v)) o[k] = blank(v[k], k);
    return o;
  }
  return null;
}

function labelOf(v: Json, i: number): string {
  if (typeof v === 'string') return v || `Item ${i + 1}`;
  if (isObj(v)) {
    for (const k of TITLE_KEYS) {
      const x = v[k];
      if (typeof x === 'string' && x) return x;
    }
  }
  return `Item ${i + 1}`;
}

/** Optional fields a card may not have yet, so they can be added later. */
function optionalFor(o: Obj): { key: string; initial: Json }[] {
  const out: { key: string; initial: Json }[] = [];
  if ('stack' in o) out.push({ key: 'website', initial: '' }, { key: 'github', initial: '' });
  if ('laurel' in o) out.push({ key: 'link', initial: '' });
  if ('kicker' in o) out.push({ key: 'chips', initial: [] });
  if ('mono' in o) out.push({ key: 'note', initial: '' });
  return out.filter((x) => !(x.key in o));
}

const inputCls = 'w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-bone outline-none focus:border-crimson-2';
const btnCls = 'rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-bone hover:bg-white/15 disabled:opacity-40';

/* ───────────────────────── generic editor ───────────────────────── */

function Editor({ name, value, onChange, onUpload }: { name: string; value: Json; onChange: (v: Json) => void; onUpload: Upload }) {
  if (typeof value === 'string') return <StringField name={name} value={value} onChange={onChange} onUpload={onUpload} />;
  if (typeof value === 'number') {
    return <input type="number" className={inputCls} value={value} onChange={(e) => onChange(Number(e.target.value))} />;
  }
  if (typeof value === 'boolean') {
    return <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (Array.isArray(value)) return <ArrayField name={name} value={value} onChange={onChange} onUpload={onUpload} />;
  if (isObj(value)) return <ObjectField value={value} onChange={onChange} onUpload={onUpload} />;
  return null;
}

function StringField({ name, value, onChange, onUpload }: { name: string; value: string; onChange: (v: Json) => void; onUpload: Upload }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (COLOR_KEYS.has(name)) {
    const swatch = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
    return (
      <div className="flex items-center gap-2">
        <input type="color" value={swatch} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 shrink-0 cursor-pointer rounded bg-transparent" aria-label={`${name} colour`} />
        <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (ENUMS[name]) {
    return (
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {ENUMS[name].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (LONG.has(name)) {
    return <textarea className={inputCls} rows={4} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  if (FILE_KEYS.has(name)) {
    const pick = async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      setErr('');
      try {
        onChange(await onUpload(file, name));
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    };
    return (
      <div>
        <div className="flex items-center gap-2">
          <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/certificates/file.pdf or https://…" />
          <button type="button" className={`${btnCls} shrink-0`} disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Uploading…' : '⤒ Upload'}
          </button>
          {value.startsWith('/') && (
            <a className={`${btnCls} shrink-0`} href={value} target="_blank" rel="noreferrer">
              Open ↗
            </a>
          )}
          <input ref={fileRef} type="file" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
        {err && <p className="mt-1 text-xs text-crimson-2">{err}</p>}
      </div>
    );
  }
  return <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function ArrayField({ name, value, onChange, onUpload }: { name: string; value: Json[]; onChange: (v: Json) => void; onUpload: Upload }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const isStrings = value.length > 0 ? value.every((v) => typeof v === 'string') : STRING_LISTS.has(name);

  const set = (i: number, v: Json) => onChange(value.map((x, n) => (n === i ? v : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const n = [...value];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  const remove = (i: number) => {
    if (window.confirm('Remove this item?')) onChange(value.filter((_, n) => n !== i));
  };
  const duplicate = (i: number) => {
    const c = clone(value[i]);
    if (isObj(c) && typeof c.id === 'string') c.id = newId();
    const n = [...value];
    n.splice(i + 1, 0, c);
    onChange(n);
    setOpenIdx(i + 1);
  };
  const add = () => {
    if (isStrings) {
      onChange([...value, '']);
    } else {
      onChange([...value, value.length ? blank(value[value.length - 1]) : {}]);
      setOpenIdx(value.length);
    }
  };

  const tools = (i: number) => (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" className={btnCls} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
      <button type="button" className={btnCls} onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move down">↓</button>
      {!isStrings && <button type="button" className={btnCls} onClick={() => duplicate(i)} aria-label="Duplicate">⧉</button>}
      <button type="button" className={`${btnCls} text-crimson-2`} onClick={() => remove(i)} aria-label="Remove">✕</button>
    </span>
  );

  return (
    <div className="space-y-2">
      {value.map((item, i) =>
        isStrings ? (
          <div key={i} className="flex items-start gap-2">
            {SHORT_LISTS.has(name) ? (
              <input className={inputCls} value={String(item)} onChange={(e) => set(i, e.target.value)} />
            ) : (
              <textarea className={inputCls} rows={2} value={String(item)} onChange={(e) => set(i, e.target.value)} />
            )}
            {tools(i)}
          </div>
        ) : (
          <details key={i} open={openIdx === i} className="rounded-lg border border-white/10 bg-white/[0.03]">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5">
              <span className="truncate text-sm font-semibold text-bone">{labelOf(item, i)}</span>
              {tools(i)}
            </summary>
            <div className="border-t border-white/10 p-3">
              <Editor name={name} value={item} onChange={(v) => set(i, v)} onUpload={onUpload} />
            </div>
          </details>
        ),
      )}
      <button type="button" className={btnCls} onClick={add}>
        + Add {isStrings ? 'line' : 'new item'}
      </button>
    </div>
  );
}

function ObjectField({ value, onChange, onUpload }: { value: Obj; onChange: (v: Json) => void; onUpload: Upload }) {
  const extras = optionalFor(value);
  return (
    <div className="space-y-4">
      {Object.keys(value).map((k) => {
        const v = value[k];
        const nested = typeof v === 'object' && v !== null;
        return (
          <div key={k}>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.18em] text-mist">{pretty(k)}</label>
            <div className={nested && !Array.isArray(v) ? 'rounded-lg border border-white/10 p-3' : ''}>
              <Editor name={k} value={v} onChange={(nv) => onChange({ ...value, [k]: nv })} onUpload={onUpload} />
            </div>
          </div>
        );
      })}
      {extras.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {extras.map((x) => (
            <button key={x.key} type="button" className={btnCls} onClick={() => onChange({ ...value, [x.key]: x.initial })}>
              + {pretty(x.key)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── unlock + shell ───────────────────────── */

type Session = { creds: Creds; sha: string; text: string };

function readStored(): Creds | null {
  try {
    const raw = localStorage.getItem(STORE_KEY) ?? sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Creds) : null;
  } catch {
    return null;
  }
}

function Unlock({ onUnlocked, onClose }: { onUnlocked: (s: Session, remember: boolean) => void; onClose: () => void }) {
  const stored = useMemo(readStored, []);
  const [repo, setRepo] = useState(stored?.repo ?? '');
  const [branch, setBranch] = useState(stored?.branch ?? 'main');
  const [token, setToken] = useState(stored?.token ?? '');
  const [remember, setRemember] = useState(() => {
    try {
      return localStorage.getItem(STORE_KEY) !== null;
    } catch {
      return false;
    }
  });
  const [status, setStatus] = useState<Status>({ kind: 'idle', msg: '' });

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const creds: Creds = { repo: repo.trim(), branch: branch.trim() || 'main', token: token.trim() };
    if (!/^[\w.-]+\/[\w.-]+$/.test(creds.repo)) return setStatus({ kind: 'err', msg: 'Enter the repository as owner/name, e.g. DurgeshMishra09/portfolio.' });
    if (!creds.token) return setStatus({ kind: 'err', msg: 'Paste your GitHub token.' });
    setStatus({ kind: 'busy', msg: 'Checking access…' });
    try {
      await checkAccess(creds);
      const file = await readText(creds, DATA_PATH);
      onUnlocked({ creds, sha: file.sha, text: file.text }, remember);
    } catch (err) {
      setStatus({ kind: 'err', msg: err instanceof Error ? err.message : 'Could not unlock.' });
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="m-auto w-[min(92vw,460px)] space-y-4 rounded-2xl border border-white/10 bg-ink-2 p-6">
      <h2 className="font-display text-3xl tracking-wide text-bone">Owner access</h2>
      <p className="text-xs leading-relaxed text-mist">
        Only someone holding your GitHub token can change this site. The token stays in this browser and is sent only to GitHub.
      </p>
      <input className={inputCls} placeholder="owner/repository" value={repo} onChange={(e) => setRepo(e.target.value)} autoComplete="off" />
      <input className={inputCls} placeholder="branch (main)" value={branch} onChange={(e) => setBranch(e.target.value)} autoComplete="off" />
      <input className={inputCls} type="password" placeholder="GitHub token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
      <label className="flex items-center gap-2 text-xs text-mist">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device (leave off on shared computers)
      </label>
      {status.msg && <p className={`text-xs ${status.kind === 'err' ? 'text-crimson-2' : 'text-mist'}`}>{status.msg}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-crimson px-4 py-2 text-sm font-bold text-bone disabled:opacity-50" disabled={status.kind === 'busy'}>
          Unlock
        </button>
        <button type="button" className={btnCls} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Panel({ session, onSignOut, onClose }: { session: Session; onSignOut: () => void; onClose: (dirty: boolean) => void }) {
  const initial = useMemo(() => JSON.parse(session.text) as Obj, [session.text]);
  const [data, setData] = useState<Obj>(initial);
  const [savedText, setSavedText] = useState(() => JSON.stringify(initial, null, 2));
  const [sha, setSha] = useState(session.sha);
  const [tab, setTab] = useState(TABS[0].key);
  const [status, setStatus] = useState<Status>({ kind: 'idle', msg: '' });

  const text = useMemo(() => JSON.stringify(data, null, 2), [data]);
  const dirty = text !== savedText;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose(dirty);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, onClose]);

  const onUpload: Upload = useCallback(
    async (file, key) => {
      if (file.size > 20 * 1024 * 1024) throw new Error('That file is larger than 20 MB.');
      const folder = key === 'link' ? 'certificates' : 'assets';
      const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || `file-${Date.now()}`;
      setStatus({ kind: 'busy', msg: `Uploading ${safe}…` });
      try {
        await writeFile(session.creds, `public/${folder}/${safe}`, bytesToB64(await file.arrayBuffer()), `Upload ${safe} (owner editor)`);
        setStatus({ kind: 'ok', msg: `Uploaded ${safe}. Click “Save to site” to publish the change that uses it.` });
        return `/${folder}/${safe}`;
      } catch (e) {
        setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Upload failed' });
        throw e;
      }
    },
    [session.creds],
  );

  const save = async () => {
    setStatus({ kind: 'busy', msg: 'Saving to GitHub…' });
    try {
      const out = `${text}\n`;
      const newSha = await writeFile(session.creds, DATA_PATH, utf8ToB64(out), 'Update portfolio content (owner editor)', sha);
      setSha(newSha);
      setSavedText(text);
      setStatus({ kind: 'ok', msg: 'Saved. The live site updates when your host finishes redeploying (usually 1–2 minutes).' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Save failed' });
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'content.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const revert = () => {
    if (dirty && window.confirm('Discard all unsaved changes?')) setData(JSON.parse(savedText) as Obj);
  };

  const current = data[tab];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="font-display text-2xl tracking-wide text-bone">Owner editor</p>
          <p className="truncate text-[11px] text-smoke">{session.creds.repo} · {session.creds.branch}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${dirty ? 'text-amber-300' : 'text-smoke'}`}>{dirty ? '● Unsaved changes' : 'All changes saved'}</span>
          <button type="button" className={btnCls} onClick={revert} disabled={!dirty}>Discard</button>
          <button type="button" className={btnCls} onClick={download}>⤓ Backup JSON</button>
          <button type="button" className="rounded-md bg-crimson px-4 py-2 text-xs font-bold text-bone disabled:opacity-40" onClick={() => void save()} disabled={!dirty || status.kind === 'busy'}>
            Save to site
          </button>
          <button type="button" className={btnCls} onClick={onSignOut}>Sign out</button>
          <button type="button" className={btnCls} onClick={() => onClose(dirty)} aria-label="Close editor">✕</button>
        </div>
      </header>
      {status.msg && (
        <p className={`px-4 py-2 text-xs ${status.kind === 'err' ? 'bg-crimson/20 text-crimson-2' : status.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-mist'}`}>{status.msg}</p>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2 md:w-48 md:flex-col md:border-b-0 md:border-r">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-semibold ${tab === t.key ? 'bg-white/10 text-bone' : 'text-mist hover:bg-white/5'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto p-4 pb-24">
          <div className="mx-auto max-w-3xl">
            {current === undefined ? (
              <p className="text-sm text-mist">This section is not in content.json.</p>
            ) : (
              <Editor name={tab} value={current} onChange={(v) => setData({ ...data, [tab]: v })} onUpload={onUpload} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function OwnerEditor({ onClose }: { onClose: () => void }) {
  useScrollLock(true);
  const [session, setSession] = useState<Session | null>(null);

  const unlocked = (s: Session, remember: boolean) => {
    try {
      localStorage.removeItem(STORE_KEY);
      sessionStorage.removeItem(STORE_KEY);
      (remember ? localStorage : sessionStorage).setItem(STORE_KEY, JSON.stringify(s.creds));
    } catch {
      /* storage unavailable — the token just won't be remembered */
    }
    setSession(s);
  };
  const signOut = () => {
    try {
      localStorage.removeItem(STORE_KEY);
      sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* nothing to clear */
    }
    setSession(null);
  };
  const close = useCallback(
    (dirty: boolean) => {
      if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return;
      onClose();
    },
    [onClose],
  );

  return (
    <div className="owner-root fixed inset-0 z-[300] flex flex-col bg-ink text-bone" role="dialog" aria-modal="true" aria-label="Owner editor">
      <style>{`.owner-root, .owner-root * { cursor: auto !important; } .owner-root button, .owner-root summary, .owner-root select, .owner-root input[type='color'], .owner-root input[type='file'] { cursor: pointer !important; }`}</style>
      {session ? <Panel session={session} onSignOut={signOut} onClose={close} /> : <Unlock onUnlocked={unlocked} onClose={() => onClose()} />}
    </div>
  );
}
