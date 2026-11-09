import Prism from 'prismjs';
import type { Template, TemplateHandle } from './registry';

/**
 * transform-grid — a horizontal sequence of panels showing data/concept
 * transforming through stages. Each stage is a card with a label; stages
 * reveal left-to-right with connector arrows between them. Good for
 * pipelines, refactor sequences, request/response flow.
 *
 * lenzon/ui v0.1 styling: the whole grid sits inside a .cs-plate
 * (default), and each stage card is a nested .cs-plate--sunken. This is
 * the canonical "nested plate" pattern documented in the GlassPlate
 * primitive — sunken INSIDE default is allowed (double-default is not).
 * The label is a .cs-eyebrow, the connector glyph uses --cs-ink-3, and
 * the emphasize pulse uses the warm accent.
 *
 * Slot schema:
 *   title:     string — optional canvas headline (currently shown in DOM)
 *   stages:    Stage[]
 *   staggerMs: number — delay between stage reveals (default 600)
 *   connector: "arrow" | "chevron" | "fade"
 */

interface StageDisplay {
  type: 'code' | 'text';
  code?: string;
  text?: string;
  language?: string;
}

interface StageSpec {
  label: string;
  display: StageDisplay;
}

interface TransformGridContent {
  title?: string;
  stages: StageSpec[];
  staggerMs?: number;
  connector?: 'arrow' | 'chevron' | 'fade';
}

const CONNECTORS: Record<string, string> = {
  arrow: '\u2192',    // →
  chevron: '\u276F',  // ❯
  fade: '\u2026',     // …
};

export const transformGridTemplate: Template = {
  id: 'transform-grid',
  version: '1.0.0',
  description:
    'Horizontal pipeline of stages in nested glass plates that reveal left-to-right with connector glyphs. Stages can show code or text.',
  slots: {
    title: 'string — optional headline above the grid',
    stages: '{ label: string, display: { type: "code"|"text", code?, text?, language? } }[]',
    staggerMs: 'number — delay between stage reveals (default 600)',
    connector: '"arrow" | "chevron" | "fade"',
  },
  demo: {
    label: 'Transform Grid',
    content: {
      title: 'How a request becomes a response',
      stages: [
        {
          label: 'Raw Request',
          display: {
            type: 'code',
            code: 'POST /api/login\n{email, password}',
            language: 'http',
          },
        },
        {
          label: 'Validated',
          display: {
            type: 'code',
            code: "{ email: 'rick@...',\n  password: '••••' }",
            language: 'json',
          },
        },
        {
          label: 'Authenticated',
          display: {
            type: 'text',
            text: 'Credentials match\nGenerate JWT',
          },
        },
        {
          label: 'Response',
          display: {
            type: 'code',
            code: "200 OK\n{ token: 'eyJhbG...' }",
            language: 'http',
          },
        },
      ],
      staggerMs: 600,
      connector: 'arrow',
    },
    emphasizeAfter: { target: '2', delayMs: 3200 },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as TransformGridContent;
    const {
      title,
      stages = [],
      staggerMs = 600,
      connector = 'arrow',
    } = content;

    const wrapper = document.createElement('div');
    wrapper.className = 'cs-plate cs-plate--default sb-transform-wrapper';

    if (title) {
      const h = document.createElement('div');
      h.className = 'cs-title cs-title--m sb-transform-title';
      h.textContent = title;
      wrapper.appendChild(h);
    }

    const grid = document.createElement('div');
    grid.className = 'sb-transform-grid';
    wrapper.appendChild(grid);

    const stageEls: HTMLElement[] = [];
    const connectorEls: HTMLElement[] = [];

    stages.forEach((stage, i) => {
      const card = document.createElement('div');
      card.className = 'cs-plate cs-plate--sunken sb-transform-stage';

      const display = document.createElement('div');
      display.className = 'sb-transform-display';

      if (stage.display.type === 'code') {
        const pre = document.createElement('pre');
        pre.className = 'sb-transform-code';
        const code = document.createElement('code');
        const lang = stage.display.language ?? 'javascript';
        const grammar = Prism.languages[lang] ?? Prism.languages.javascript;
        const raw = stage.display.code ?? '';
        code.innerHTML = grammar ? Prism.highlight(raw, grammar, lang) : escapeHtml(raw);
        pre.appendChild(code);
        display.appendChild(pre);
      } else {
        const text = document.createElement('div');
        text.className = 'sb-transform-text';
        text.textContent = stage.display.text ?? '';
        display.appendChild(text);
      }

      card.appendChild(display);

      const label = document.createElement('div');
      label.className = 'cs-eyebrow cs-eyebrow--dim sb-transform-label';
      label.textContent = stage.label;
      card.appendChild(label);

      grid.appendChild(card);
      stageEls.push(card);

      if (i < stages.length - 1) {
        const conn = document.createElement('div');
        conn.className = `sb-transform-connector sb-transform-connector-${connector}`;
        conn.textContent = CONNECTORS[connector] ?? CONNECTORS.arrow;
        grid.appendChild(conn);
        connectorEls.push(conn);
      }
    });

    presenter.domRoot.appendChild(wrapper);

    // Fit labels — long multi-word labels in a narrow flex column wrap
    // one word per line and read as "vertical text". Measure with
    // white-space:nowrap to detect overflow, then step the font down
    // until the label fits on one line. Floor lets normal wrapping
    // take over. See TEMPLATE-SPEC.md §9c.
    const LABEL_STEPS = [13, 12, 11, 10];
    const rafId = requestAnimationFrame(() => {
      wrapper.querySelectorAll<HTMLDivElement>('.sb-transform-label').forEach((div) => {
        div.style.whiteSpace = 'nowrap';
        for (const size of LABEL_STEPS) {
          div.style.fontSize = `${size}px`;
          if (div.scrollWidth <= div.clientWidth) {
            return; // fits — keep nowrap to prevent future wraps
          }
        }
        // Didn't fit at smallest size — let it wrap rather than clip.
        div.style.whiteSpace = '';
      });
    });

    const timers: number[] = [];
    stageEls.forEach((el, i) => {
      const t1 = window.setTimeout(() => el.classList.add('sb-visible'), 200 + i * staggerMs);
      timers.push(t1);
      const conn = connectorEls[i];
      if (conn) {
        const t2 = window.setTimeout(
          () => conn.classList.add('sb-visible'),
          200 + i * staggerMs + staggerMs * 0.55,
        );
        timers.push(t2);
      }
    });

    const emphTimers = new Map<HTMLElement, number>();

    const handle: TemplateHandle = {
      dismiss: () => {
        cancelAnimationFrame(rafId);
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        wrapper.remove();
      },
      emphasize: (target) => {
        const i = Number(target);
        const match = Number.isFinite(i)
          ? stageEls[i]
          : stageEls.find(
              (el) => el.querySelector('.sb-transform-label')?.textContent === target,
            );
        if (!match) return;

        // Accent budget = 1: clear any other stage currently pulsing.
        stageEls.forEach((other) => {
          if (other !== match && other.classList.contains('sb-transform-active')) {
            other.classList.remove('sb-transform-active', 'sb-emphasize');
            const t = emphTimers.get(other);
            if (t != null) {
              window.clearTimeout(t);
              emphTimers.delete(other);
            }
          }
        });

        match.classList.add('sb-transform-active', 'sb-emphasize');
        const prior = emphTimers.get(match);
        if (prior != null) window.clearTimeout(prior);
        emphTimers.set(
          match,
          window.setTimeout(() => {
            match.classList.remove('sb-transform-active', 'sb-emphasize');
            emphTimers.delete(match);
          }, 1400),
        );
      },
    };
    return handle;
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
