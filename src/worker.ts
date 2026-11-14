import { toRgba } from './core/image.ts';
import { analyze, prepare, supportMap, type Options, type Prepared } from './core/support.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

let prepared: Prepared | null = null;

const scope = self as unknown as { postMessage(message: WorkerResponse, transfer?: Transferable[]): void };
const post = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

function run(job: number, options: Options) {
  if (!prepared) throw new Error('Open two images first.');
  post({ type: 'progress', job, message: 'Checking every tile against the source…' });
  const analysis = analyze(prepared, options);
  const map = supportMap(analysis);
  post({ type: 'result', job, analysis, map: map.buffer as ArrayBuffer }, [map.buffer as ArrayBuffer]);
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      post({ type: 'progress', job: request.job, message: 'Aligning the restoration with the source…' });
      prepared = prepare(
        new Uint8ClampedArray(request.source.rgba),
        request.source.width,
        request.source.height,
        new Uint8ClampedArray(request.output.rgba),
        request.output.width,
        request.output.height,
      );
      const recommended: Options = request.options ?? {
        mode: prepared.monochromeSource ? 'lightness' : 'colour',
        compensateTone: true,
      };
      const output = toRgba(prepared.output);
      const source = toRgba(prepared.source);
      post(
        {
          type: 'prepared',
          job: request.job,
          output: output.buffer as ArrayBuffer,
          source: source.buffer as ArrayBuffer,
          sourceSize: { width: prepared.source.width, height: prepared.source.height },
          frame: { width: prepared.output.width, height: prepared.output.height },
          recommended,
        },
        [output.buffer as ArrayBuffer, source.buffer as ArrayBuffer],
      );
      run(request.job, recommended);
    } else {
      run(request.job, request.options);
    }
  } catch (error) {
    post({
      type: 'error',
      job: request.job,
      message:
        error instanceof RangeError
          ? 'These images are too large for this browser tab.'
          : String((error as Error).message || error),
    });
  }
});
