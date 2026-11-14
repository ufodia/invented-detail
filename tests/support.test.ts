import { describe, expect, it } from 'vitest';
import { analyze, boxShares, isMonochrome, prepare, supportMap, type Options } from '../src/core/support.ts';
import { fromRgba } from '../src/core/image.ts';

type Fn = (x: number, y: number) => [number, number, number];

/** Render a scene defined on a 0..1 square at any size, with 2×2 supersampling. */
function render(f: Fn, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < 2; sy++)
        for (let sx = 0; sx < 2; sx++) {
          const c = f((x + 0.25 + sx * 0.5) / w, (y + 0.25 + sy * 0.5) / h);
          for (let k = 0; k < 3; k++) acc[k] += c[k] / 4;
        }
      const o = (y * w + x) * 4;
      out[o] = acc[0] * 255;
      out[o + 1] = acc[1] * 255;
      out[o + 2] = acc[2] * 255;
      out[o + 3] = 255;
    }
  return out;
}

/** A soft scene: sky gradient, a house block, a door, a round tree. Coarse shapes only. */
const scene: Fn = (x, y) => {
  if (y < 0.45) return [0.55 + y * 0.6, 0.65 + y * 0.5, 0.85];
  if (x > 0.2 && x < 0.6 && y > 0.45 && y < 0.9) {
    if (x > 0.35 && x < 0.45 && y > 0.65) return [0.3, 0.2, 0.15];
    return [0.75, 0.6, 0.5];
  }
  if ((x - 0.78) ** 2 + (y - 0.6) ** 2 < 0.012) return [0.25, 0.5, 0.3];
  return [0.45, 0.55, 0.35];
};

const grey: Fn = (x, y) => {
  const [r, g, b] = scene(x, y);
  const v = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [v, v, v];
};

const SW = 160;
const SH = 120;
const OW = 640;
const OH = 480;
const source = render(scene, SW, SH);
const defaults: Options = { mode: 'colour', compensateTone: true };
const run = (output: Uint8ClampedArray, options = defaults, src = source) =>
  analyze(prepare(src, SW, SH, output, OW, OH), options);

/** Fine texture inside the house wall: stripes finer than one source pixel that average to the wall colour. */
const bricks: Fn = (x, y) => {
  const base = scene(x, y);
  const inWall = x > 0.2 && x < 0.6 && y > 0.45 && y < 0.9 && !(x > 0.35 && x < 0.45 && y > 0.65);
  if (!inWall) return base;
  const d = Math.floor(x * 320) % 2 === 0 ? 0.12 : -0.12;
  return [base[0] + d, base[1] + d, base[2] + d];
};

describe('support classification', () => {
  it('a plain upscale of the source is faithful', () => {
    const a = run(render(scene, OW, OH));
    expect(a.factor).toBeCloseTo(4, 1);
    expect(a.shares.faithful + a.shares.enhanced).toBeGreaterThan(0.95);
    expect(a.shares.invented).toBeLessThan(0.03);
    expect(a.shares.contradicted).toBeLessThan(0.02);
  });

  it('fine texture where the source is flat is invented, and found as a region', () => {
    const a = run(render(bricks, OW, OH));
    expect(a.shares.invented).toBeGreaterThan(0.12);
    const wall = a.regions.find((r) => r.kind === 'invented')!;
    expect(wall).toBeDefined();
    expect(wall.x).toBeGreaterThan(OW * 0.15);
    expect(wall.x + wall.width).toBeLessThan(OW * 0.65);
  });

  it('a change visible at the source resolution is contradicted', () => {
    const changed: Fn = (x, y) => ((x - 0.78) ** 2 + (y - 0.6) ** 2 < 0.012 ? [0.85, 0.3, 0.6] : scene(x, y));
    const a = run(render(changed, OW, OH));
    const tree = a.regions.find((r) => r.kind === 'contradicted')!;
    expect(tree).toBeDefined();
    expect(tree.x).toBeGreaterThan(OW * 0.6);
    expect(a.regions[0].kind).toBe('contradicted');
  });

  it('ignores a global grade when compensation is on', () => {
    const graded: Fn = (x, y) => {
      const [r, g, b] = scene(x, y);
      return [Math.min(1, r * 1.1), g * 0.95, b * 0.85];
    };
    expect(run(render(graded, OW, OH)).shares.contradicted).toBeLessThan(0.03);
    expect(
      run(render(graded, OW, OH), { ...defaults, compensateTone: false }).shares.contradicted,
    ).toBeGreaterThan(0.3);
  });

  it('compares lightness only for colourized black-and-white photos', () => {
    const greySource = render(grey, SW, SH);
    const colour = render(scene, OW, OH);
    const prepared = prepare(greySource, SW, SH, colour, OW, OH);
    expect(prepared.monochromeSource).toBe(true);
    expect(analyze(prepared, { mode: 'lightness', compensateTone: true }).shares.contradicted).toBeLessThan(
      0.03,
    );
  });
});

describe('monochrome detection', () => {
  it('treats greyscale and sepia-toned photos as monochrome, colour photos as colour', () => {
    const sepia: Fn = (x, y) => {
      const [v] = grey(x, y);
      return [Math.min(1, v * 1.07 + 0.02), v * 0.96 + 0.015, v * 0.8];
    };
    expect(isMonochrome(fromRgba(render(grey, 80, 60), 80, 60))).toBe(true);
    expect(isMonochrome(fromRgba(render(sepia, 80, 60), 80, 60))).toBe(true);
    expect(isMonochrome(fromRgba(render(scene, 80, 60), 80, 60))).toBe(false);
  });
});

describe('maps and focus areas', () => {
  it('summarizes an arbitrary box and draws a frame-sized overlay', () => {
    const a = run(render(bricks, OW, OH));
    const wall = boxShares(a, { x: OW * 0.25, y: OH * 0.5, width: OW * 0.08, height: OH * 0.3 });
    expect(wall.invented).toBeGreaterThan(0.5);
    const sky = boxShares(a, { x: 0, y: 0, width: OW, height: OH * 0.3 });
    expect(sky.faithful).toBeGreaterThan(0.9);
    expect(supportMap(a).length).toBe(a.frame.width * a.frame.height * 4);
    const onlyInvented = supportMap(a, 'invented');
    expect(onlyInvented[3]).toBe(0);
  });

  it('caps the frame size for very large outputs', () => {
    const a = analyze(prepare(source, SW, SH, render(scene, 2400, 1800), 2400, 1800), defaults);
    expect(Math.max(a.frame.width, a.frame.height)).toBeLessThanOrEqual(1600);
    expect(a.alignment.scale).toBeCloseTo(15, 0);
  });
});
