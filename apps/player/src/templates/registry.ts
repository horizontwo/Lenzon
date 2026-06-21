import type { Presenter } from '../service/presenter';

/**
 * Templates are the "set standards" layer sitting above the service
 * primitives. An agent picks a template based on the shape of its content
 * (a title and bullets, a code sample, a comparison, a quote, etc.) and
 * passes structured slots. The template decides how to lay those slots
 * out across the DOM and canvas layers.
 *
 * The content type is intentionally loose (Record<string, unknown>) so
 * templates can define their own slot schemas without changing the
 * registry. Individual templates should cast to a typed interface.
 */

export type TemplateContent = Record<string, unknown>;

export interface TemplateDemo {
  /** Human label for the dropdown (e.g. "Flow Diagram"). */
  label: string;
  /** Content payload to feed to the template's render(). */
  content: TemplateContent;
  /** Optional emphasize call scheduled after the template mounts. */
  emphasizeAfter?: { target: string; delayMs: number };
}

export interface Template {
  id: string;
  description: string;
  /**
   * Version stamp for provenance. Required so a new template without one
   * fails type-check. Scripts snapshot the full id→version map at
   * creation time; flags record the version the client rendered. Bump
   * this when the template's behavior changes in a way worth tracking.
   */
  version: string;
  /**
   * Machine-readable schema hint. Not validated here — intended for an
   * agent tool-discovery endpoint that wants to tell a model what slots
   * this template takes.
   */
  slots?: Record<string, string>;
  /**
   * Optional hand-picked sample payload the demo UI can play back so every
   * template is exercisable without custom button wiring.
   */
  demo?: TemplateDemo;
  render(presenter: Presenter, content: TemplateContent): TemplateHandle;
}

export interface TemplateHandle {
  /** Remove everything the template added. */
  dismiss(): void;
  /** Optional: draw attention to a slot or sub-element. */
  emphasize?(target: string): void;
}

const templates = new Map<string, Template>();

export function registerTemplate(t: Template): void {
  templates.set(t.id, t);
}

export function getTemplate(id: string): Template | undefined {
  return templates.get(id);
}

export function listTemplates(): Template[] {
  return Array.from(templates.values());
}

// Snapshot of every registered template's current version, keyed by id.
// The server calls this at script-create time to record what was
// available when the producer picked.
export function listTemplateVersions(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of templates.values()) out[t.id] = t.version;
  return out;
}
