import type { Analysis, Options } from './core/support.ts';

export interface RawImage {
  rgba: ArrayBuffer;
  width: number;
  height: number;
}

/** Page → worker. */
export type WorkerRequest =
  | { type: 'load'; job: number; source: RawImage; output: RawImage; options: Options | null }
  | { type: 'analyze'; job: number; options: Options };

/** Worker → page. */
export type WorkerResponse =
  | { type: 'progress'; job: number; message: string }
  | {
      type: 'prepared';
      job: number;
      /** The AI output aligned into the comparison frame. */
      output: ArrayBuffer;
      /** The source at its analysis size. */
      source: ArrayBuffer;
      sourceSize: { width: number; height: number };
      frame: { width: number; height: number };
      recommended: Options;
    }
  | { type: 'result'; job: number; analysis: Analysis; map: ArrayBuffer }
  | { type: 'error'; job: number; message: string };
