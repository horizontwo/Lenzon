'use client';

import type { StackStamp } from '../hooks/useStackStamp';

type Props = {
  /** What the deployed code reports right now (HEAD). */
  head: StackStamp | null;
  /** What the loaded script was produced against. Null for sample scripts. */
  captured: {
    producerVersion: string | null;
    templateVersions: Record<string, string> | null;
  } | null;
  /** Template the currently-playing scene uses. */
  sceneTemplateId: string | null;
};

const DRIFT_STYLE: React.CSSProperties = { color: '#fbbf24', fontWeight: 600 };

function short(v: string | null | undefined): string {
  if (!v) return '—';
  // Fingerprints are long hex hashes; show enough to recognize without
  // dominating the toolbar.
  return v.length > 10 ? `${v.slice(0, 10)}…` : v;
}

export function StackStampStrip({ head, captured, sceneTemplateId }: Props) {
  if (!head && !captured) return null;

  const capturedProducer = captured?.producerVersion ?? null;
  const headProducer = head?.producerVersion ?? null;
  const producerDrift =
    capturedProducer && headProducer && capturedProducer !== headProducer;

  const capturedTemplate = sceneTemplateId
    ? (captured?.templateVersions?.[sceneTemplateId] ?? null)
    : null;
  const headTemplate = sceneTemplateId
    ? (head?.templateVersions[sceneTemplateId] ?? null)
    : null;
  const templateDrift =
    capturedTemplate && headTemplate && capturedTemplate !== headTemplate;

  return (
    <div className="sb-stack-stamp">
      <span className="sb-stack-stamp-label">stack</span>

      <span className="sb-stack-stamp-item">
        <span className="sb-stack-stamp-key">producer</span>
        {captured ? (
          <code title="captured (from Script row)">
            {short(capturedProducer)}
          </code>
        ) : (
          <code title="deployed (HEAD)">{short(headProducer)}</code>
        )}
        {captured && head && (
          <>
            <span className="sb-stack-stamp-key">HEAD</span>
            <code
              title="deployed stamp"
              style={producerDrift ? DRIFT_STYLE : undefined}
            >
              {short(headProducer)}
            </code>
            {producerDrift && (
              <span style={DRIFT_STYLE} title="script was built against an older producer">
                ⚠ drift
              </span>
            )}
          </>
        )}
      </span>

      {sceneTemplateId ? (
        <span className="sb-stack-stamp-item">
          <span className="sb-stack-stamp-key">template</span>
          <code>
            {sceneTemplateId}
            {capturedTemplate ? `@${capturedTemplate}` : headTemplate ? `@${headTemplate}` : ''}
          </code>
          {captured && head && capturedTemplate && headTemplate && (
            <>
              <span className="sb-stack-stamp-key">HEAD</span>
              <code style={templateDrift ? DRIFT_STYLE : undefined}>
                {headTemplate}
              </code>
              {templateDrift && (
                <span style={DRIFT_STYLE} title="template has been updated since this script was produced">
                  ⚠ drift
                </span>
              )}
            </>
          )}
        </span>
      ) : (
        <span className="sb-stack-stamp-item sb-stack-stamp-muted">
          load a script to see the scene's template version
        </span>
      )}
    </div>
  );
}
