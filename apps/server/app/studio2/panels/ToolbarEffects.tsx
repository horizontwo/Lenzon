'use client';

import { useStudio } from '../StudioProvider';

type Fx = {
  name: string;
  params: Record<string, unknown>;
};

const FX_BUTTONS: Fx[] = [
  { name: 'zoom', params: { duration: 600, to: 1 } },
  { name: 'grow', params: { duration: 800, to: 1.35 } },
  { name: 'glow', params: { duration: 1400, strength: 40 } },
  { name: 'slam', params: { duration: 520 } },
  { name: 'shake', params: { duration: 500, intensity: 14 } },
];

export function ToolbarEffects() {
  const { ready, presenterRef, lastBoxRef, lastTemplateRef } = useStudio();

  const runFx = (fx: Fx) => {
    const presenter = presenterRef.current;
    if (!presenter) return;
    lastTemplateRef.current?.dismiss();
    lastBoxRef.current?.dismiss();
    lastTemplateRef.current = null;
    presenter.clear();
    lastBoxRef.current = presenter.showTextBox({
      text: fx.name.toUpperCase(),
      style: {
        size: 84,
        weight: '800',
        color: '#ffffff',
        bgColor: 'rgba(30,41,59,.85)',
        borderRadius: 20,
        shadow: { color: 'rgba(0,0,0,.6)', blur: 24, offsetX: 0, offsetY: 6 },
        padding: 36,
      },
      fx: [{ name: fx.name, ...fx.params }],
    });
  };

  return (
    <div className="sb-toolbar-group">
      <span className="sb-toolbar-label">Effects</span>
      {FX_BUTTONS.map((fx) => (
        <button key={fx.name} disabled={!ready} onClick={() => runFx(fx)}>
          {fx.name}
        </button>
      ))}
    </div>
  );
}
