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
 * code-diff — before / after view of a hunk. Fills the biggest gap in the
 * pre-PR catalog: code-zoom shows ONE side, but a reviewer needs to see
 * what was replaced, not just what's new.
 *
 * Two modes:
 *   - split   = side-by-side (default; preferred when line correspondence
 *               matters — substantive rewrites where matching rows tell
 *               the story).
 *   - unified = single column, red/green gutter (better when the hunk is
 *               mostly additions or mostly deletions and pairing across
 *               two columns would be busy).
 *
 * The runtime contract piggybacks on the emphasize() port using a target
 * prefix convention, since the existing BeatAction union does not carry
 * a `side` discriminator on highlight-line. The producer expresses intent
 * as:
 *
 *     { type: "emphasize", target: "before:42" }  → sticky highlight on
 *                                                    line 42 of the before
 *     { type: "emphasize", target: "after:42"  }  → sticky highlight on
 *                                                    line 42 of the after
 *     { type: "emphasize", target: "pair:42"   }  → lights before:42 AND
 *                                                    after:42 together
 *     { type: "emphasize", target: "before"    }  → pulse the whole before
 *                                                    column
 *     { type: "emphasize", target: "after"     }  → pulse the whole after
 *                                                    column
 *     { type: "emphasize", target: "clear"     }  → reset all sticky line
 *                                                    highlights (escape hatch)
 *
 * Line highlights are STICKY — they layer. Multiple lines can be lit at
 * once across both columns, which is the point: a paired highlight reads
 * as "this turned into that." The `before.highlight` / `after.highlight`
 * arrays on the slot payload prime the sticky state at mount; beats only
 * fire to *change* what is lit during the scene.
 *
 * Column pulses (target = "before" / "after") are warm-ring transients
 * that clear themselves after 1.4s, like every other warm pulse.
 *
 * Fill mode: full-bleed. Surface chrome from .cs-plate; nested code panes
 * use .cs-plate--sunken so they read as "focused content".
 */

interface CodeDiffSide {
  code: string;
  /** Line number to render against the FIRST line of `code`. Defaults to 1. */
  startLine?: number;
  /** Pre-primed sticky highlights, in the side's own line-number space. */
  highlight?: number[];
}

interface CodeDiffContent {
  file: string;
  language?: string;
  mode?: 'split' | 'unified';
  before: CodeDiffSide;
  after: CodeDiffSide;
  caption?: string;
  startScale?: number;
  eyebrow?: string;
  sceneTag?: string;
}

type Side = 'before' | 'after';

interface RenderedPane {
  side: Side;
  pre: HTMLPreElement;
  lineByNumber: Map<number, HTMLElement>;
}

const PRISM_FALLBACK_LANG = 'plain';

function renderPane(
  side: Side,
  code: string,
  language: string,
  startLine: number,
  preHighlight: number[],
): RenderedPane {
  const pre = document.createElement('pre');
  pre.className = `sb-code sb-diff-pre sb-diff-pre--${side} language-${language}`;

  const codeEl = document.createElement('code');
  codeEl.className = `language-${language}`;

  const grammar = Prism.languages[language] ?? Prism.languages[PRISM_FALLBACK_LANG];
  const highlighted = grammar
    ? Prism.highlight(code, grammar, language)
    : code.replace(/[&<>]/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt' }[c]};`);
  const lines = highlighted.split('\n');
  const preHi = new Set(preHighlight);

  const lineByNumber = new Map<number, HTMLElement>();
  codeEl.innerHTML = lines
    .map((line, i) => {
      const lineNo = startLine + i;
      const classes = ['sb-line', 'sb-diff-line', `sb-diff-line--${side}`];
      if (preHi.has(lineNo)) classes.push('sb-line-highlight');
      const lineContent = line.length > 0 ? line : '&nbsp;';
      return `<span class="${classes.join(
        ' ',
      )}" data-line="${lineNo}" data-side="${side}"><span class="sb-diff-gutter">${lineNo}</span><span class="sb-diff-line-content">${lineContent}</span></span>`;
    })
    .join('\n');

  pre.appendChild(codeEl);

  // Cache the line refs after innerHTML is set.
  pre.querySelectorAll<HTMLElement>('.sb-diff-line').forEach((el) => {
    const ln = Number(el.dataset.line);
    if (Number.isFinite(ln)) lineByNumber.set(ln, el);
  });

  return { side, pre, lineByNumber };
}

/**
 * Unified mode: render before+after as one column. Deletions render with
 * a red gutter and a "−" sign; additions render with a green gutter and
 * a "+" sign. Producer is responsible for picking unified vs split based
 * on the hunk shape — the template renders what is asked.
 *
 * Heuristic for collapsing into "one column": we keep the two sides
 * stacked (deletions first, then additions) rather than trying to
 * line-align them, because the producer's choice of "unified" already
 * signals the hunk is mostly one-sided.
 */
function renderUnifiedPane(
  before: CodeDiffSide,
  after: CodeDiffSide,
  language: string,
): { container: HTMLDivElement; lineByKey: Map<string, HTMLElement> } {
  const lineByKey = new Map<string, HTMLElement>();
  const container = document.createElement('div');
  container.className = 'sb-diff-unified';

  const grammar = Prism.languages[language] ?? Prism.languages[PRISM_FALLBACK_LANG];

  const buildSide = (side: Side, payload: CodeDiffSide) => {
    const startLine = payload.startLine ?? 1;
    const preHi = new Set(payload.highlight ?? []);
    const highlighted = grammar
      ? Prism.highlight(payload.code, grammar, language)
      : payload.code.replace(/[&<>]/g, (c) =>
          `&${{ '&': 'amp', '<': 'lt', '>': 'gt' }[c]};`,
        );
    const lines = highlighted.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineNo = startLine + i;
      const line = lines[i];
      const lineEl = document.createElement('span');
      const classes = [
        'sb-line',
        'sb-diff-line',
        'sb-diff-line--unified',
        `sb-diff-line--${side}`,
      ];
      if (preHi.has(lineNo)) classes.push('sb-line-highlight');
      lineEl.className = classes.join(' ');
      lineEl.dataset.line = String(lineNo);
      lineEl.dataset.side = side;

      const sign = document.createElement('span');
      sign.className = `sb-diff-sign sb-diff-sign--${side}`;
      sign.textContent = side === 'before' ? '−' : '+';

      const gutter = document.createElement('span');
      gutter.className = 'sb-diff-gutter';
      gutter.textContent = String(lineNo);

      const body = document.createElement('span');
      body.className = 'sb-diff-line-content';
      body.innerHTML = line.length > 0 ? line : '&nbsp;';

      lineEl.append(sign, gutter, body);
      container.appendChild(lineEl);
      lineByKey.set(`${side}:${lineNo}`, lineEl);
    }
  };

  buildSide('before', before);
  buildSide('after', after);

  return { container, lineByKey };
}

export const codeDiffTemplate: Template = {
  id: 'code-diff',
  version: '1.0.0',
  description:
    'Before/after view of a hunk. Split mode renders two columns side by ' +
    'side (preferred when line correspondence matters); unified mode renders ' +
    'one column with +/− gutters. Bilateral line highlighting via ' +
    'emphasize("before:N" | "after:N" | "pair:N").',
  slots: {
    file: 'string — file path shown as a badge above the diff',
    language: 'string — prism language id (default: "javascript")',
    mode: '"split" | "unified" — column layout (default "split")',
    before: '{ code, startLine?, highlight? } — original side',
    after: '{ code, startLine?, highlight? } — replacement side',
    caption: 'string — optional 1-line summary below the diff',
    startScale: 'number — initial zoom scale (default 0.15)',
  },
  demo: {
    label: 'Code Diff',
    content: {
      file: 'src/upload/path-validator.ts',
      language: 'typescript',
      mode: 'split',
      before: {
        code: `function validatePath(p: string) {
  if (p.includes('..')) {
    throw new Error('escape');
  }
  return p;
}`,
        startLine: 40,
        highlight: [42],
      },
      after: {
        code: `function validatePath(p: string) {
  const real = realpathSync(p);
  if (!real.startsWith(ROOT)) {
    throw new PathEscapeError(p);
  }
  return real;
}`,
        startLine: 40,
        highlight: [42, 43],
      },
      caption: 'realpath + prefix check replaces the substring test',
      startScale: 0.15,
    },
    emphasizeAfter: { target: 'pair:42', delayMs: 2200 },
  },

  render(presenter, contentIn): TemplateHandle {
    const c = contentIn as unknown as CodeDiffContent;
    const language = c.language ?? 'javascript';
    const mode: 'split' | 'unified' = c.mode === 'unified' ? 'unified' : 'split';
    const startScale = c.startScale ?? 0.15;

    const wrapper = document.createElement('div');
    wrapper.className = 'sb-diff-wrapper';
    wrapper.style.setProperty('--sb-start-scale', String(startScale));

    const stage = document.createElement('div');
    stage.className = `sb-diff-stage sb-diff-stage--${mode}`;

    const plate = document.createElement('div');
    plate.className = 'cs-plate cs-plate--default sb-diff-plate';

    // Header strip — eyebrow + scene tag + file badge on the second row.
    const header = document.createElement('div');
    header.className = 'sb-diff-header';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'cs-eyebrow cs-eyebrow--dim sb-diff-eyebrow';
    eyebrow.textContent = c.eyebrow ?? `§ / code-diff · ${mode}`;
    const sceneTag = document.createElement('span');
    sceneTag.className = 'cs-badge cs-badge--cool sb-diff-tag';
    sceneTag.textContent = c.sceneTag ?? 'DIFF';
    header.append(eyebrow, sceneTag);
    plate.appendChild(header);

    const fileRow = document.createElement('div');
    fileRow.className = 'sb-diff-file-row';
    const fileBadge = document.createElement('span');
    fileBadge.className = 'cs-badge cs-badge--ink sb-diff-file';
    fileBadge.textContent = c.file ?? '—';
    fileRow.appendChild(fileBadge);
    if (mode === 'split') {
      const labelStrip = document.createElement('div');
      labelStrip.className = 'sb-diff-label-strip';
      const lblBefore = document.createElement('span');
      lblBefore.className = 'sb-diff-side-label sb-diff-side-label--before';
      lblBefore.textContent = 'BEFORE';
      const lblAfter = document.createElement('span');
      lblAfter.className = 'sb-diff-side-label sb-diff-side-label--after';
      lblAfter.textContent = 'AFTER';
      labelStrip.append(lblBefore, lblAfter);
      fileRow.appendChild(labelStrip);
    }
    plate.appendChild(fileRow);

    // Body — either two sunken panes side by side, or one stacked.
    const body = document.createElement('div');
    body.className = `sb-diff-body sb-diff-body--${mode}`;

    const lineLookup = new Map<string, HTMLElement>();
    const columnEls: Record<Side, HTMLElement> = {} as Record<Side, HTMLElement>;

    if (mode === 'split') {
      const beforeCol = document.createElement('div');
      beforeCol.className = 'cs-plate cs-plate--sunken sb-diff-col sb-diff-col--before';
      const afterCol = document.createElement('div');
      afterCol.className = 'cs-plate cs-plate--sunken sb-diff-col sb-diff-col--after';

      const beforePane = renderPane(
        'before',
        c.before?.code ?? '',
        language,
        c.before?.startLine ?? 1,
        c.before?.highlight ?? [],
      );
      const afterPane = renderPane(
        'after',
        c.after?.code ?? '',
        language,
        c.after?.startLine ?? 1,
        c.after?.highlight ?? [],
      );

      beforeCol.appendChild(beforePane.pre);
      afterCol.appendChild(afterPane.pre);
      body.append(beforeCol, afterCol);

      columnEls.before = beforeCol;
      columnEls.after = afterCol;
      beforePane.lineByNumber.forEach((el, ln) =>
        lineLookup.set(`before:${ln}`, el),
      );
      afterPane.lineByNumber.forEach((el, ln) =>
        lineLookup.set(`after:${ln}`, el),
      );
    } else {
      const col = document.createElement('div');
      col.className = 'cs-plate cs-plate--sunken sb-diff-col sb-diff-col--unified';
      const { container, lineByKey } = renderUnifiedPane(
        c.before ?? { code: '' },
        c.after ?? { code: '' },
        language,
      );
      col.appendChild(container);
      body.appendChild(col);

      // For column-level pulses in unified mode, treat the whole column
      // as both before and after — pulsing one side pulses the column.
      columnEls.before = col;
      columnEls.after = col;
      lineByKey.forEach((el, key) => lineLookup.set(key, el));
    }

    plate.appendChild(body);

    // Caption — small footer text under the diff.
    let captionEl: HTMLElement | null = null;
    if (c.caption) {
      captionEl = document.createElement('div');
      captionEl.className = 'sb-diff-caption';
      captionEl.textContent = c.caption;
      plate.appendChild(captionEl);
    }

    stage.appendChild(plate);
    wrapper.appendChild(stage);
    presenter.domRoot.appendChild(wrapper);

    // Zoom-in entrance — same lever code-zoom uses, so the two templates
    // feel like siblings when they cut between each other.
    wrapper.classList.add('sb-zooming-in');
    const rafId = requestAnimationFrame(() => {
      wrapper.classList.add('sb-zoom-active');
    });

    const timers: number[] = [];
    const columnPulseTimers = new Map<HTMLElement, number>();

    // Persistent sticky highlight set (keyed "side:N"). We also rely on
    // the `.sb-line-highlight` class to express that visually, so the
    // pre-primed lines start in this set.
    const litLines = new Set<string>();
    lineLookup.forEach((el, key) => {
      if (el.classList.contains('sb-line-highlight')) litLines.add(key);
    });

    const lightLine = (key: string) => {
      const el = lineLookup.get(key);
      if (!el) return;
      el.classList.add('sb-line-highlight');
      litLines.add(key);
    };

    const clearAllLines = () => {
      litLines.forEach((key) => {
        const el = lineLookup.get(key);
        if (el) el.classList.remove('sb-line-highlight');
      });
      litLines.clear();
    };

    const pulseColumn = (col: HTMLElement) => {
      // Accent budget = 1: clear any other column currently pulsing.
      columnPulseTimers.forEach((t, other) => {
        if (other !== col) {
          other.classList.remove('sb-diff-col-pulse');
          window.clearTimeout(t);
          columnPulseTimers.delete(other);
        }
      });
      col.classList.add('sb-diff-col-pulse');
      const existing = columnPulseTimers.get(col);
      if (existing != null) window.clearTimeout(existing);
      columnPulseTimers.set(
        col,
        window.setTimeout(() => {
          col.classList.remove('sb-diff-col-pulse');
          columnPulseTimers.delete(col);
        }, 1400),
      );
    };

    return {
      dismiss: () => {
        cancelAnimationFrame(rafId);
        timers.forEach((t) => window.clearTimeout(t));
        columnPulseTimers.forEach((t) => window.clearTimeout(t));
        columnPulseTimers.clear();
        wrapper.classList.remove('sb-zoom-active');
        wrapper.classList.add('sb-zoom-out');
        const t = window.setTimeout(() => wrapper.remove(), 350);
        timers.push(t);
      },
      emphasize: (target: string) => {
        if (!target) return;

        if (target === 'clear') {
          clearAllLines();
          return;
        }
        if (target === 'before' || target === 'after') {
          pulseColumn(columnEls[target as Side]);
          return;
        }

        const colonIdx = target.indexOf(':');
        if (colonIdx < 0) return;
        const prefix = target.slice(0, colonIdx);
        const rest = target.slice(colonIdx + 1);
        const lineNo = Number(rest);
        if (!Number.isFinite(lineNo)) return;

        if (prefix === 'before' || prefix === 'after') {
          lightLine(`${prefix}:${lineNo}`);
        } else if (prefix === 'pair') {
          lightLine(`before:${lineNo}`);
          lightLine(`after:${lineNo}`);
        }
      },
    };
  },
};
