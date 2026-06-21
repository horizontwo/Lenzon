'use client';

import { useMemo, useState } from 'react';
import { getTemplate, listTemplates } from '@lenzon/player';
import { useStudio } from '../StudioProvider';

type DemoTemplate = {
  id: string;
  label: string;
  demoContent: Record<string, unknown>;
  emphasizeAfter?: { target: string; delayMs: number };
};

export function ToolbarTemplates({
  onTemplateRun,
}: {
  onTemplateRun: (templateId: string | null) => void;
}) {
  const { ready, presenterRef, lastTemplateRef, lastBoxRef } = useStudio();

  const demos = useMemo<DemoTemplate[]>(
    () =>
      listTemplates()
        .filter((t) => t.demo)
        .map((t) => ({
          id: t.id,
          label: t.demo!.label,
          demoContent: t.demo!.content,
          emphasizeAfter: t.demo!.emphasizeAfter,
        })),
    [],
  );

  const [selectedId, setSelectedId] = useState<string>(() => demos[0]?.id ?? '');
  const [payloadText, setPayloadText] = useState<string>(() =>
    demos[0] ? JSON.stringify(demos[0].demoContent, null, 2) : '',
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);

  const version = selectedId ? (getTemplate(selectedId)?.version ?? null) : null;

  const onSelect = (id: string) => {
    setSelectedId(id);
    const demo = demos.find((d) => d.id === id);
    setPayloadText(demo ? JSON.stringify(demo.demoContent, null, 2) : '');
    setParseError(null);
    setEdited(false);
  };

  const onPayloadChange = (text: string) => {
    setPayloadText(text);
    setEdited(true);
    try {
      JSON.parse(text);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  const resetToDemo = () => {
    const demo = demos.find((d) => d.id === selectedId);
    if (!demo) return;
    setPayloadText(JSON.stringify(demo.demoContent, null, 2));
    setParseError(null);
    setEdited(false);
  };

  const clearStage = () => {
    lastTemplateRef.current?.dismiss();
    lastBoxRef.current?.dismiss();
    lastTemplateRef.current = null;
    lastBoxRef.current = null;
    presenterRef.current?.clear();
  };

  const run = () => {
    const presenter = presenterRef.current;
    if (!presenter || !selectedId) return;
    let content: Record<string, unknown>;
    try {
      content = JSON.parse(payloadText) as Record<string, unknown>;
    } catch (e) {
      setParseError((e as Error).message);
      return;
    }
    clearStage();
    lastTemplateRef.current = presenter.present({
      template: selectedId,
      content,
    });
    onTemplateRun(selectedId);
    if (!edited) {
      const demo = demos.find((d) => d.id === selectedId);
      const after = demo?.emphasizeAfter;
      if (after) {
        window.setTimeout(
          () => lastTemplateRef.current?.emphasize?.(after.target),
          after.delayMs,
        );
      }
    }
  };

  const canRun = ready && !!selectedId && !parseError;

  return (
    <div className="sb-templates-panel">
      <div className="sb-toolbar-group">
        <span className="sb-toolbar-label">Template</span>
        <select
          className="sb-template-select"
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          disabled={!ready}
        >
          {demos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        {version && (
          <span
            className="sb-toolbar-label"
            title="Version of the selected template"
          >
            @{version}
          </span>
        )}
        <button disabled={!canRun} onClick={run}>
          ▶ run
        </button>
        <button
          disabled={!ready || !edited}
          onClick={resetToDemo}
          title="Restore the canonical demo payload"
        >
          reset to demo
        </button>
      </div>
      <div className="sb-templates-editor">
        <label className="sb-toolbar-label" htmlFor="sb-template-payload">
          content payload (JSON) {edited && <em>· edited</em>}
        </label>
        <textarea
          id="sb-template-payload"
          className="sb-template-payload"
          spellCheck={false}
          value={payloadText}
          onChange={(e) => onPayloadChange(e.target.value)}
        />
        {parseError && (
          <div className="sb-template-error" role="alert">
            JSON error: {parseError}
          </div>
        )}
      </div>
    </div>
  );
}
