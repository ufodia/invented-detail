import { describe, expect, it } from 'vitest';
import { analysisHeadline, reportJson, samplingMetrics, type FocusArea } from '../src/core/report.ts';
import type { Analysis } from '../src/core/support.ts';

const shares = { faithful: 0.6, enhanced: 0.2, invented: 0.15, contradicted: 0.05 };
const analysis: Analysis = {
  options: { mode: 'colour', compensateTone: true },
  frame: { width: 640, height: 480 },
  source: { width: 160, height: 120 },
  outputSize: { width: 640, height: 480 },
  factor: 4,
  alignment: { scale: 4, tx: 1.5, ty: 1.5, error: 0.1, overlap: 1, doubtful: false },
  monochromeSource: false,
  tone: { significant: false, shift: 0 },
  shares,
  supportScore: 0.8,
  regions: [
    {
      id: 1,
      kind: 'invented',
      x: 100,
      y: 120,
      width: 80,
      height: 40,
      area: 0.15,
      consistency: 1,
      addedDetail: 7,
      sourceDetail: 2,
    },
  ],
  tiles: {
    columns: 40,
    rows: 30,
    classes: new Uint8Array(1200),
    consistency: new Float32Array(1200),
    added: new Float32Array(1200),
    detail: new Float32Array(1200),
  },
};
const file = (name: string, width: number, height: number) => ({ name, width, height });

it('prioritizes a detected contradiction over a high overall support score', () => {
  const high = { ...analysis, supportScore: 0.93 };
  expect(analysisHeadline(high)).toBe('Mostly consistent with the source');
  expect(analysisHeadline({ ...high, regions: [{ ...analysis.regions[0], kind: 'contradicted' }] })).toBe(
    'Contradictions found',
  );
});
const now = new Date('2026-11-14T12:00:00Z');

describe('original-file sampling metrics and report coordinates', () => {
  it('does not call source downsampling an increase in original resolution', () => {
    const metrics = samplingMetrics(analysis, {
      source: file('source.png', 640, 480),
      output: file('output.png', 640, 480),
    });
    expect(metrics.resolutionGain).toBe(1);
    expect(metrics.additionalPixelShare).toBe(0);
  });

  it('accounts for both analysis downsampling limits', () => {
    const metrics = samplingMetrics(analysis, {
      source: file('source.png', 640, 480),
      output: file('output.png', 1280, 960),
    });
    expect(metrics.resolutionGain).toBe(2);
    expect(metrics.additionalPixelShare).toBe(0.75);
  });

  it('never gives a negative additional-pixel share for a smaller restoration', () => {
    expect(
      samplingMetrics(analysis, {
        source: file('source.png', 1280, 960),
        output: file('output.png', 640, 480),
      }).additionalPixelShare,
    ).toBe(0);
  });

  it('maps frame boxes into original restoration pixels and records the analysis coordinate system', () => {
    const focus: FocusArea = { label: 'Review', x: 0, y: 0, width: 640, height: 480, shares };
    const report = JSON.parse(
      reportJson(
        analysis,
        {
          source: file('source.png', 640, 480),
          output: file('output.png', 1280, 960),
        },
        [focus],
        now,
      ),
    );
    expect(report.resolutionGain).toBe(2);
    expect(report.additionalPixelShare).toBe(0.75);
    expect(report.regions[0].boxInOutput).toEqual({ x: 200, y: 240, width: 160, height: 80 });
    expect(report.focusAreas[0].boxInOutput).toEqual({ x: 0, y: 0, width: 1280, height: 960 });
    expect(report.analysisSizes.source).toEqual(analysis.source);
    expect(report.alignment.coordinates).toContain('analysis pixels');
    expect(report.interpretation).toContain('not proof');
    expect(report.generatedAt).toBe(now.toISOString());
  });

  it('clips transformed boxes to the original output boundaries', () => {
    const report = JSON.parse(
      reportJson(
        { ...analysis, regions: [{ ...analysis.regions[0], x: -50, y: -20, width: 900, height: 700 }] },
        { source: file('source.png', 160, 120), output: file('output.png', 640, 480) },
        [],
        now,
      ),
    );
    expect(report.regions[0].boxInOutput).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });
});
