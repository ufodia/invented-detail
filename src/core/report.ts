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

export function analysisHeadline(a: Analysis): string {
  if (a.regions.some((region) => region.kind === 'contradicted')) return 'Contradictions found';
  return a.supportScore >= 0.85
    ? 'Mostly consistent with the source'
    : a.supportScore >= 0.6
      ? 'Some details need review'
      : 'Many details need review';
}

/** Sampling density in the original files, independent of the bounded analysis canvases. */
export function samplingMetrics(a: Analysis, files: { source: FileInfo; output: FileInfo }) {
  const resolutionGain =
    a.alignment.scale * (a.source.width / files.source.width) * (files.output.width / a.outputSize.width);
  return {
    resolutionGain,
    additionalPixelShare: resolutionGain > 1 ? 1 - 1 / resolutionGain ** 2 : 0,
  };
}

/** A portable JSON report with region boxes in frame pixels and in the restoration's own pixels. */
export function reportJson(
  a: Analysis,
  files: { source: FileInfo; output: FileInfo },
  focus: FocusArea[],
  now = new Date(),
): string {
  const sampling = samplingMetrics(a, files);
  const toOutput = (b: { x: number; y: number; width: number; height: number }) => {
    // Frame boundary → source index → decoded output boundary → original file boundary.
    const map = (v: number, t: number, native: number, decoded: number) =>
      Math.max(
        0,
        Math.min(
          native,
          Math.round((((v / a.factor - 0.5) * a.alignment.scale + t + 0.5) * native) / decoded),
        ),
      );
    const mapX = (x: number) => map(x, a.alignment.tx, files.output.width, a.outputSize.width);
    const mapY = (y: number) => map(y, a.alignment.ty, files.output.height, a.outputSize.height);
    const x0 = mapX(b.x);
    const y0 = mapY(b.y);
    return {
      x: x0,
      y: y0,
      width: mapX(b.x + b.width) - x0,
      height: mapY(b.y + b.height) - y0,
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
        analysisSizes: { source: a.source, output: a.outputSize },
        resolutionGain: round(sampling.resolutionGain, 3),
        additionalPixelShare: round(sampling.additionalPixelShare),
        interpretation:
          'Fixed-threshold tile heuristics, not proof of truth or AI provenance. Sampling density does not measure invented content.',
        supportScore: round(a.supportScore),
        shares: Object.fromEntries(CLASSES.map((c) => [c, round(a.shares[c])])),
        alignment: {
          coordinates: 'analysis pixels (analysisSizes)',
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
          boxInOutput: toOutput(f),
        })),
      },
      null,
      2,
    ) + '\n'
  );
}
