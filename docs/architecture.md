# Architecture

Invented Detail is a static Vite application in strict TypeScript with **no runtime dependencies**.

```
index.html          intro, slots, the four answers
src/main.ts         loading, worker messages, viewer, focus areas, results panel, exports
src/worker.ts       holds the prepared images; runs alignment and analysis off the main thread
src/protocol.ts     typed page ↔ worker messages
src/demo.ts         procedurally drawn old photo and restoration
src/dom.ts          text-only element factory, SVG helper, downloads
src/core/
  image.ts          RGB planes, bilinear sampling, area resize, Sobel, box blur, sRGB → CIELAB
  align.ts          coarse-to-fine scale/offset alignment (shared design with Edit Creep)
  tone.ts           robust per-channel grade fit and compensation
  regions.ts        connected components
  support.ts        prepare (alignment, frame), monochrome detection, analyze (consistency,
                    added detail, tiles, regions), support map, focus-area shares
  report.ts         JSON report
```

## Data flow

1. The page decodes both files with `createImageBitmap`, limits the source to 1024 px and the restoration to 4096 px, and **transfers** the pixels to the worker.
2. `prepare` aligns the images and builds the comparison frame; the worker posts the aligned restoration and the source for display, plus recommended options (lightness for monochrome sources).
3. `analyze` classifies tiles and finds regions; the worker posts the analysis and an RGBA support map.
4. Changing a setting sends `analyze` again. Focus areas are computed on the page from the tile grid, without a worker round-trip.

Every request carries a `job` number so stale answers are ignored.

## Worker protocol

| Page → worker | Purpose |
| --- | --- |
| `{ type: 'load', job, source, output, options }` | prepare and analyse (`options: null` uses the recommendation) |
| `{ type: 'analyze', job, options }` | re-analyse with new settings |

| Worker → page | Purpose |
| --- | --- |
| `{ type: 'progress', job, message }` | status text |
| `{ type: 'prepared', job, output, source, sourceSize, frame, recommended }` | display images and the recommended options |
| `{ type: 'result', job, analysis, map }` | the analysis and the support map |
| `{ type: 'error', job, message }` | a readable error |

## Report format

```jsonc
{
  "tool": { "name": "Invented Detail", "version": "1.0.0", "url": "…" },
  "generatedAt": "ISO-8601",
  "files": { "source": { "name", "width", "height" }, "output": { … } },
  "settings": { "mode": "colour | lightness", "compensateTone": true },
  "frame": { "width", "height" },
  "resolutionGain": 4.003,
  "synthesizedShare": 0.9376,
  "supportScore": 0.763,
  "shares": { "faithful", "enhanced", "invented", "contradicted" },
  "alignment": { "scale", "offsetX", "offsetY", "doubtful" },
  "grade": { "significant", "shift" },
  "regions": [{ "id", "kind", "shareOfImage", "consistency", "addedDetail", "sourceDetail",
                "box": { … },          // frame pixels
                "boxInOutput": { … } }], // restoration pixels
  "focusAreas": [{ "label", "box", "shares" }]
}
```

## Testing

- **Unit tests** (26, Vitest): plain enlargements stay faithful, mean-preserving fine texture on a flat source is invented and located, a visible colour change is contradicted, global grades are compensated (and counted when compensation is off), colourized greyscale is faithful in lightness mode, greyscale and sepia are detected as monochrome and colour photos are not, focus-area shares, support-map size, frame capping for large outputs, and hosting metadata.
- **Browser tests** (6, Playwright): the demo verdict and classes, all views, highlighting and the colour/lightness switch, focus areas on the face, JSON and PNG exports, a plain enlargement being mostly supported, an undecodable file and the phone layout.
