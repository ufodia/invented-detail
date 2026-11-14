import './style.css';
import { reportJson, type FocusArea } from './core/report.ts';
import {
  boxShares,
  CLASSES,
  COLORS,
  type Analysis,
  type Options,
  type Support,
  type SupportRegion,
} from './core/support.ts';
import { demoPair } from './demo.ts';
import { byId, download, h, svg } from './dom.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

const MAX_FILE_BYTES = 80 * 1024 * 1024;
/** Decoding limit for the restoration; the analysis frame itself is capped at 1600 px. */
const MAX_OUTPUT_SIDE = 4096;

type Mode = 'swipe' | 'support' | 'source' | 'output';

interface Loaded {
  name: string;
  canvas: HTMLCanvasElement;
  naturalWidth: number;
  naturalHeight: number;
}

const MODES: { id: Mode; label: string }[] = [
  { id: 'swipe', label: 'Swipe' },
  { id: 'support', label: 'Support map' },
  { id: 'source', label: 'Source' },
  { id: 'output', label: 'Restoration' },
];

const LABEL: Record<Support, string> = {
  faithful: 'Faithful',
  enhanced: 'Enhanced',
  invented: 'Invented',
  contradicted: 'Contradicted',
};

const rgb = (c: Support) => `rgb(${COLORS[c].join(',')})`;
const pct = (v: number) => (v > 0 && v < 0.005 ? '<1' : Math.round(v * 100).toString());

let worker: Worker | null = null;
let job = 0;
let source: Loaded | null = null;
let output: Loaded | null = null;
let analysis: Analysis | null = null;
let options: Options | null = null;
let mode: Mode = 'swipe';
let split = 0.5;
let selected: number | null = null;
let focus: FocusArea[] = [];
let sourceUp: HTMLCanvasElement | null = null;
let outputFrame: HTMLCanvasElement | null = null;
let mapCanvas: HTMLCanvasElement | null = null;
let stage: HTMLCanvasElement | null = null;
let panel: HTMLElement | null = null;
let built = false;

const intro = byId('intro');
const progress = byId('progress');
const workspace = byId('workspace');
const introError = byId('intro-error');

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => onMessage(event.data));
  worker.addEventListener('error', () =>
    fail('The analysis engine stopped unexpectedly. Reload the page and try again.'),
  );
  return worker;
}
const send = (request: WorkerRequest, transfer: Transferable[] = []) =>
  getWorker().postMessage(request, transfer);

function canvasFrom(rgba: ArrayBuffer, width: number, height: number): HTMLCanvasElement {
  const canvas = h('canvas', { width, height });
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
}

function onMessage(message: WorkerResponse) {
  if (message.job !== job) return;
  if (message.type === 'progress') {
    byId('progress-message').textContent = message.message;
    const busy = document.getElementById('busy');
    if (busy) {
      busy.hidden = false;
      busy.textContent = message.message;
    }
  } else if (message.type === 'prepared') {
    options = message.recommended;
    outputFrame = canvasFrom(message.output, message.frame.width, message.frame.height);
    const small = canvasFrom(message.source, message.sourceSize.width, message.sourceSize.height);
    // The evidence, enlarged smoothly: what the source can show at the restoration's size.
    sourceUp = h('canvas', { width: message.frame.width, height: message.frame.height });
    const ctx = sourceUp.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, message.frame.width, message.frame.height);
  } else if (message.type === 'result') {
    analysis = message.analysis;
    mapCanvas = canvasFrom(message.map, analysis.frame.width, analysis.frame.height);
    focus = focus.map((f) => ({ ...f, shares: boxShares(analysis!, f) }));
    const busy = document.getElementById('busy');
    if (busy) busy.hidden = true;
    show('workspace');
    if (!built) build();
    renderPanel();
    draw();
  } else if (message.type === 'error') {
    fail(message.message);
  }
}

function show(view: 'intro' | 'progress' | 'workspace') {
  intro.hidden = view !== 'intro';
  progress.hidden = view !== 'progress';
  workspace.hidden = view !== 'workspace';
}

function fail(message: string) {
  if (analysis) {
    toast(message);
    show('workspace');
    return;
  }
  show('intro');
  introError.textContent = message;
  introError.hidden = false;
}

function toast(message: string) {
  const note = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(note);
  setTimeout(() => note.remove(), 4200);
}

// ——— Loading ———

function toCanvas(src: CanvasImageSource, width: number, height: number, maxSide: number): HTMLCanvasElement {
  const s = Math.min(1, maxSide / Math.max(width, height));
  const canvas = h('canvas', { width: Math.round(width * s), height: Math.round(height * s) });
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function decode(file: Blob, name: string, maxSide: number): Promise<Loaded> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${name} is larger than 80 MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`${name} could not be decoded. Use PNG, JPEG, WebP or AVIF.`);
  }
  const loaded = {
    name,
    canvas: toCanvas(bitmap, bitmap.width, bitmap.height, maxSide),
    naturalWidth: bitmap.width,
    naturalHeight: bitmap.height,
  };
  bitmap.close();
  return loaded;
}

function showSlot(which: 'source' | 'output', loaded: Loaded) {
  const slot = byId(`slot-${which}`);
  slot.classList.add('filled');
  slot.querySelector('.slot-thumb')?.remove();
  slot.prepend(
    h('img', {
      class: 'slot-thumb',
      alt: '',
      src: toCanvas(loaded.canvas, loaded.canvas.width, loaded.canvas.height, 200).toDataURL(
        'image/jpeg',
        0.8,
      ),
    }),
  );
  byId(`name-${which}`).textContent = `${loaded.name} · ${loaded.naturalWidth} × ${loaded.naturalHeight}`;
}

async function choose(which: 'source' | 'output', file: File) {
  introError.hidden = true;
  try {
    const loaded = await decode(file, file.name, which === 'source' ? 1024 : MAX_OUTPUT_SIDE);
    if (which === 'source') source = loaded;
    else output = loaded;
    showSlot(which, loaded);
    if (source && output) start();
  } catch (error) {
    fail((error as Error).message);
  }
}

function start() {
  if (!source || !output) return;
  analysis = null;
  options = null;
  built = false;
  selected = null;
  focus = [];
  workspace.replaceChildren();
  const a = source.canvas
    .getContext('2d', { willReadFrequently: true })!
    .getImageData(0, 0, source.canvas.width, source.canvas.height);
  const b = output.canvas
    .getContext('2d', { willReadFrequently: true })!
    .getImageData(0, 0, output.canvas.width, output.canvas.height);
  show('progress');
  byId('progress-message').textContent = 'Aligning the restoration with the source…';
  send(
    {
      type: 'load',
      job: ++job,
      source: { rgba: a.data.buffer as ArrayBuffer, width: a.width, height: a.height },
      output: { rgba: b.data.buffer as ArrayBuffer, width: b.width, height: b.height },
      options: null,
    },
    [a.data.buffer as ArrayBuffer, b.data.buffer as ArrayBuffer],
  );
}

for (const which of ['source', 'output'] as const) {
  const input = byId<HTMLInputElement>(`file-${which}`);
  input.addEventListener('change', () => {
    if (input.files?.[0]) void choose(which, input.files[0]);
    input.value = '';
  });
  const slot = byId(`slot-${which}`);
  slot.addEventListener('dragover', (event) => {
    event.preventDefault();
    slot.classList.add('over');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('over'));
  slot.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    slot.classList.remove('over');
    const file = event.dataTransfer?.files[0];
    if (file) void choose(which, file);
  });
}
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => {
  event.preventDefault();
  const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (files.length >= 2) {
    // The smaller file is the source; restorations are larger.
    const [a, b] = files.sort((x, y) => x.size - y.size);
    void (async () => {
      await choose('source', a);
      await choose('output', b);
    })();
  } else if (files.length === 1) void choose(source ? 'output' : 'source', files[0]);
});

byId('demo-button').addEventListener('click', () => {
  const pair = demoPair();
  source = {
    name: 'demo-old-photo.png',
    canvas: toCanvas(pair.source, 320, 240, 1024),
    naturalWidth: 320,
    naturalHeight: 240,
  };
  output = {
    name: 'demo-ai-restoration.png',
    canvas: toCanvas(pair.restoration, 1280, 960, MAX_OUTPUT_SIDE),
    naturalWidth: 1280,
    naturalHeight: 960,
  };
  showSlot('source', source);
  showSlot('output', output);
  start();
});

// ——— Workspace ———

let rangeInput: HTMLInputElement;

function build() {
  if (!analysis) return;
  built = true;
  stage = h('canvas', {
    id: 'stage',
    width: analysis.frame.width,
    height: analysis.frame.height,
    role: 'img',
    'aria-label': 'Comparison canvas. Drag to mark a focus area.',
  });
  const modebar = h('div', { class: 'modebar', role: 'tablist', 'aria-label': 'View' });
  for (const m of MODES)
    modebar.append(
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'mode',
          'data-mode': m.id,
          'aria-selected': String(m.id === mode),
          onclick: () => setMode(m.id),
        },
        m.label,
      ),
    );
  rangeInput = h('input', {
    id: 'view-range',
    type: 'range',
    min: 0,
    max: 100,
    value: Math.round(split * 100),
    'aria-label': 'Swipe position',
  });
  rangeInput.addEventListener('input', () => {
    split = Number(rangeInput.value) / 100;
    draw();
  });
  const legend = h(
    'div',
    { class: 'legend' },
    ...CLASSES.map((c) => h('span', { class: `key c-${c}` }, h('i', { 'aria-hidden': 'true' }), LABEL[c])),
  );
  panel = h('aside', { class: 'panel', 'aria-label': 'Results' });
  workspace.replaceChildren(
    h(
      'div',
      { class: 'ws-head' },
      h(
        'div',
        {},
        h('p', { class: 'eyebrow' }, 'Restoration check'),
        h('h1', {}, `${source!.name} → ${output!.name}`),
      ),
      h(
        'div',
        { class: 'ws-actions' },
        h('span', { id: 'busy', class: 'busy', hidden: true }),
        h(
          'button',
          { class: 'button ghost small', type: 'button', onclick: () => reset() },
          'New comparison',
        ),
      ),
    ),
    h(
      'div',
      { class: 'ws-grid' },
      h(
        'div',
        { class: 'viewer' },
        modebar,
        h('div', { class: 'stage-wrap' }, stage),
        h(
          'div',
          { class: 'controls' },
          h('label', { class: 'range-label', for: 'view-range' }, 'Swipe', rangeInput),
          legend,
        ),
        h(
          'p',
          { class: 'hint' },
          'Drag on the image to mark a focus area — a face, a sign, a document — and see what supports it.',
        ),
      ),
      panel,
    ),
  );
  wireStage();
}

function setMode(next: Mode) {
  mode = next;
  for (const b of workspace.querySelectorAll<HTMLButtonElement>('.mode'))
    b.setAttribute('aria-selected', String(b.dataset.mode === mode));
  rangeInput.disabled = mode !== 'swipe';
  draw();
}

function draw(preview?: { x: number; y: number; w: number; h: number }) {
  if (!stage || !analysis || !sourceUp || !outputFrame) return;
  const ctx = stage.getContext('2d')!;
  const W = stage.width;
  const H = stage.height;
  ctx.clearRect(0, 0, W, H);
  if (mode === 'swipe') {
    ctx.drawImage(sourceUp, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(split * W, 0, W - split * W, H);
    ctx.clip();
    ctx.drawImage(outputFrame, 0, 0);
    ctx.restore();
  } else if (mode === 'support') {
    ctx.filter = 'grayscale(1) brightness(0.8)';
    ctx.drawImage(outputFrame, 0, 0);
    ctx.filter = 'none';
    if (mapCanvas) ctx.drawImage(mapCanvas, 0, 0);
  } else ctx.drawImage(mode === 'source' ? sourceUp : outputFrame, 0, 0);
  const px = W / Math.max(1, stage.getBoundingClientRect().width || W);
  if (mode === 'swipe') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(split * W - px, 0, 2 * px, H);
    ctx.font = `700 ${12 * px}px system-ui, sans-serif`;
    for (const [text, x, align] of [
      ['SOURCE', split * W - 10 * px, 'right'],
      ['RESTORATION', split * W + 10 * px, 'left'],
    ] as const) {
      ctx.textAlign = align;
      const width = ctx.measureText(text).width + 12 * px;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(align === 'right' ? x - width + 6 * px : x - 6 * px, 10 * px, width, 22 * px);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x, 26 * px);
    }
  }
  for (const r of analysis.regions) {
    const active = r.id === selected;
    ctx.strokeStyle = rgb(r.kind);
    ctx.lineWidth = (active ? 4 : 2) * px;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    badge(ctx, String(r.id), r.x, r.y, rgb(r.kind), px);
  }
  focus.forEach((f, i) => {
    ctx.setLineDash([8 * px, 5 * px]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * px;
    ctx.strokeRect(f.x, f.y, f.width, f.height);
    ctx.setLineDash([]);
    badge(ctx, `F${i + 1}`, f.x, f.y, '#ffffff', px);
  });
  if (preview) {
    ctx.setLineDash([8 * px, 5 * px]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * px;
    ctx.strokeRect(preview.x, preview.y, preview.w, preview.h);
    ctx.setLineDash([]);
  }
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, px: number) {
  ctx.font = `800 ${12 * px}px system-ui, sans-serif`;
  const w = Math.max(22 * px, ctx.measureText(text).width + 10 * px);
  const top = Math.max(0, y - 22 * px);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, top, w, 22 * px, 6 * px);
  ctx.fill();
  ctx.fillStyle = '#1d1410';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, top + 12 * px);
  ctx.textBaseline = 'alphabetic';
}

function wireStage() {
  if (!stage) return;
  const target = stage;
  let start: { x: number; y: number } | null = null;
  const point = (event: PointerEvent) => {
    const rect = target.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * target.width,
      y: ((event.clientY - rect.top) / rect.height) * target.height,
    };
  };
  target.addEventListener('pointerdown', (event) => {
    target.setPointerCapture(event.pointerId);
    start = point(event);
  });
  target.addEventListener('pointermove', (event) => {
    if (!start) return;
    const p = point(event);
    draw({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  });
  target.addEventListener('pointerup', (event) => {
    if (!start || !analysis) return;
    const p = point(event);
    const box = {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      width: Math.abs(p.x - start.x),
      height: Math.abs(p.y - start.y),
    };
    start = null;
    if (box.width > 8 && box.height > 8) {
      focus.push({ label: `Focus area ${focus.length + 1}`, ...box, shares: boxShares(analysis, box) });
      renderPanel();
    }
    draw();
  });
  window.addEventListener('resize', () => draw());
}

function donut(shares: Record<Support, number>, score: number) {
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = CLASSES.map((cls) => {
    const len = shares[cls] * c;
    const arc = svg('circle', {
      cx: 64,
      cy: 64,
      r,
      fill: 'none',
      stroke: rgb(cls),
      'stroke-width': 14,
      'stroke-dasharray': `${len} ${c - len}`,
      'stroke-dashoffset': -offset,
      transform: 'rotate(-90 64 64)',
    });
    offset += len;
    return arc;
  });
  return h(
    'div',
    { class: 'donut' },
    svg(
      'svg',
      { viewBox: '0 0 128 128', 'aria-hidden': 'true' },
      svg('circle', { cx: 64, cy: 64, r, fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': 14 }),
      ...arcs,
    ),
    h('div', { class: 'donut-label' }, h('strong', {}, `${pct(score)} %`), h('span', {}, 'supported')),
  );
}

function bars(shares: Record<Support, number>) {
  return h(
    'div',
    { class: 'bars' },
    ...CLASSES.map((c) =>
      h(
        'div',
        { class: `bar-row c-${c}` },
        h('span', { class: 'bar-name' }, LABEL[c]),
        h('div', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: `width:${shares[c] * 100}%` })),
        h('span', { class: 'bar-value' }, `${pct(shares[c])} %`),
      ),
    ),
  );
}

function crop(
  src: HTMLCanvasElement,
  r: { x: number; y: number; width: number; height: number },
  size = 120,
) {
  const side = Math.max(r.width, r.height) * 1.2 + 16;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const sx = Math.max(0, Math.min(src.width - side, cx - side / 2));
  const sy = Math.max(0, Math.min(src.height - side, cy - side / 2));
  const canvas = h('canvas', { width: size, height: size, class: 'crop' });
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, Math.min(side, src.width), Math.min(side, src.height), 0, 0, size, size);
  return canvas;
}

function regionCard(r: SupportRegion) {
  const why =
    r.kind === 'contradicted'
      ? `Blurred to the source's resolution it still differs by ${r.consistency.toFixed(1)} — the source shows something else here.`
      : `Adds detail of strength ${r.addedDetail.toFixed(1)} where the source carries only ${r.sourceDetail.toFixed(1)}. The source cannot confirm it.`;
  return h(
    'li',
    { class: `region c-${r.kind} ${selected === r.id ? 'active' : ''}` },
    h(
      'header',
      {},
      h('span', { class: 'badge' }, String(r.id)),
      h(
        'div',
        {},
        h('strong', {}, LABEL[r.kind]),
        h('span', { class: 'muted' }, `${pct(r.area)} % of the image`),
      ),
    ),
    h('p', { class: 'why' }, why),
    h(
      'div',
      { class: 'crops' },
      h('figure', {}, crop(sourceUp!, r), h('figcaption', {}, 'Source')),
      h('figure', {}, crop(outputFrame!, r), h('figcaption', {}, 'Restoration')),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'link',
        onclick: () => {
          selected = selected === r.id ? null : r.id;
          renderPanel();
          draw();
          stage?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
      },
      selected === r.id ? 'Unhighlight' : 'Highlight',
    ),
  );
}

function renderPanel() {
  if (!analysis || !panel || !options) return;
  const a = analysis;
  const headline =
    a.supportScore >= 0.85
      ? 'Mostly supported by the source'
      : a.supportScore >= 0.6
        ? 'Partly invented'
        : 'Largely invented';
  const modeToggle = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Compare' });
  for (const [value, label] of [
    ['colour', 'Colour'],
    ['lightness', 'Lightness only'],
  ] as const)
    modeToggle.append(
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'aria-checked': String(options.mode === value),
          onclick: () => {
            options = { ...options!, mode: value };
            send({ type: 'analyze', job: ++job, options });
          },
        },
        label,
      ),
    );
  const grade = h('input', { type: 'checkbox', checked: options.compensateTone });
  grade.addEventListener('change', () => {
    options = { ...options!, compensateTone: grade.checked };
    send({ type: 'analyze', job: ++job, options });
  });
  const facts: [string, string, boolean?][] = [
    [
      'Resolution gain',
      a.alignment.scale > 1.05
        ? `${a.alignment.scale.toFixed(1)}× — ${pct(a.synthesizedShare)} % of the restoration's pixels do not exist in the source.`
        : 'Same resolution as the source.',
    ],
    [
      'Alignment',
      `Restoration ${a.outputSize.width} × ${a.outputSize.height} px matched to the ${a.source.width} × ${a.source.height} px source.`,
      a.alignment.doubtful,
    ],
    [
      'Comparison',
      a.options.mode === 'lightness'
        ? `Lightness only${a.monochromeSource ? ' — the source has no colour, so colourization is not counted as a change.' : '.'}`
        : 'Colour and lightness.',
    ],
    [
      'Global grade',
      a.tone.significant
        ? `Brightness or colour changed overall (ΔE ${a.tone.shift.toFixed(1)}). ${a.options.compensateTone ? 'Set aside.' : 'Counted.'}`
        : 'No overall grade change.',
    ],
  ];
  panel.replaceChildren(
    h(
      'section',
      { class: 'summary' },
      donut(a.shares, a.supportScore),
      h(
        'div',
        {},
        h('p', { class: 'eyebrow' }, 'Verdict'),
        h('h2', {}, headline),
        h(
          'p',
          { class: 'muted' },
          `${pct(a.shares.invented)} % invented · ${pct(a.shares.contradicted)} % contradicted`,
        ),
      ),
      bars(a.shares),
    ),
    h(
      'section',
      { class: 'facts' },
      ...facts.map(([k, v, warn]) =>
        h('div', { class: `fact ${warn ? 'warn' : ''}` }, h('h3', {}, k), h('p', {}, v)),
      ),
    ),
    h(
      'section',
      { class: 'settings' },
      h('h3', {}, 'Compare'),
      modeToggle,
      h('label', { class: 'check' }, grade, 'Ignore an overall brightness or colour grade'),
    ),
    h(
      'section',
      {},
      h('h3', {}, focus.length ? 'Focus areas' : 'Focus areas'),
      focus.length
        ? h(
            'ol',
            { class: 'focus' },
            ...focus.map((f, i) =>
              h(
                'li',
                {},
                h(
                  'header',
                  {},
                  h('strong', {}, `F${i + 1}`),
                  h('span', { class: 'muted' }, `${pct(f.shares.faithful + f.shares.enhanced)} % supported`),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'link',
                      onclick: () => {
                        focus.splice(i, 1);
                        renderPanel();
                        draw();
                      },
                    },
                    'Remove',
                  ),
                ),
                bars(f.shares),
              ),
            ),
          )
        : h(
            'p',
            { class: 'muted' },
            'Drag a box on the image around a face, a sign or any detail you care about.',
          ),
    ),
    h(
      'section',
      {},
      h('h3', {}, a.regions.length ? 'Regions to question' : 'No regions to question'),
      a.regions.length
        ? h('ol', { class: 'regions' }, ...a.regions.slice(0, 12).map(regionCard))
        : h('p', { class: 'muted' }, 'No sizeable invented or contradicted areas were found.'),
    ),
    h(
      'section',
      { class: 'exports' },
      h('h3', {}, 'Export'),
      h(
        'button',
        { class: 'button small primary', type: 'button', onclick: () => exportSheet() },
        'Comparison sheet (PNG)',
      ),
      h('button', { class: 'button small', type: 'button', onclick: () => exportMap() }, 'Support map (PNG)'),
      h(
        'button',
        {
          class: 'button small',
          type: 'button',
          onclick: () => download('invented-detail-report.json', reportJson(a, files(), focus)),
        },
        'Report (JSON)',
      ),
    ),
  );
}

function files() {
  return {
    source: { name: source!.name, width: source!.naturalWidth, height: source!.naturalHeight },
    output: { name: output!.name, width: output!.naturalWidth, height: output!.naturalHeight },
  };
}

function saveCanvas(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

function footer(ctx: CanvasRenderingContext2D, width: number, y: number) {
  const a = analysis!;
  ctx.fillStyle = '#1d1410';
  ctx.fillRect(0, y, width, 76);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4b183';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(`Invented Detail · ${pct(a.supportScore)} % supported by the source`, 20, y + 30);
  ctx.font = '14px system-ui, sans-serif';
  let x = 20;
  for (const c of CLASSES) {
    ctx.fillStyle = rgb(c);
    ctx.fillRect(x, y + 46, 12, 12);
    ctx.fillStyle = '#e8ddd5';
    const text = `${LABEL[c]} ${pct(a.shares[c])} %`;
    ctx.fillText(text, x + 18, y + 57);
    x += ctx.measureText(text).width + 40;
  }
}

function exportMap() {
  const a = analysis!;
  const canvas = h('canvas', { width: a.frame.width, height: a.frame.height + 76 });
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'grayscale(1) brightness(0.8)';
  ctx.drawImage(outputFrame!, 0, 0);
  ctx.filter = 'none';
  ctx.drawImage(mapCanvas!, 0, 0);
  for (const r of a.regions) {
    ctx.strokeStyle = rgb(r.kind);
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    badge(ctx, String(r.id), r.x, r.y, rgb(r.kind), 1);
  }
  footer(ctx, canvas.width, a.frame.height);
  saveCanvas(canvas, 'invented-detail-map.png');
}

function exportSheet() {
  const a = analysis!;
  const gap = 16;
  const top = 44;
  const canvas = h('canvas', { width: a.frame.width * 2 + gap, height: a.frame.height + top + 76 });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1d1410';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f5ece4';
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Source — ${source!.name} (${source!.naturalWidth} × ${source!.naturalHeight}, enlarged)`,
    8,
    28,
  );
  ctx.fillText(`Restoration — ${output!.name}`, a.frame.width + gap + 8, 28);
  ctx.drawImage(sourceUp!, 0, top);
  ctx.drawImage(outputFrame!, a.frame.width + gap, top);
  for (const offset of [0, a.frame.width + gap])
    for (const r of a.regions) {
      ctx.strokeStyle = rgb(r.kind);
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x + offset, r.y + top, r.width, r.height);
      badge(ctx, String(r.id), r.x + offset, r.y + top, rgb(r.kind), 1);
    }
  footer(ctx, canvas.width, a.frame.height + top);
  saveCanvas(canvas, 'invented-detail-comparison.png');
}

function reset() {
  job++;
  source = null;
  output = null;
  analysis = null;
  built = false;
  workspace.replaceChildren();
  for (const which of ['source', 'output']) {
    const slot = byId(`slot-${which}`);
    slot.classList.remove('filled');
    slot.querySelector('.slot-thumb')?.remove();
    byId(`name-${which}`).textContent = 'PNG, JPEG, WebP — or drop it here';
  }
  show('intro');
}

show('intro');
