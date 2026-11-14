import { CLASSES, type Analysis, type Support } from './support.ts';

export const TOOL = {
  name: 'Invented Detail',
  version: '1.0.0',
  url: 'https://github.com/ufodia/invented-detail',
};

export interface FileInfo {
  name: string;
  width: number;
  height: number;
}

export interface FocusArea {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shares: Record<Support, number>;
}

const round = (v: number, d = 4) => Number(v.toFixed(d));

/** A portable JSON report with region boxes in frame pixels and in the restoration's own pixels. */
export function reportJson(
  a: Analysis,
  files: { source: FileInfo; output: FileInfo },
  focus: FocusArea[],
  now = new Date(),
): string {
  const toOutput = (b: { x: number; y: number; width: number; height: number }) => {
    // Frame pixel → source index → output pixel.
    const map = (v: number, t: number) => Math.round(((v + 0.5) / a.factor - 0.5) * a.alignment.scale + t);
    const x0 = map(b.x, a.alignment.tx);
    const y0 = map(b.y, a.alignment.ty);
    return {
      x: x0,
      y: y0,
      width: map(b.x + b.width, a.alignment.tx) - x0,
      height: map(b.y + b.height, a.alignment.ty) - y0,
    };
  };
  return (
    JSON.stringify(
      {
        tool: TOOL,
        generatedAt: now.toISOString(),
        files,
        settings: a.options,
        frame: a.frame,
        resolutionGain: round(a.alignment.scale, 3),
        synthesizedShare: round(a.synthesizedShare),
        supportScore: round(a.supportScore),
        shares: Object.fromEntries(CLASSES.map((c) => [c, round(a.shares[c])])),
        alignment: {
          scale: round(a.alignment.scale, 4),
          offsetX: round(a.alignment.tx, 2),
          offsetY: round(a.alignment.ty, 2),
          doubtful: a.alignment.doubtful,
        },
        grade: { significant: a.tone.significant, shift: round(a.tone.shift, 2) },
        regions: a.regions.map((r) => ({
          id: r.id,
          kind: r.kind,
          shareOfImage: round(r.area),
          consistency: round(r.consistency, 2),
          addedDetail: round(r.addedDetail, 2),
          sourceDetail: round(r.sourceDetail, 2),
          box: { x: r.x, y: r.y, width: r.width, height: r.height },
          boxInOutput: toOutput(r),
        })),
        focusAreas: focus.map((f) => ({
          label: f.label,
          box: {
            x: Math.round(f.x),
            y: Math.round(f.y),
            width: Math.round(f.width),
            height: Math.round(f.height),
          },
          shares: Object.fromEntries(CLASSES.map((c) => [c, round(f.shares[c])])),
        })),
      },
      null,
      2,
    ) + '\n'
  );
}
