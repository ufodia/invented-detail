import { align, type Alignment } from './align.ts';
import { boxBlur, fromRgba, gradient, resize, rgbToLab, sample, type Plane, type RgbImage } from './image.ts';
import { components } from './regions.ts';
import { compensate, fitTone } from './tone.ts';

/**
 * How much of an AI restoration or upscale is supported by the source photo?
 *
 * The source is the only evidence. An output pixel can be checked against it
 * only down to the source's resolution: averaging the output back to the
 * source grid must reproduce the source ("consistency"). Detail finer than
 * the source grid ("added detail") cannot be checked at all. Where the source
 * itself was flat or blurred, that added detail was invented.
 */

export type Mode = 'colour' | 'lightness';

export type Support = 'faithful' | 'enhanced' | 'invented' | 'contradicted';

export const CLASSES: Support[] = ['faithful', 'enhanced', 'invented', 'contradicted'];

export interface Options {
  /** Lightness only for colourized restorations of black-and-white photos. */
  mode: Mode;
  /** Ignore a global grade (brightness, contrast, colour cast) before comparing. */
  compensateTone: boolean;
}

/** Tile size in source pixels. */
export const TILE = 4;

/** Tile codes outside the four classes: not covered by the restoration, or on the photo's border. */
export const UNCOVERED = 255;
export const EDGE = 254;

export const THRESHOLDS = {
  /** Mean ΔE (or ΔL) between the output averaged back to the source grid and the source. */
  contradiction: 10,
  /** Mean lightness of detail finer than the source grid, in L* units. */
  addedDetail: 5,
  /** Source detail (mean gradient of L*, per source pixel) below which added detail counts as invented. */
  sourceDetail: 6,
};

export interface Prepared {
  /** The source photo, at most 1024 px on the longer side. */
  source: RgbImage;
  /** The AI output resampled into a frame aligned with the source, `factor` times larger. */
  output: RgbImage;
  valid: Uint8Array;
  factor: number;
  alignment: Alignment;
  outputSize: { width: number; height: number };
  /** True when the source has almost no colour: lightness-only comparison is recommended. */
  monochromeSource: boolean;
}

export interface SupportRegion {
  id: number;
  kind: 'invented' | 'contradicted';
  /** Box in frame (output) pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Share of the frame. */
  area: number;
  consistency: number;
  addedDetail: number;
  sourceDetail: number;
}

export interface Analysis {
  options: Options;
  frame: { width: number; height: number };
  source: { width: number; height: number };
  outputSize: { width: number; height: number };
  factor: number;
  alignment: Alignment;
  monochromeSource: boolean;
  tone: { significant: boolean; shift: number };
  /** Share of output pixels that do not exist in the source: 1 − 1/factor². */
  synthesizedShare: number;
  shares: Record<Support, number>;
  /** Faithful + enhanced: the part of the picture the source can vouch for. */
  supportScore: number;
  regions: SupportRegion[];
  /** Tile grid in source tiles. */
  tiles: {
    columns: number;
    rows: number;
    classes: Uint8Array;
    consistency: Float32Array;
    added: Float32Array;
    detail: Float32Array;
  };
}

const MAX_SOURCE = 1024;
const MAX_FRAME = 1600;

/**
 * A photo is monochrome when its colour is a function of lightness alone:
 * greyscale, sepia, cyanotype and other toned prints. Fit a* and b* as lines
 * of L* and check how far pixels stray from them.
 */
export function isMonochrome(img: RgbImage): boolean {
  const step = Math.max(1, Math.floor((img.width * img.height) / 20_000));
  const L: number[] = [];
  const A: number[] = [];
  const B: number[] = [];
  for (let i = 0; i < img.width * img.height; i += step) {
    const [l, a, b] = rgbToLab(img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]);
    L.push(l);
    A.push(a);
    B.push(b);
  }
  const residual = (y: number[]) => {
    const n = L.length;
    const mx = L.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (L[i] - mx) * (y[i] - my);
      sxx += (L[i] - mx) ** 2;
    }
    const slope = sxx ? sxy / sxx : 0;
    let r = 0;
    for (let i = 0; i < n; i++) r += (y[i] - (my + slope * (L[i] - mx))) ** 2;
    return Math.sqrt(r / n);
  };
  return L.length > 0 && residual(A) < 3 && residual(B) < 3;
}

export function prepare(
  sourceRgba: Uint8ClampedArray | Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  outputRgba: Uint8ClampedArray | Uint8Array,
  outputWidth: number,
  outputHeight: number,
): Prepared {
  let source = fromRgba(sourceRgba, sourceWidth, sourceHeight);
  if (Math.max(sourceWidth, sourceHeight) > MAX_SOURCE) {
    const s = MAX_SOURCE / Math.max(sourceWidth, sourceHeight);
    source = resize(source, Math.round(sourceWidth * s), Math.round(sourceHeight * s));
  }
  const output = fromRgba(outputRgba, outputWidth, outputHeight);

  // Align on a copy of the output shrunk to the source's size, then scale the transform back up.
  const ratio = (outputWidth / source.width + outputHeight / source.height) / 2;
  const small =
    ratio > 1.02
      ? resize(
          output,
          Math.max(8, Math.round(outputWidth / ratio)),
          Math.max(8, Math.round(outputHeight / ratio)),
        )
      : output;
  const t = align(source, small);
  const f = outputWidth / small.width;
  // Pixel centres: an output index u relates to a small-image index v by u = f·v + (f − 1) / 2.
  const alignment: Alignment = {
    ...t,
    scale: t.scale * f,
    tx: t.tx * f + (f - 1) / 2,
    ty: t.ty * f + (f - 1) / 2,
  };

  // The comparison frame: the source grid enlarged by `factor`, at most 1600 px.
  const factor = Math.max(1, Math.min(alignment.scale, MAX_FRAME / Math.max(source.width, source.height)));
  const width = Math.round(source.width * factor);
  const height = Math.round(source.height * factor);
  // Prefilter the output when the frame is much smaller than it, so sampling does not alias.
  const shrink = alignment.scale / factor;
  const filtered =
    shrink > 1.5
      ? resize(output, Math.round(outputWidth / shrink), Math.round(outputHeight / shrink))
      : output;
  const fs = outputWidth / filtered.width;
  const data = new Float32Array(width * height * 3);
  const valid = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      // Frame pixel centre → source index coordinates → output coordinates.
      const sx = (x + 0.5) / factor - 0.5;
      const sy = (y + 0.5) / factor - 0.5;
      let ox = (alignment.scale * sx + alignment.tx - (fs - 1) / 2) / fs;
      let oy = (alignment.scale * sy + alignment.ty - (fs - 1) / 2) / fs;
      // Half a pixel past the edge is still the edge pixel, not missing content.
      if (ox > -1 && ox < 0) ox = 0;
      if (oy > -1 && oy < 0) oy = 0;
      if (ox > filtered.width - 1 && ox < filtered.width) ox = filtered.width - 1;
      if (oy > filtered.height - 1 && oy < filtered.height) oy = filtered.height - 1;
      const i = y * width + x;
      const r = sample(filtered, ox, oy, 0);
      if (Number.isNaN(r)) continue;
      valid[i] = 1;
      data[i * 3] = r;
      data[i * 3 + 1] = sample(filtered, ox, oy, 1);
      data[i * 3 + 2] = sample(filtered, ox, oy, 2);
    }
  return {
    source,
    output: { width, height, data },
    valid,
    factor,
    alignment,
    outputSize: { width: outputWidth, height: outputHeight },
    monochromeSource: isMonochrome(source),
  };
}

function lightness(img: RgbImage): Plane {
  const data = new Float32Array(img.width * img.height);
  for (let i = 0; i < data.length; i++)
    data[i] = rgbToLab(img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2])[0];
  return { width: img.width, height: img.height, data };
}

function toGrey(img: RgbImage): RgbImage {
  const data = new Float32Array(img.data.length);
  for (let i = 0; i < img.width * img.height; i++) {
    const v = 0.2126 * img.data[i * 3] + 0.7152 * img.data[i * 3 + 1] + 0.0722 * img.data[i * 3 + 2];
    data[i * 3] = data[i * 3 + 1] = data[i * 3 + 2] = v;
  }
  return { width: img.width, height: img.height, data };
}

/** Bilinear upsample of a plane to a larger grid with pixel-centre alignment. */
function upsample(plane: Plane, width: number, height: number): Plane {
  const out = new Float32Array(width * height);
  const fx = plane.width / width;
  const fy = plane.height / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(plane.height - 1, Math.max(0, (y + 0.5) * fy - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(plane.height - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(plane.width - 1, Math.max(0, (x + 0.5) * fx - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(plane.width - 1, x0 + 1);
      const wx = sx - x0;
      const a = plane.data[y0 * plane.width + x0];
      const b = plane.data[y0 * plane.width + x1];
      const c = plane.data[y1 * plane.width + x0];
      const d = plane.data[y1 * plane.width + x1];
      out[y * width + x] = a + (b - a) * wx + (c - a) * wy + (a - b - c + d) * wx * wy;
    }
  }
  return { width, height, data: out };
}

export function analyze(p: Prepared, options: Options): Analysis {
  const { source } = p;
  const { width: W, height: H } = p.output;
  const sw = source.width;
  const sh = source.height;
  const lightnessOnly = options.mode === 'lightness';

  // The output averaged back onto the source grid, after an optional global grade match.
  const down = resize(p.output, sw, sh);
  const sourceView = lightnessOnly ? toGrey(source) : source;
  let downView = lightnessOnly ? toGrey(down) : down;
  const tone = fitTone(sourceView, downView, () => true);
  if (options.compensateTone) downView = compensate(downView, tone);

  // Consistency per source pixel (light blur absorbs grain and compression noise).
  const labS = [0, 1, 2].map(() => new Float32Array(sw * sh));
  const labD = [0, 1, 2].map(() => new Float32Array(sw * sh));
  for (let i = 0; i < sw * sh; i++) {
    const a = rgbToLab(sourceView.data[i * 3], sourceView.data[i * 3 + 1], sourceView.data[i * 3 + 2]);
    const b = rgbToLab(downView.data[i * 3], downView.data[i * 3 + 1], downView.data[i * 3 + 2]);
    for (let c = 0; c < 3; c++) {
      labS[c][i] = a[c];
      labD[c][i] = b[c];
    }
  }
  const blur = (data: Float32Array) => boxBlur({ width: sw, height: sh, data }, 1).data;
  const S = labS.map(blur);
  const D = labD.map(blur);
  const consistency = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++)
    consistency[i] = lightnessOnly
      ? Math.abs(S[0][i] - D[0][i])
      : Math.hypot(S[0][i] - D[0][i], S[1][i] - D[1][i], S[2][i] - D[2][i]);

  // Detail finer than the source grid: the output minus its own band-limited version.
  const outL = lightness(p.output);
  const downL = lightness(down);
  const coarse = upsample(downL, W, H);
  const added = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) added[i] = p.valid[i] ? Math.abs(outL.data[i] - coarse.data[i]) : 0;

  // How much detail the source itself carries, per source pixel.
  const srcGrad = gradient(lightness(source));

  // Classify tiles of TILE × TILE source pixels.
  const columns = Math.ceil(sw / TILE);
  const rows = Math.ceil(sh / TILE);
  const classes = new Uint8Array(columns * rows);
  const tc = new Float32Array(columns * rows);
  const ta = new Float32Array(columns * rows);
  const td = new Float32Array(columns * rows);
  const counts: Record<Support, number> = { faithful: 0, enhanced: 0, invented: 0, contradicted: 0 };
  let validTiles = 0;
  const T = THRESHOLDS;
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < columns; tx++) {
      let c = 0;
      let d = 0;
      let n = 0;
      for (let y = ty * TILE; y < Math.min(sh, (ty + 1) * TILE); y++)
        for (let x = tx * TILE; x < Math.min(sw, (tx + 1) * TILE); x++) {
          c += consistency[y * sw + x];
          d += srcGrad.data[y * sw + x] / 4; // Sobel sums four differences
          n++;
        }
      let a = 0;
      let m = 0;
      let covered = 0;
      const x0 = Math.floor(tx * TILE * p.factor);
      const x1 = Math.min(W, Math.floor((tx + 1) * TILE * p.factor));
      const y0 = Math.floor(ty * TILE * p.factor);
      const y1 = Math.min(H, Math.floor((ty + 1) * TILE * p.factor));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          m++;
          if (!p.valid[y * W + x]) continue;
          covered++;
          a += added[y * W + x] ** 2;
        }
      const k = ty * columns + tx;
      tc[k] = c / n;
      td[k] = d / n;
      ta[k] = covered ? Math.sqrt(a / covered) : 0;
      if (!m || covered / m < 0.5) {
        classes[k] = UNCOVERED;
        continue;
      }
      // Resampling, blur and scanning are unreliable at the outermost ring of the photo.
      if (tx === 0 || ty === 0 || tx === columns - 1 || ty === rows - 1) {
        classes[k] = EDGE;
        continue;
      }
      validTiles++;
      const cls: Support =
        tc[k] > T.contradiction
          ? 'contradicted'
          : ta[k] > T.addedDetail
            ? td[k] < T.sourceDetail
              ? 'invented'
              : 'enhanced'
            : 'faithful';
      classes[k] = CLASSES.indexOf(cls);
      counts[cls]++;
    }

  const shares = Object.fromEntries(
    CLASSES.map((c) => [c, validTiles ? counts[c] / validTiles : 0]),
  ) as Record<Support, number>;

  // Regions of invented and contradicted tiles.
  const regions: SupportRegion[] = [];
  for (const kind of ['contradicted', 'invented'] as const) {
    const mask = new Uint8Array(columns * rows);
    for (let k = 0; k < mask.length; k++) if (classes[k] === CLASSES.indexOf(kind)) mask[k] = 1;
    const { labels, list } = components(mask, columns, rows);
    for (const comp of list) {
      // Single tiles and pairs are noise at this scale; regions start at three tiles.
      if (comp.pixels < 3) continue;
      let c = 0;
      let a = 0;
      let d = 0;
      for (let k = 0; k < labels.length; k++)
        if (labels[k] === comp.id) {
          c += tc[k];
          a += ta[k];
          d += td[k];
        }
      const scale = TILE * p.factor;
      regions.push({
        id: 0,
        kind,
        x: Math.floor(comp.x0 * scale),
        y: Math.floor(comp.y0 * scale),
        width: Math.min(W, Math.ceil((comp.x1 + 1) * scale)) - Math.floor(comp.x0 * scale),
        height: Math.min(H, Math.ceil((comp.y1 + 1) * scale)) - Math.floor(comp.y0 * scale),
        area: comp.pixels / Math.max(1, validTiles),
        consistency: c / comp.pixels,
        addedDetail: a / comp.pixels,
        sourceDetail: d / comp.pixels,
      });
    }
  }
  regions.sort((a, b) => (a.kind === b.kind ? b.area - a.area : a.kind === 'contradicted' ? -1 : 1));
  regions.forEach((r, i) => (r.id = i + 1));

  return {
    options,
    frame: { width: W, height: H },
    source: { width: sw, height: sh },
    outputSize: p.outputSize,
    factor: p.factor,
    alignment: p.alignment,
    monochromeSource: p.monochromeSource,
    tone: { significant: tone.significant, shift: tone.shift },
    synthesizedShare: p.alignment.scale > 1 ? 1 - 1 / p.alignment.scale ** 2 : 0,
    shares,
    supportScore: shares.faithful + shares.enhanced,
    regions,
    tiles: { columns, rows, classes, consistency: tc, added: ta, detail: td },
  };
}

export const COLORS: Record<Support, [number, number, number]> = {
  faithful: [92, 196, 142],
  enhanced: [98, 160, 234],
  invented: [244, 177, 74],
  contradicted: [236, 84, 84],
};

/** RGBA overlay of tile classes at frame resolution. */
export function supportMap(a: Analysis, only?: Support): Uint8ClampedArray {
  const { width: W, height: H } = a.frame;
  const out = new Uint8ClampedArray(W * H * 4);
  const scale = TILE * a.factor;
  for (let y = 0; y < H; y++) {
    const ty = Math.min(a.tiles.rows - 1, Math.floor(y / scale));
    for (let x = 0; x < W; x++) {
      const tx = Math.min(a.tiles.columns - 1, Math.floor(x / scale));
      const cls = a.tiles.classes[ty * a.tiles.columns + tx];
      const o = (y * W + x) * 4;
      if (cls === EDGE) continue;
      if (cls === UNCOVERED) {
        out[o] = out[o + 1] = out[o + 2] = 60;
        out[o + 3] = 160;
        continue;
      }
      const name = CLASSES[cls];
      if (only && name !== only) continue;
      const [r, g, b] = COLORS[name];
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = name === 'faithful' ? 70 : name === 'enhanced' ? 95 : 150;
    }
  }
  return out;
}

/** Composition of an arbitrary box (frame pixels), for focus areas such as faces or text. */
export function boxShares(
  a: Analysis,
  box: { x: number; y: number; width: number; height: number },
): Record<Support, number> {
  const scale = TILE * a.factor;
  const counts: Record<Support, number> = { faithful: 0, enhanced: 0, invented: 0, contradicted: 0 };
  let n = 0;
  for (
    let ty = Math.floor(box.y / scale);
    ty <= Math.min(a.tiles.rows - 1, Math.floor((box.y + box.height) / scale));
    ty++
  )
    for (
      let tx = Math.floor(box.x / scale);
      tx <= Math.min(a.tiles.columns - 1, Math.floor((box.x + box.width) / scale));
      tx++
    ) {
      const cls = a.tiles.classes[ty * a.tiles.columns + tx];
      if (cls >= EDGE || cls === undefined) continue;
      counts[CLASSES[cls]]++;
      n++;
    }
  return Object.fromEntries(CLASSES.map((c) => [c, n ? counts[c] / n : 0])) as Record<Support, number>;
}
