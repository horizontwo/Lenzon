import type { Template, TemplateHandle } from './registry';

/**
 * directory-tree — renders repository structure. The "zoom out and see
 * the whole thing" scene: where the code lives, how a monorepo is
 * organized, which directories/files matter.
 *
 * Calm template — the tree expands depth-by-depth once, then holds
 * still. No continuous motion. Spec calls this out explicitly (§9 #3).
 *
 * lenzon/ui v0.1 styling: the tree sits inside a .cs-plate glass
 * surface. The tree prefix (├──, └──, │) plays the role of .cs-numlist's
 * left-column guide — mono, dim. Directory names render in mono; file
 * names render in the UI face. A highlighted row gets the warm accent
 * treatment via .is-emph (same mechanism as title-bullets).
 *
 * Slot schema:
 *   root:     string            — repo/root label shown at the top
 *   tree:     TreeNode[]        — top-level entries
 *   maxDepth: number            — collapse depth beyond this (default 3)
 *   staggerMs: number           — per-depth reveal delay (default 200)
 *   style:    "tree" | "indented" | "explorer"  (default "tree")
 *
 * TreeNode:
 *   name:      string
 *   badge?:    string           — small pill next to the name
 *   note?:     string           — dim caption to the right
 *   highlight?: boolean         — accent row at baseline (uses the warm
 *                                 budget; reserve for one call-out row)
 *   children?: TreeNode[]
 */

interface TreeNode {
  name: string;
  badge?: string;
  note?: string;
  highlight?: boolean;
  children?: TreeNode[];
}

interface DirectoryTreeContent {
  root?: string;
  tree: TreeNode[];
  maxDepth?: number;
  staggerMs?: number;
  style?: 'tree' | 'indented' | 'explorer';
}

type TreeStyle = 'tree' | 'indented' | 'explorer';

export const directoryTreeTemplate: Template = {
  id: 'directory-tree',
  version: '1.0.0',
  description:
    'Repository/directory structure view inside a glass plate. For showing how a project is organized, which folders matter. Calm/static after the depth-stagger reveal.',
  slots: {
    root: 'string — optional root label shown at the top',
    tree: 'TreeNode[] — { name, badge?, note?, highlight?, children? }',
    maxDepth: 'number — collapse deeper levels (default 3)',
    staggerMs: 'number — per-depth reveal delay (default 200)',
    style: '"tree" | "indented" | "explorer" (default "tree")',
  },
  demo: {
    label: 'Directory Tree',
    content: {
      root: 'claude-code-action',
      tree: [
        {
          name: 'src/',
          badge: 'core',
          children: [
            { name: 'action/', badge: 'entry', note: 'GitHub Action entry points' },
            { name: 'mcp/', badge: '4 servers', note: 'MCP tool servers' },
            {
              name: 'utils/',
              children: [
                { name: 'auth.ts', highlight: true, note: 'Token + OAuth plumbing' },
                { name: 'graphql.ts' },
                { name: 'config.ts' },
              ],
            },
          ],
        },
        { name: 'tests/', badge: 'unit only' },
        { name: '.github/', children: [{ name: 'workflows/' }] },
        { name: 'action.yml', note: 'Action manifest' },
        { name: 'README.md' },
      ],
      maxDepth: 3,
      staggerMs: 200,
      style: 'tree',
    },
    emphasizeAfter: { target: 'action.yml', delayMs: 2200 },
  },
  render(presenter, contentIn) {
    const content = contentIn as unknown as DirectoryTreeContent;
    const {
      root,
      tree = [],
      maxDepth = 3,
      staggerMs = 200,
      style = 'tree',
    } = content;

    const plate = document.createElement('div');
    plate.className = `cs-plate cs-plate--default sb-tree-plate sb-tree-style-${style}`;

    if (root) {
      const rootEl = document.createElement('div');
      rootEl.className = 'sb-tree-root';
      rootEl.textContent = root;
      plate.appendChild(rootEl);
    }

    const list = document.createElement('div');
    list.className = 'sb-tree-list';
    plate.appendChild(list);

    const rowsByDepth: HTMLElement[][] = [];
    const rowByPath = new Map<string, HTMLElement>();

    const renderNodes = (
      nodes: TreeNode[],
      depth: number,
      ancestorPath: string,
      ancestorLastFlags: boolean[],
    ) => {
      if (depth > maxDepth) {
        if (nodes.length > 0) {
          const more = document.createElement('div');
          more.className = 'sb-tree-row sb-tree-more';

          const prefix = document.createElement('span');
          prefix.className = 'sb-tree-prefix';
          prefix.textContent =
            style === 'tree'
              ? buildPrefix(ancestorLastFlags, true)
              : indentPrefix(depth);
          more.appendChild(prefix);

          const name = document.createElement('span');
          name.className = 'sb-tree-name';
          name.textContent = `… ${nodes.length} more`;
          more.appendChild(name);

          list.appendChild(more);
          pushRow(rowsByDepth, depth, more);
        }
        return;
      }

      nodes.forEach((node, i) => {
        const isLast = i === nodes.length - 1;
        const path = ancestorPath ? `${ancestorPath}/${node.name}` : node.name;
        const row = buildRow(node, depth, ancestorLastFlags, isLast, style);
        list.appendChild(row);
        pushRow(rowsByDepth, depth, row);
        rowByPath.set(path, row);
        rowByPath.set(node.name, row);

        if (node.children && node.children.length > 0) {
          renderNodes(
            node.children,
            depth + 1,
            path,
            [...ancestorLastFlags, isLast],
          );
        }
      });
    };

    renderNodes(tree, 0, '', []);

    presenter.domRoot.appendChild(plate);

    // Depth-by-depth stagger reveal. After all depths are visible, no
    // further motion — the tree just sits there.
    const timers: number[] = [];
    rowsByDepth.forEach((rows, depth) => {
      const delay = 150 + depth * staggerMs;
      rows.forEach((row, idx) => {
        const t = window.setTimeout(
          () => row.classList.add('sb-visible'),
          delay + idx * 30,
        );
        timers.push(t);
      });
    });

    const emphTimers = new Map<HTMLElement, number>();
    const allRows = Array.from(rowByPath.values());

    const handle: TemplateHandle = {
      dismiss: () => {
        timers.forEach((t) => window.clearTimeout(t));
        emphTimers.forEach((t) => window.clearTimeout(t));
        emphTimers.clear();
        plate.remove();
      },
      emphasize: (target) => {
        if (!target) return;
        const match = rowByPath.get(target) ?? findRowByName(rowByPath, target);
        if (!match) return;

        // Accent budget = 1: clear any other row currently emph'd.
        allRows.forEach((other) => {
          if (other !== match && other.classList.contains('is-emph')) {
            other.classList.remove('is-emph', 'sb-emphasize');
            const t = emphTimers.get(other);
            if (t != null) {
              window.clearTimeout(t);
              emphTimers.delete(other);
            }
          }
        });

        match.classList.add('is-emph', 'sb-emphasize');
        const existing = emphTimers.get(match);
        if (existing != null) window.clearTimeout(existing);
        emphTimers.set(
          match,
          window.setTimeout(() => {
            match.classList.remove('is-emph', 'sb-emphasize');
            emphTimers.delete(match);
          }, 1400),
        );
      },
    };
    return handle;
  },
};

function pushRow(rowsByDepth: HTMLElement[][], depth: number, row: HTMLElement): void {
  if (!rowsByDepth[depth]) rowsByDepth[depth] = [];
  rowsByDepth[depth].push(row);
}

function findRowByName(
  rowByPath: Map<string, HTMLElement>,
  target: string,
): HTMLElement | undefined {
  const lower = target.toLowerCase();
  for (const [key, el] of rowByPath) {
    if (key.toLowerCase().endsWith(lower)) return el;
  }
  return undefined;
}

function buildRow(
  node: TreeNode,
  depth: number,
  ancestorLastFlags: boolean[],
  isLast: boolean,
  style: TreeStyle,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'sb-tree-row';
  if (node.highlight) row.classList.add('sb-tree-highlight');

  const prefix = document.createElement('span');
  prefix.className = 'sb-tree-prefix';
  prefix.textContent =
    style === 'tree'
      ? buildPrefix(ancestorLastFlags, isLast)
      : indentPrefix(depth);
  row.appendChild(prefix);

  const isFolder = !!node.children || node.name.endsWith('/');
  const name = document.createElement('span');
  name.className = isFolder ? 'sb-tree-name sb-tree-folder' : 'sb-tree-name sb-tree-file';
  name.textContent = node.name;
  row.appendChild(name);

  if (node.badge) {
    const badge = document.createElement('span');
    badge.className = 'cs-badge cs-badge--ink sb-tree-badge';
    badge.textContent = node.badge;
    row.appendChild(badge);
  }

  if (node.note) {
    const note = document.createElement('span');
    note.className = 'sb-tree-note';
    note.textContent = node.note;
    row.appendChild(note);
  }

  return row;
}

function buildPrefix(ancestorLastFlags: boolean[], isLast: boolean): string {
  // Classic tree notation: │   for open ancestors, "    " for closed,
  // ├── for intermediate, └── for the last child.
  let out = '';
  for (const last of ancestorLastFlags) {
    out += last ? '    ' : '\u2502   ';
  }
  out += isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
  return out;
}

function indentPrefix(depth: number): string {
  return '  '.repeat(depth);
}
