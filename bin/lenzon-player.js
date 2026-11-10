#!/usr/bin/env node
// @ts-check

// `lenzon-player play <file>` serves the prebuilt play page and one script,
// on this machine only, and opens the browser on it. `lenzon-player new
// <file>` writes a short script to start from. `lenzon-player check <file>`
// reports what is wrong with one, in the terminal, where an agent can read
// it. `lenzon-player skill` installs the agent skill into a project.
//
// This file never imports the player. The player cannot load in plain Node
// (an extensionless prismjs import), and it does not need to: the page in
// dist/play/ carries the player, and this only hands it files. So this is
// plain ESM with node: built-ins and no build step.

import { createServer } from 'node:http';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_DIR = fileURLToPath(new URL('../', import.meta.url));
const PLAY_DIR = fileURLToPath(new URL('../dist/play/', import.meta.url));
const TEMPLATES_FILE = fileURLToPath(new URL('../dist/templates.json', import.meta.url));
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const HELP = `lenzon-player ${PKG.version}

Usage:
  lenzon-player new <script.json>
  lenzon-player check <script.json>
  lenzon-player play <script.json> [options]
  lenzon-player skill

new writes a short script to start from. check lists what is wrong with
a script, and exits 1 if it will not play. play plays a script in your
browser. Edit the file and reload the page to see the change.

skill copies an agent skill for writing scripts into this project's
.claude/skills/, with the two guides beside it. Run it again after an
upgrade to refresh them.

WRITING-SCRIPTS.md and TEMPLATES.md, beside this package's README, say
how to write a script.

Options for play:
  --silent      no voice; scenes advance on a timer
  --no-open     print the address, and do not open a browser
  --port <n>    serve on this port; default is any free port
  -h, --help    this text
  -v, --version the version
`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.lottie': 'application/zip',
};

/** @param {string} message */
function fail(message) {
  process.stderr.write(`lenzon-player: ${message}\n`);
  process.exit(1);
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {{ command?: string, file?: string, silent: boolean, open: boolean, port: number }} */
  const opts = { silent: false, open: true, port: 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help' || arg === 'help') opts.command = 'help';
    else if (arg === '-v' || arg === '--version') opts.command = 'version';
    else if (arg === '--silent') opts.silent = true;
    else if (arg === '--no-open') opts.open = false;
    else if (arg === '--port') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 0 || n > 65535) fail('--port needs a number from 0 to 65535');
      opts.port = n;
    } else if (arg.startsWith('-')) fail(`unknown option ${arg}\n\n${HELP}`);
    else if (!opts.command) opts.command = arg;
    else if (!opts.file) opts.file = arg;
    else fail(`unexpected argument ${arg}`);
  }
  return opts;
}

/** Spoken words a second, at about 130 a minute. WRITING-SCRIPTS.md times everything by it. */
const WORDS_PER_SECOND = 2.2;

/** Beat actions the player acts on. The format lists more; see WRITING-SCRIPTS.md. */
const LIVE_BEATS = new Set(['emphasize', 'highlight-line']);
const IDLE_BEATS = new Set(['reveal', 'annotate', 'fx']);

/** @param {unknown} v */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks a script without the player, in the terminal.
 *
 * The page checks template names too, but only someone looking at the page
 * sees that. An agent writing a script works in a terminal, so the same
 * check, and more, has to print here.
 *
 * Errors are what stops a script playing, or plays it visibly wrong.
 * Warnings are the guide's rules: what plays, but plays worse. A file that
 * cannot be read as a script at all stops the command on the spot.
 *
 * Template names come from dist/templates.json, which the build writes
 * from the registry, so this never imports the player.
 *
 * @param {string} resolved the file to read
 * @param {string} file the name as typed, for messages
 * @returns {{ title: string, sceneCount: number, seconds: number, errors: string[], warnings: string[] }}
 */
function checkScript(resolved, file) {
  let text;
  try {
    text = readFileSync(resolved, 'utf8');
  } catch (err) {
    fail(`cannot read ${file}: ${/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT' ? 'no such file' : /** @type {Error} */ (err).message}`);
  }
  let script;
  try {
    script = JSON.parse(/** @type {string} */ (text));
  } catch (err) {
    fail(`${file} is not valid JSON: ${/** @type {Error} */ (err).message}`);
  }
  if (!isObject(script)) fail(`${file} is not a JSON object`);
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    fail(`${file} has no "scenes" list, or it is empty`);
  }
  if (!existsSync(TEMPLATES_FILE)) {
    fail(`the template list is not built at ${TEMPLATES_FILE}. Run \`npm run build\` in the player package.`);
  }
  /** @type {Record<string, { use: 'any' | 'code' }>} */
  const templates = JSON.parse(readFileSync(TEMPLATES_FILE, 'utf8'));

  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  if (!isObject(script.meta) || typeof script.meta.title !== 'string' || !script.meta.title) {
    warnings.push('meta.title is missing. The page shows it in the tab.');
  }
  if (!isObject(script.defaults)) {
    errors.push('defaults is missing. The player needs defaults.transition and defaults.voice.');
  } else {
    if (!isObject(script.defaults.transition)) errors.push('defaults.transition is missing, for example { "type": "fade", "durationMs": 400 }.');
    if (!isObject(script.defaults.voice)) errors.push('defaults.voice is missing, for example { "provider": "browser", "voiceId": "default", "speed": 1 }.');
    if (!isObject(script.defaults.palette)) warnings.push('defaults.palette is missing. Colors like "palette.primary" will not resolve.');
  }

  const seen = new Set();
  let seconds = 0;
  script.scenes.forEach((/** @type {any} */ scene, /** @type {number} */ i) => {
    const name = isObject(scene) && typeof scene.id === 'string' && scene.id ? `scene "${scene.id}"` : `scene ${i + 1}`;
    if (!isObject(scene)) {
      errors.push(`${name} is not an object.`);
      return;
    }
    if (typeof scene.id !== 'string' || !scene.id) errors.push(`${name} has no id.`);
    else if (seen.has(scene.id)) errors.push(`${name}: the id is used twice. Scene ids must be unique.`);
    seen.add(scene.id);

    const template = scene.primitive?.template;
    if (typeof template !== 'string') errors.push(`${name} has no primitive.template.`);
    else if (!templates[template]) errors.push(`${name} names an unknown template, "${template}". TEMPLATES.md lists them all.`);
    if (!isObject(scene.primitive?.content)) errors.push(`${name} has no primitive.content object.`);

    const hold = scene.holdSeconds;
    if (typeof hold !== 'number' || !(hold > 0)) errors.push(`${name}: holdSeconds must be a number above 0.`);
    else seconds += hold;

    if (typeof scene.narration !== 'string' || !scene.narration.trim()) {
      errors.push(`${name} has no narration.`);
    } else if (typeof hold === 'number' && hold > 0) {
      const spoken = scene.narration.trim().split(/\s+/).length / WORDS_PER_SECOND;
      if (hold < spoken) {
        warnings.push(`${name}: holdSeconds is ${hold}, but the narration takes about ${Math.ceil(spoken)} seconds to say. Hold for about ${Math.ceil(spoken + 1.5)}.`);
      }
    }

    if (scene.beats === undefined) return;
    if (!Array.isArray(scene.beats)) {
      errors.push(`${name}: beats must be a list.`);
      return;
    }
    scene.beats.forEach((/** @type {any} */ beat, /** @type {number} */ b) => {
      const label = `${name}, beat ${b + 1}`;
      const type = beat?.action?.type;
      if (typeof beat?.at !== 'number') errors.push(`${label}: "at" must be a number of seconds.`);
      if (typeof type !== 'string') {
        errors.push(`${label} has no action.type.`);
        return;
      }
      if (IDLE_BEATS.has(type)) warnings.push(`${label}: the player does not act on "${type}" beats yet. Use "emphasize".`);
      else if (!LIVE_BEATS.has(type)) errors.push(`${label}: "${type}" is not a beat action. Use "emphasize".`);
      if (type === 'emphasize' && (typeof beat.action.target !== 'string' || !beat.action.target)) {
        errors.push(`${label}: an emphasize beat needs a "target", as a string. TEMPLATES.md says what each template takes.`);
      }
      if (typeof beat.at === 'number') {
        if (beat.at < 0.8) warnings.push(`${label} fires at ${beat.at}s. Never fire a beat before 0.8s.`);
        if (typeof hold === 'number' && beat.at >= hold) warnings.push(`${label} fires at ${beat.at}s, after the scene's ${hold}s hold. It may never fire.`);
      }
    });
  });

  const estimated = script.meta?.estimatedDuration;
  if (typeof estimated === 'number' && seconds > 0 && Math.abs(estimated - seconds) > Math.max(5, seconds * 0.1)) {
    warnings.push(`meta.estimatedDuration is ${estimated}, but the holds add up to ${seconds}.`);
  }

  return {
    title: typeof script.meta?.title === 'string' && script.meta.title ? script.meta.title : path.basename(file),
    sceneCount: script.scenes.length,
    seconds,
    errors,
    warnings,
  };
}

/**
 * Prints a check's findings. Returns false when there are errors.
 *
 * @param {string} file
 * @param {ReturnType<typeof checkScript>} result
 */
function report(file, result) {
  for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
  for (const e of result.errors) process.stderr.write(`error: ${e}\n`);
  if (result.errors.length) {
    process.stderr.write(`\n${file}: ${result.errors.length} error(s). It will not play until they are fixed.\n`);
    return false;
  }
  return true;
}

/** @param {ReturnType<typeof parseArgs>} opts */
function check(opts) {
  if (!opts.file) fail(`check needs a script file\n\n${HELP}`);
  const file = /** @type {string} */ (opts.file);
  const result = checkScript(path.resolve(file), file);
  if (!report(file, result)) process.exit(1);
  const warned = result.warnings.length ? `, with ${result.warnings.length} warning(s)` : '';
  process.stdout.write(`${file}: ok — ${result.sceneCount} scenes, about ${result.seconds} seconds${warned}.\n`);
}

/**
 * Copies the agent skill and both guides into the project's
 * .claude/skills/. The guides go beside the skill because the skill reads
 * them, and a project run through npx has no node_modules copy to point at.
 * The folder is ours, so a second run overwrites it. That is how a project
 * picks up the guides from a newer version.
 */
function installSkill() {
  const dir = path.resolve('.claude', 'skills', 'lenzon-explainer');
  const existed = existsSync(path.join(dir, 'SKILL.md'));
  mkdirSync(dir, { recursive: true });
  for (const [from, to] of [
    ['skill/SKILL.md', 'SKILL.md'],
    ['WRITING-SCRIPTS.md', 'WRITING-SCRIPTS.md'],
    ['TEMPLATES.md', 'TEMPLATES.md'],
  ]) {
    copyFileSync(path.join(PKG_DIR, from), path.join(dir, to));
  }
  const rel = path.relative(process.cwd(), dir) || dir;
  process.stdout.write(
    `${existed ? 'Updated' : 'Installed'} the lenzon-explainer skill, from @lenzon/player ${PKG.version}, in ${rel}/\n` +
      `Ask your agent for an explainer, and it will use it.\n`,
  );
}

/**
 * Resolves a request path inside `root`, or null if it would leave it.
 *
 * @param {string} root
 * @param {string} urlPath
 */
function inside(root, urlPath) {
  const resolved = path.resolve(root, '.' + urlPath);
  return resolved === root || resolved.startsWith(root + path.sep) ? resolved : null;
}

/** @param {string} file */
async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Streams a file, honouring a single byte range. Safari will not play
 * audio from a server that cannot answer a range request.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} file
 */
async function sendFile(req, res, file) {
  const { size } = await stat(file);
  const type = TYPES[/** @type {keyof typeof TYPES} */ (path.extname(file).toLowerCase())] ?? 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  createReadStream(file).pipe(res);
}

/** @param {string} url */
function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  // No browser to open is not an error; the address is already printed.
  child.on('error', () => {});
  child.unref();
}

/**
 * The script `new` writes. It plays as it is, so the first thing a person
 * sees is their own file working. It uses only templates that suit any
 * idea, and leaves out `repoUrl` and `section`, which only code explainers
 * need. Its timings follow WRITING-SCRIPTS.md: holds of about 2.2 spoken
 * words a second plus a breath, and beats just after their word.
 */
const STARTER = {
  meta: {
    title: 'My idea',
    generatedAt: '',
    persona: 'friendly',
    estimatedDuration: 35,
  },
  defaults: {
    palette: {
      primary: '#3b82f6',
      secondary: '#a855f7',
      accent: '#f59e0b',
      background: '#0f172a',
      text: '#f8fafc',
      code: '#94a3b8',
    },
    transition: { type: 'fade', durationMs: 400 },
    voice: { provider: 'browser', voiceId: 'default', speed: 1 },
  },
  scenes: [
    {
      id: 'idea',
      primitive: {
        template: 'emphasis-word',
        content: { word: 'My idea', subtitle: 'One line on what it is' },
      },
      narration:
        'This is the start of an explainer. Change these words, and the words on screen, to tell your own idea.',
      holdSeconds: 11,
    },
    {
      id: 'how',
      primitive: {
        template: 'step-journey',
        content: {
          title: 'How it works',
          steps: [
            { label: 'The problem', detail: 'Who has it' },
            { label: 'The idea', detail: 'What you would do' },
            { label: 'The change', detail: 'What is better after' },
          ],
        },
      },
      narration:
        'Most ideas come in a few steps. First, name the problem. Then, say what you would do. Finally, show what changes.',
      holdSeconds: 12,
      beats: [
        { at: 3.5, action: { type: 'emphasize', target: '0' } },
        { at: 5.3, action: { type: 'emphasize', target: '1' } },
        { at: 8.0, action: { type: 'emphasize', target: '2' } },
      ],
    },
    {
      id: 'next',
      primitive: {
        template: 'title-bullets',
        content: {
          title: 'Why it matters',
          bullets: ['Say it in one line', 'Read WRITING-SCRIPTS.md', 'Pick templates from TEMPLATES.md'],
        },
      },
      narration:
        'End on why it matters. When you are ready for more, the writing guide and the template catalog come with the player.',
      holdSeconds: 12,
      beats: [
        { at: 6.2, action: { type: 'emphasize', target: '1' } },
        { at: 8.0, action: { type: 'emphasize', target: '2' } },
      ],
    },
  ],
};

/** @param {ReturnType<typeof parseArgs>} opts */
function create(opts) {
  if (!opts.file) fail(`new needs a file name to write\n\n${HELP}`);
  const file = /** @type {string} */ (opts.file);
  // Never overwrite. The file named may be a script someone spent an
  // afternoon on, and a starter is cheap to write somewhere else.
  if (existsSync(file)) fail(`${file} already exists. Pick a new name, or delete it first.`);
  const script = { ...STARTER, meta: { ...STARTER.meta, generatedAt: new Date().toISOString() } };
  try {
    writeFileSync(file, JSON.stringify(script, null, 2) + '\n', { flag: 'wx' });
  } catch (err) {
    fail(`cannot write ${file}: ${/** @type {Error} */ (err).message}`);
  }
  process.stdout.write(`Wrote ${file}. Play it with:\n\n  npx @lenzon/player play ${file}\n`);
}

/** @param {ReturnType<typeof parseArgs>} opts */
function play(opts) {
  if (!opts.file) fail(`play needs a script file\n\n${HELP}`);
  if (!existsSync(path.join(PLAY_DIR, 'play.html'))) {
    fail(`the play page is not built at ${PLAY_DIR}. Run \`npm run build\` in the player package.`);
  }
  const scriptFile = path.resolve(/** @type {string} */ (opts.file));
  const scriptDir = path.dirname(scriptFile);
  const result = checkScript(scriptFile, /** @type {string} */ (opts.file));
  if (!report(/** @type {string} */ (opts.file), result)) process.exit(1);
  const { title } = result;

  // The script is read again on every request, so a reload shows the
  // latest edit. Other paths are the page's own files first, then files
  // beside the script, which is how a relative narrationAudioUrl resolves.
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      if (urlPath === '/' || urlPath === '/index.html') {
        await sendFile(req, res, path.join(PLAY_DIR, 'play.html'));
        return;
      }
      if (urlPath === '/script.json') {
        res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
        res.end(await readFile(scriptFile));
        return;
      }
      for (const root of [PLAY_DIR.replace(/[\\/]$/, ''), scriptDir]) {
        const file = inside(root, urlPath);
        if (file && (await isFile(file))) {
          await sendFile(req, res, file);
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end(/** @type {Error} */ (err).message);
    }
  });

  server.on('error', (err) => fail(err.message));
  // Loopback only. The server hands out files from the script's folder,
  // which nobody else on the network should be able to read.
  server.listen(opts.port, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : opts.port;
    const url = `http://127.0.0.1:${port}/${opts.silent ? '?silent' : ''}`;
    process.stdout.write(`Playing "${title}" at ${url}\nEdit the file and reload the page to see changes. Press Ctrl-C to stop.\n`);
    if (opts.open) openBrowser(url);
  });
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.command || opts.command === 'help') process.stdout.write(HELP);
else if (opts.command === 'version') process.stdout.write(`${PKG.version}\n`);
else if (opts.command === 'new') create(opts);
else if (opts.command === 'check') check(opts);
else if (opts.command === 'play') play(opts);
else if (opts.command === 'skill') installSkill();
else fail(`unknown command ${opts.command}\n\n${HELP}`);
