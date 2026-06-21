import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';

import type { Template, TemplateHandle } from './registry';

/**
 * code-zoom — displays a code block prominently with a zoom-in entrance.
 *
 * Visual language follows lenzon/ui v0.1: the code pane sits inside a
 * .cs-plate--sunken surface (the canonical use for code blocks per the
 * primitives header — sunken means "nested content that receives focus").
 * Line highlighting and the emphasize pulse use --cs-accent-warm as the
 * one warm thing on screen.
 *
 * The code itself lives on the DOM layer (styled <pre><code>) so glyphs
 * stay crisp at any scale and Prism can do syntax highlighting. The zoom
 * is a CSS transform on the wrapper, and each line is wrapped in a span
 * so the `emphasize` handle can pulse a specific line number.
 *
 * Slot schema:
 *   code:       string   — the code to display
 *   language:   string   — prism language id (default: "javascript")
 *   highlight:  number[] — 1-based line numbers to pre-highlight
 *   startScale: number   — initial CSS transform scale (default: 0.15)
 */

interface CodeZoomContent {
  code: string;
  language?: string;
  highlight?: number[];
  startScale?: number;
}

export const codeZoomTemplate: Template = {
  id: 'code-zoom',
  version: '1.0.0',
  description: 'Code block in a sunken glass plate that zooms in from small, with optional line highlighting and warm pulse.',
  slots: {
    code: 'string — code to display',
    language: 'string — prism language id (javascript, typescript, python, ...)',
    highlight: 'number[] — 1-based line numbers to pre-highlight',
    startScale: 'number — initial zoom scale (default 0.15)',
  },
  demo: {
    label: 'Code Zoom',
    content: {
      code: `function showTextBox(opts) {
  const box = new TextBox(opts.text, opts.style);
  box.x = opts.x ?? stage.width / 2;
  box.y = opts.y ?? stage.height / 2;
  stage.add(box);
  for (const spec of opts.fx ?? []) {
    applyFx(box, spec);
  }
  return box;
}`,
      language: 'javascript',
      highlight: [5],
    },
    emphasizeAfter: { target: '6', delayMs: 1600 },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as CodeZoomContent;
    const {
      code,
      language = 'javascript',
      highlight = [],
      startScale = 0.15,
    } = content;

    const wrapper = document.createElement('div');
    wrapper.className = 'cs-plate cs-plate--sunken sb-code-wrapper';

    const pre = document.createElement('pre');
    pre.className = `sb-code language-${language}`;

    const codeEl = document.createElement('code');
    codeEl.className = `language-${language}`;

    // Syntax highlight via Prism, then wrap each line so we can target it.
    const grammar = Prism.languages[language] ?? Prism.languages.plain;
    const highlighted = Prism.highlight(code, grammar, language);
    const lines = highlighted.split('\n');
    const highlightSet = new Set(highlight);

    codeEl.innerHTML = lines
      .map((line, i) => {
        const lineNo = i + 1;
        const classes = ['sb-line'];
        if (highlightSet.has(lineNo)) classes.push('sb-line-highlight');
        // Non-breaking content for empty lines so the line span still has height.
        const content = line.length > 0 ? line : '&nbsp;';
        return `<span class="${classes.join(' ')}" data-line="${lineNo}">${content}</span>`;
      })
      .join('\n');

    pre.appendChild(codeEl);
    wrapper.appendChild(pre);
    presenter.domRoot.appendChild(wrapper);

    // Set the starting transform synchronously, then animate to scale(1)
    // on the next frame so the transition fires.
    wrapper.style.setProperty('--sb-start-scale', String(startScale));
    wrapper.classList.add('sb-zooming-in');
    const rafId = requestAnimationFrame(() => {
      wrapper.classList.add('sb-zoom-active');
    });

    const timers: number[] = [];
    const pulseTimers = new Map<HTMLElement, number>();

    const handle: TemplateHandle = {
      dismiss: () => {
        cancelAnimationFrame(rafId);
        timers.forEach((t) => window.clearTimeout(t));
        pulseTimers.forEach((t) => window.clearTimeout(t));
        pulseTimers.clear();
        wrapper.classList.remove('sb-zoom-active');
        wrapper.classList.add('sb-zoom-out');
        const t = window.setTimeout(() => wrapper.remove(), 350);
        timers.push(t);
      },
      emphasize: (target) => {
        const lineNo = Number(target);
        if (!Number.isFinite(lineNo)) return;
        const el = codeEl.querySelector<HTMLElement>(`[data-line="${lineNo}"]`);
        if (!el) return;

        // Accent budget = 1: clear any other line currently pulsing.
        pulseTimers.forEach((t, other) => {
          if (other !== el) {
            other.classList.remove('sb-line-pulse');
            window.clearTimeout(t);
            pulseTimers.delete(other);
          }
        });

        el.classList.add('sb-line-pulse');
        const existing = pulseTimers.get(el);
        if (existing != null) window.clearTimeout(existing);
        pulseTimers.set(
          el,
          window.setTimeout(() => {
            el.classList.remove('sb-line-pulse');
            pulseTimers.delete(el);
          }, 1400),
        );
      },
    };
    return handle;
  },
};
