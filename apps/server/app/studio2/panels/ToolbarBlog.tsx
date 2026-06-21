'use client';

import { useEffect, useState } from 'react';

/**
 * Studio v2 "blog" tab — admin posting UI for the "While you wait"
 * right-rail feed on /generate. Auth is the studio gate
 * (STUDIO_ALLOWED_EMAILS) shared with the rest of /studio2.
 *
 * Server contract:
 *   GET    /api/admin/blog          — list everything
 *   POST   /api/admin/blog          — create
 *   PATCH  /api/admin/blog/[id]     — partial edit + publish toggle
 *   DELETE /api/admin/blog/[id]     — hard delete
 *
 * A row carries either `body` (article) or `playerScriptId` (player
 * link). The XOR is enforced server-side; the form mirrors it with a
 * radio so editors don't accidentally fill both.
 */

type BlogEntry = {
  id: string;
  kind: string;
  title: string;
  excerpt: string;
  body: string | null;
  playerScriptId: string | null;
  playerUrl: string | null;
  published: boolean;
  postedAt: string;
  createdAt: string;
  updatedAt: string;
  // SEO & metadata — populated only for article-mode entries; nullable
  // on the server too. The editor surfaces these behind a collapsible
  // section when content mode is 'body'.
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  keywords: string | null;
  author: string | null;
  tags: string | null;
};

type ContentMode = 'body' | 'script' | 'url';

const KIND_OPTIONS = ['research', 'walkthrough'];

export function ToolbarBlog() {
  const [entries, setEntries] = useState<BlogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BlogEntry | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    try {
      const r = await fetch('/api/admin/blog', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { entries: BlogEntry[] };
      setEntries(data.entries);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const togglePublished = async (entry: BlogEntry) => {
    try {
      const r = await fetch(`/api/admin/blog/${entry.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !entry.published }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (entry: BlogEntry) => {
    if (!confirm(`Delete "${entry.title}"? This can't be undone.`)) return;
    try {
      const r = await fetch(`/api/admin/blog/${entry.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (creating || editing) {
    return (
      <BlogEditor
        initial={editing}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async () => {
          setCreating(false);
          setEditing(null);
          await refresh();
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong>While-you-wait entries</strong>
        <button onClick={() => setCreating(true)}>+ new entry</button>
        <button onClick={() => void refresh()}>refresh</button>
        {error && (
          <span style={{ color: '#f87171' }}>error: {error}</span>
        )}
      </div>

      {entries === null ? (
        <span className="sb-toolbar-label">loading…</span>
      ) : entries.length === 0 ? (
        <span className="sb-toolbar-label">no entries yet</span>
      ) : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.7 }}>
              <th style={{ padding: '4px 8px' }}>state</th>
              <th style={{ padding: '4px 8px' }}>kind</th>
              <th style={{ padding: '4px 8px' }}>title</th>
              <th style={{ padding: '4px 8px' }}>content</th>
              <th style={{ padding: '4px 8px' }}>postedAt</th>
              <th style={{ padding: '4px 8px' }} />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <td style={{ padding: '4px 8px' }}>
                  <button onClick={() => void togglePublished(e)}>
                    {e.published ? '● published' : '○ draft'}
                  </button>
                </td>
                <td style={{ padding: '4px 8px' }}>{e.kind}</td>
                <td style={{ padding: '4px 8px' }}>{e.title}</td>
                <td style={{ padding: '4px 8px' }}>
                  {e.playerUrl
                    ? 'share url'
                    : e.playerScriptId
                      ? `script ${e.playerScriptId.slice(0, 8)}…`
                      : 'article'}
                </td>
                <td style={{ padding: '4px 8px' }}>
                  {new Date(e.postedAt).toLocaleString()}
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <button onClick={() => setEditing(e)}>edit</button>
                  <button onClick={() => void remove(e)}>delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BlogEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial: BlogEntry | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState(initial?.kind ?? 'research');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
  const [mode, setMode] = useState<ContentMode>(
    initial?.playerUrl
      ? 'url'
      : initial?.playerScriptId
        ? 'script'
        : 'body',
  );
  const [body, setBody] = useState(initial?.body ?? '');
  const [playerScriptId, setPlayerScriptId] = useState(
    initial?.playerScriptId ?? '',
  );
  const [playerUrl, setPlayerUrl] = useState(initial?.playerUrl ?? '');
  const [published, setPublished] = useState(initial?.published ?? false);
  const [postedAt, setPostedAt] = useState(
    toLocalInput(initial?.postedAt ?? new Date().toISOString()),
  );
  // SEO & metadata. All optional — empty string is sent as null so the
  // server clears the column rather than storing "".
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [metaTitle, setMetaTitle] = useState(initial?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(
    initial?.metaDescription ?? '',
  );
  const [ogImage, setOgImage] = useState(initial?.ogImage ?? '');
  const [keywords, setKeywords] = useState(initial?.keywords ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [tags, setTags] = useState(initial?.tags ?? '');
  // Track whether the user has hand-edited the slug. If they haven't,
  // we keep auto-filling it from the title so the common case is one
  // less field to think about.
  const [slugTouched, setSlugTouched] = useState(
    Boolean(initial?.slug && initial.slug.length > 0),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Empty string → null so the server clears the column. SEO fields
  // are only meaningful for article-mode entries; for player-link modes
  // we send null across the board so toggling modes doesn't leave stale
  // SEO data behind.
  const orNull = (v: string) => (v.trim().length === 0 ? null : v.trim());

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const seo =
        mode === 'body'
          ? {
              slug: orNull(slug),
              metaTitle: orNull(metaTitle),
              metaDescription: orNull(metaDescription),
              ogImage: orNull(ogImage),
              keywords: orNull(keywords),
              author: orNull(author),
              tags: orNull(tags),
            }
          : {
              slug: null,
              metaTitle: null,
              metaDescription: null,
              ogImage: null,
              keywords: null,
              author: null,
              tags: null,
            };
      const payload = {
        kind,
        title,
        excerpt,
        body: mode === 'body' ? body : null,
        playerScriptId: mode === 'script' ? playerScriptId : null,
        playerUrl: mode === 'url' ? playerUrl : null,
        published,
        postedAt: new Date(postedAt).toISOString(),
        ...seo,
      };
      const url = initial
        ? `/api/admin/blog/${initial.id}`
        : '/api/admin/blog';
      const r = await fetch(url, {
        method: initial ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => null);
        throw new Error(detail?.message ?? detail?.error ?? `HTTP ${r.status}`);
      }
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 720 }}>
      <strong>{initial ? 'Edit entry' : 'New entry'}</strong>

      <label style={field}>
        <span style={fieldLabel}>kind</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <label style={field}>
        <span style={fieldLabel}>title</span>
        <input
          value={title}
          onChange={(e) => {
            const next = e.target.value;
            setTitle(next);
            // Keep the slug in sync with the title until the editor
            // hand-edits the slug field. After that, leave it alone.
            if (!slugTouched) setSlug(slugifyClient(next));
          }}
        />
      </label>

      <label style={field}>
        <span style={fieldLabel}>excerpt</span>
        <input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
      </label>

      <fieldset style={{ border: '1px solid rgba(255,255,255,0.15)', padding: 8 }}>
        <legend>content</legend>
        <label style={{ marginRight: 12 }}>
          <input
            type="radio"
            checked={mode === 'body'}
            onChange={() => setMode('body')}
          />{' '}
          article body
        </label>
        <label style={{ marginRight: 12 }}>
          <input
            type="radio"
            checked={mode === 'url'}
            onChange={() => setMode('url')}
          />{' '}
          player share URL
        </label>
        <label>
          <input
            type="radio"
            checked={mode === 'script'}
            onChange={() => setMode('script')}
          />{' '}
          player script id (legacy)
        </label>

        {mode === 'body' && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Markdown or plain text"
            rows={10}
            style={{ width: '100%', marginTop: 8, fontFamily: 'inherit' }}
          />
        )}
        {mode === 'url' && (
          <input
            value={playerUrl}
            onChange={(e) => setPlayerUrl(e.target.value)}
            placeholder="Paste full Share URL (e.g. /viewer/abc?token=...&voice=google-neural2)"
            style={{ width: '100%', marginTop: 8 }}
          />
        )}
        {mode === 'script' && (
          <input
            value={playerScriptId}
            onChange={(e) => setPlayerScriptId(e.target.value)}
            placeholder="Script id (cuid) — links to /viewer/[id]"
            style={{ width: '100%', marginTop: 8 }}
          />
        )}
      </fieldset>

      <label style={field}>
        <span style={fieldLabel}>postedAt</span>
        <input
          type="datetime-local"
          value={postedAt}
          onChange={(e) => setPostedAt(e.target.value)}
        />
      </label>

      <label style={field}>
        <span style={fieldLabel}>published</span>
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
      </label>

      {mode === 'body' && (
        <details
          style={{
            border: '1px solid rgba(255,255,255,0.15)',
            padding: 8,
            borderRadius: 4,
          }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            SEO &amp; metadata
          </summary>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginTop: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  // One-shot fill: derive slug from title, metaDescription
                  // from the body's first ~155 chars (with ellipsis if
                  // truncated). Leaves any field the editor already
                  // populated alone — only fills empties.
                  if (!slug && title) {
                    setSlug(slugifyClient(title));
                    setSlugTouched(true);
                  }
                  if (!metaDescription && body) {
                    const flat = body.replace(/\s+/g, ' ').trim();
                    setMetaDescription(
                      flat.length > 155 ? `${flat.slice(0, 152)}…` : flat,
                    );
                  }
                  if (!metaTitle && title) setMetaTitle(title);
                }}
              >
                Generate from content
              </button>
              <span style={{ opacity: 0.6, alignSelf: 'center', fontSize: 12 }}>
                Fills empty fields from title + body. Won&apos;t overwrite.
              </span>
            </div>

            <label style={field}>
              <span style={fieldLabel}>slug</span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                placeholder={title ? slugifyClient(title) : 'auto from title'}
              />
            </label>

            <label style={field}>
              <span style={fieldLabel}>
                meta title{' '}
                <CountChip current={metaTitle.length} ideal={60} hard={70} />
              </span>
              <input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={title || 'falls back to title'}
              />
            </label>

            <label style={field}>
              <span style={fieldLabel}>
                meta description{' '}
                <CountChip
                  current={metaDescription.length}
                  ideal={160}
                  hard={180}
                />
              </span>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder={excerpt || 'falls back to excerpt'}
                rows={3}
                style={{ fontFamily: 'inherit' }}
              />
            </label>

            <label style={field}>
              <span style={fieldLabel}>OG image URL</span>
              <input
                value={ogImage}
                onChange={(e) => setOgImage(e.target.value)}
                placeholder="https://… 1200×630 social card"
              />
            </label>

            <label style={field}>
              <span style={fieldLabel}>author</span>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Byline shown in JSON-LD and the article footer"
              />
            </label>

            <label style={field}>
              <span style={fieldLabel}>keywords</span>
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="comma, separated, keywords"
              />
            </label>

            <label style={field}>
              <span style={fieldLabel}>tags</span>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="comma, separated, tags"
              />
            </label>

            <SnippetPreview
              title={metaTitle || title}
              description={metaDescription || excerpt}
              slug={slug || (title ? slugifyClient(title) : '')}
            />
          </div>
        </details>
      )}

      {error && <span style={{ color: '#f87171' }}>error: {error}</span>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => void submit()} disabled={saving}>
          {saving ? 'saving…' : initial ? 'save' : 'create'}
        </button>
        <button onClick={onCancel} disabled={saving}>
          cancel
        </button>
      </div>
    </div>
  );
}

const field = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  alignItems: 'center',
  gap: 8,
} as const;

const fieldLabel = { opacity: 0.7 } as const;

/** ISO → value string suitable for <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Client-side mirror of lib/blog/write.ts#slugify. Used only as a UX
 * convenience (placeholder, auto-fill while typing, preview URL).
 * The server re-runs its own slugify + uniqueness check on save, so
 * this doesn't need to match byte-for-byte.
 */
function slugifyClient(s: string): string {
  const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Tiny char-counter chip rendered next to field labels. Turns yellow
 * once you cross the "ideal" threshold (search engines start to
 * truncate) and red once you cross the "hard" cap.
 */
function CountChip({
  current,
  ideal,
  hard,
}: {
  current: number;
  ideal: number;
  hard: number;
}) {
  const color =
    current === 0
      ? '#888'
      : current > hard
        ? '#f87171'
        : current > ideal
          ? '#facc15'
          : '#4ade80';
  return (
    <span
      style={{
        marginLeft: 6,
        fontSize: 11,
        fontWeight: 400,
        color,
        opacity: 0.85,
      }}
    >
      {current}/{ideal}
    </span>
  );
}

/**
 * Mock-Google search snippet. Helps editors see what a post will
 * actually look like in search results and tune title/description
 * length without leaving the form.
 */
function SnippetPreview({
  title,
  description,
  slug,
}: {
  title: string;
  description: string;
  slug: string;
}) {
  // Soft truncation matches what Google does at the bounds — the chip
  // counts already warn the editor, this is purely a visual cue.
  const displayTitle =
    title.length > 60 ? `${title.slice(0, 57)}…` : title || '(no title)';
  const displayDesc =
    description.length > 160
      ? `${description.slice(0, 157)}…`
      : description || '(no description)';
  const displayUrl = `Lenzon.ai › blog › ${slug || '(slug)'}`;
  return (
    <div
      style={{
        marginTop: 8,
        padding: 12,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        fontFamily:
          'arial, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
        Search preview
      </div>
      <div style={{ fontSize: 12, color: '#9ca3af' }}>{displayUrl}</div>
      <div
        style={{
          fontSize: 18,
          color: '#93c5fd',
          marginTop: 2,
          lineHeight: 1.3,
        }}
      >
        {displayTitle}
      </div>
      <div
        style={{
          fontSize: 13,
          color: '#d1d5db',
          marginTop: 4,
          lineHeight: 1.4,
        }}
      >
        {displayDesc}
      </div>
    </div>
  );
}
