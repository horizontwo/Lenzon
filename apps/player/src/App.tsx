import { useCallback, useRef, useState } from 'react';
import { Presentation } from './react/Presentation';
import type { Presenter, TextBoxHandle } from './service/presenter';
import type { TemplateHandle } from './templates';
import { listTemplates } from './templates';

/**
 * Demo host for the Lenzon service layer. This page is the player's
 * local dev surface for template + effect iteration. It deliberately
 * avoids the full pipeline (analysis → script → playback); that lives in
 * the server's /studio route. Running `vite` here gives you an API-free
 * sandbox for canvas/fx/template work.
 */
export function App() {
  const presenterRef = useRef<Presenter | null>(null);
  const lastBoxRef = useRef<TextBoxHandle | null>(null);
  const lastTemplateRef = useRef<TemplateHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    () => listTemplates().find((t) => t.demo)?.id ?? '',
  );

  const handleReady = useCallback((presenter: Presenter) => {
    presenterRef.current = presenter;
    setReady(true);
  }, []);

  const clearAll = () => {
    lastTemplateRef.current?.dismiss();
    lastBoxRef.current?.dismiss();
    lastBoxRef.current = null;
    lastTemplateRef.current = null;
    presenterRef.current?.clear();
  };

  const runFx = (name: string, params: Record<string, unknown> = {}) => {
    const p = presenterRef.current;
    if (!p) return;
    clearAll();
    lastBoxRef.current = p.showTextBox({
      text: labelFor(name),
      style: {
        size: 84,
        weight: '800',
        color: '#ffffff',
        bgColor: 'rgba(30,41,59,.85)',
        borderRadius: 20,
        shadow: { color: 'rgba(0,0,0,.6)', blur: 24, offsetX: 0, offsetY: 6 },
        padding: 36,
      },
      fx: [{ name, ...params }],
    });
  };

  const runDemo = (templateId: string) => {
    const p = presenterRef.current;
    if (!p) return;
    const tpl = listTemplates().find((t) => t.id === templateId);
    if (!tpl?.demo) return;
    clearAll();
    lastTemplateRef.current = p.present({
      template: tpl.id,
      content: tpl.demo.content,
    });
    const after = tpl.demo.emphasizeAfter;
    if (after) {
      setTimeout(() => lastTemplateRef.current?.emphasize?.(after.target), after.delayMs);
    }
  };

  return (
    <div className="sb-app">
      <header className="sb-toolbar">
        <h1>Lenzon — Template Sandbox</h1>
        <div className="sb-toolbar-group">
          <span className="sb-toolbar-label">Effects</span>
          <button disabled={!ready} onClick={() => runFx('zoom', { duration: 600, to: 1 })}>zoom</button>
          <button disabled={!ready} onClick={() => runFx('grow', { duration: 800, to: 1.35 })}>grow</button>
          <button disabled={!ready} onClick={() => runFx('glow', { duration: 1400, strength: 40 })}>glow</button>
          <button disabled={!ready} onClick={() => runFx('slam', { duration: 520 })}>slam</button>
          <button disabled={!ready} onClick={() => runFx('shake', { duration: 500, intensity: 14 })}>shake</button>
        </div>
        <div className="sb-toolbar-group">
          <span className="sb-toolbar-label">Templates</span>
          <select
            className="sb-template-select"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            disabled={!ready}
          >
            {listTemplates()
              .filter((t) => t.demo)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.demo!.label}
                </option>
              ))}
          </select>
          <button disabled={!ready} onClick={() => runDemo(selectedTemplate)}>
            run
          </button>
        </div>
        <div className="sb-toolbar-group">
          <button disabled={!ready} onClick={clearAll}>clear</button>
        </div>
        <div className="sb-toolbar-group">
          <span className="sb-toolbar-label" style={{ opacity: 0.7 }}>
            Full pipeline lives at <code>/studio</code> on the server.
          </span>
        </div>
      </header>
      <main className="sb-stage-host">
        <Presentation onReady={handleReady} />
      </main>
    </div>
  );
}

function labelFor(name: string): string {
  return name.toUpperCase();
}
