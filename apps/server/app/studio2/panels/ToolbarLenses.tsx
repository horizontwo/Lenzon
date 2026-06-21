'use client';

import { useEffect, useState } from 'react';

/**
 * Studio v2 "lenses" tab — admin UI for AnalystLens rows: edit a lens
 * prompt + its knowledge documents, publish the edit as a fork, view
 * version history, and reset to the seeded built-in.
 *
 * Phase E2 of the gnome migration. Replaces the old read-only "agents"
 * tab, which read the legacy Gnome table (no longer the live read
 * source post-D cutover).
 *
 * Server contract (all gated by STUDIO_ALLOWED_EMAILS):
 *   GET  /api/admin/lenses              — slugs with current + history
 *   POST /api/admin/lenses              — publish an edit as a fork
 *   POST /api/admin/lenses/[id]/reset   — roll back to the built-in
 */

type KnowledgeDoc = {
  contentHash: string;
  title: string;
  content: string;
  position: number;
};

type LensVersion = {
  id: string;
  version: string;
  name: string;
  description: string;
  isCurrent: boolean;
  isBuiltIn: boolean;
  createdAt: string;
};

type LensGroup = {
  slug: string;
  defaultModel: string;
  /** True when the slug is registered in code but has no row yet — show
   * an "add lens" button instead of the no-current-row diagnostic. */
  addable: boolean;
  current: {
    id: string;
    version: string;
    name: string;
    description: string;
    defaultModel: string;
    systemPromptTemplate: string;
    isBuiltIn: boolean;
    externalAgentId: string | null;
    knowledge: KnowledgeDoc[];
  } | null;
  history: LensVersion[];
};

export function ToolbarLenses() {
  const [groups, setGroups] = useState<LensGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const r = await fetch('/api/admin/lenses', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { lenses: LensGroup[] };
      setGroups(data.lenses);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const addLens = async (slug: string) => {
    try {
      const r = await fetch('/api/admin/lenses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', slug }),
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => null);
        throw new Error(detail?.message ?? detail?.error ?? `HTTP ${r.status}`);
      }
      // The slug now has a current row; refresh so editingGroup resolves,
      // then open the editor straight onto the starter row.
      await refresh();
      setEditingSlug(slug);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const reset = async (lensId: string, slug: string) => {
    if (!confirm(`Reset ${slug} to its built-in lens? The fork is kept in history.`))
      return;
    try {
      const r = await fetch(`/api/admin/lenses/${lensId}/reset`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => null);
        throw new Error(detail?.detail ?? detail?.error ?? `HTTP ${r.status}`);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const editingGroup = groups?.find((g) => g.slug === editingSlug) ?? null;
  if (editingGroup) {
    return (
      <LensEditor
        group={editingGroup}
        onCancel={() => setEditingSlug(null)}
        onSaved={async () => {
          setEditingSlug(null);
          await refresh();
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong>Analyst lenses</strong>
        <button onClick={() => void refresh()}>refresh</button>
        {error && <span style={{ color: '#f87171' }}>error: {error}</span>}
      </div>

      {groups === null ? (
        <span className="sb-toolbar-label">loading…</span>
      ) : groups.length === 0 ? (
        <span className="sb-toolbar-label">no lenses in database</span>
      ) : (
        groups.map((g) => (
          <div
            key={g.slug}
            style={{
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <code style={{ fontWeight: 700 }}>{g.slug}</code>
              {g.current ? (
                <Badge builtIn={g.current.isBuiltIn} />
              ) : g.addable ? (
                <span style={{ color: '#9ca3af', fontSize: 12 }}>
                  not yet created
                </span>
              ) : (
                <span style={{ color: '#f87171', fontSize: 12 }}>
                  no current row — run seed-lenses
                </span>
              )}
              <span style={{ flex: 1 }} />
              {g.addable && (
                <button
                  title="Create the first row for this registered lens"
                  onClick={() => void addLens(g.slug)}
                >
                  add lens
                </button>
              )}
              <button
                disabled={!g.current}
                onClick={() => setEditingSlug(g.slug)}
              >
                edit
              </button>
              <button
                disabled={!g.current || g.current.isBuiltIn}
                title={
                  g.current?.isBuiltIn
                    ? 'Already on the built-in lens'
                    : 'Roll back to the built-in lens'
                }
                onClick={() =>
                  g.current && void reset(g.current.id, g.slug)
                }
              >
                reset to built-in
              </button>
            </div>
            {g.current && (
              <dl className="sb-agents-meta">
                <div>
                  <dt>version</dt>
                  <dd>
                    <code>{g.current.version}</code>
                  </dd>
                </div>
                <div>
                  <dt>model</dt>
                  <dd>
                    <code>{g.current.defaultModel}</code>
                  </dd>
                </div>
                <div>
                  <dt>knowledge</dt>
                  <dd>{g.current.knowledge.length} doc(s)</dd>
                </div>
                <div>
                  <dt>external agent</dt>
                  <dd>
                    {g.current.externalAgentId ? (
                      <code>{g.current.externalAgentId}</code>
                    ) : (
                      <span
                        style={{ color: '#facc15', fontSize: 12 }}
                        title="This lens has no Managed Agents identity, so /api/analyze and /api/triage cannot run it yet."
                      >
                        — not runnable — needs a managed agent
                      </span>
                    )}
                  </dd>
                </div>
                <div className="sb-agents-meta-wide">
                  <dt>name</dt>
                  <dd>{g.current.name}</dd>
                </div>
                <div className="sb-agents-meta-wide">
                  <dt>description</dt>
                  <dd>{g.current.description}</dd>
                </div>
              </dl>
            )}
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.8 }}>
                version history ({g.history.length})
              </summary>
              <table
                style={{
                  width: '100%',
                  fontSize: 12,
                  borderCollapse: 'collapse',
                  marginTop: 6,
                }}
              >
                <tbody>
                  {g.history.map((h) => (
                    <tr
                      key={h.id}
                      style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <td style={{ padding: '3px 8px' }}>
                        {h.isCurrent ? '● ' : '○ '}
                        <code>{h.version}</code>
                      </td>
                      <td style={{ padding: '3px 8px' }}>
                        {h.isBuiltIn ? 'built-in' : 'fork'}
                      </td>
                      <td style={{ padding: '3px 8px' }}>{h.name}</td>
                      <td style={{ padding: '3px 8px', opacity: 0.7 }}>
                        {new Date(h.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        ))
      )}
    </div>
  );
}

function Badge({ builtIn }: { builtIn: boolean }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: '1px 6px',
        borderRadius: 3,
        background: builtIn ? 'rgba(74,222,128,0.15)' : 'rgba(250,204,21,0.15)',
        color: builtIn ? '#4ade80' : '#facc15',
        border: `1px solid ${builtIn ? '#4ade80' : '#facc15'}`,
      }}
    >
      {builtIn ? 'built-in' : 'fork'}
    </span>
  );
}

type EditableDoc = { title: string; content: string };

function LensEditor({
  group,
  onCancel,
  onSaved,
}: {
  group: LensGroup;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  // group.current is non-null — the list disables `edit` otherwise.
  const current = group.current!;
  const [name, setName] = useState(current.name);
  const [description, setDescription] = useState(current.description);
  const [model, setModel] = useState(current.defaultModel);
  const [prompt, setPrompt] = useState(current.systemPromptTemplate);
  const [docs, setDocs] = useState<EditableDoc[]>(
    current.knowledge.map((k) => ({ title: k.title, content: k.content })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDoc = (i: number, patch: Partial<EditableDoc>) =>
    setDocs((d) => d.map((doc, j) => (j === i ? { ...doc, ...patch } : doc)));
  const addDoc = () =>
    setDocs((d) => [...d, { title: '', content: '' }]);
  const removeDoc = (i: number) =>
    setDocs((d) => d.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setDocs((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/lenses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: group.slug,
          name,
          description,
          model,
          systemPromptTemplate: prompt,
          knowledge: docs,
        }),
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '100%',
        maxWidth: 820,
      }}
    >
      <strong>
        Edit lens <code>{group.slug}</code>
      </strong>
      <span style={{ fontSize: 12, opacity: 0.7 }}>
        Saving publishes a new fork version and makes it current. The
        built-in lens stays in history — &ldquo;reset to built-in&rdquo;
        rolls back.
      </span>

      <label style={field}>
        <span style={fieldLabel}>name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label style={field}>
        <span style={fieldLabel}>description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label style={field}>
        <span style={fieldLabel}>model</span>
        <input value={model} onChange={(e) => setModel(e.target.value)} />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={fieldLabel}>system prompt template</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={24}
          spellCheck={false}
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
          }}
        />
      </label>

      <fieldset style={{ border: '1px solid rgba(255,255,255,0.15)', padding: 8 }}>
        <legend>knowledge documents ({docs.length})</legend>
        <span style={{ fontSize: 12, opacity: 0.65 }}>
          Rendered into the prompt&apos;s <code>{'{{knowledgeSection}}'}</code>{' '}
          slot, in this order.
        </span>
        {docs.map((doc, i) => (
          <div
            key={i}
            style={{
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: 8,
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>#{i + 1}</span>
              <input
                value={doc.title}
                onChange={(e) => setDoc(i, { title: e.target.value })}
                placeholder="document title"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={i === docs.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button type="button" onClick={() => removeDoc(i)}>
                remove
              </button>
            </div>
            <textarea
              value={doc.content}
              onChange={(e) => setDoc(i, { content: e.target.value })}
              placeholder="document content (markdown or plain text)"
              rows={5}
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 12 }}
            />
          </div>
        ))}
        <button type="button" onClick={addDoc} style={{ marginTop: 8 }}>
          + add document
        </button>
      </fieldset>

      {error && <span style={{ color: '#f87171' }}>error: {error}</span>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => void submit()} disabled={saving}>
          {saving ? 'publishing…' : 'publish fork'}
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
