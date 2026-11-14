# User guide

## 1. Load the two images

| Slot | What to use |
| --- | --- |
| **1 · Original photo** | the scan or file *before* any AI processing — the evidence |
| **2 · AI restoration or upscale** | the result, at its full size |

Click a slot, drop a file on it, or drop both files on the page (the smaller file by byte size becomes the original). Compression can make this guess wrong; use the labelled slots when the order matters. PNG, JPEG, WebP and AVIF are supported when the browser can decode them, up to 80 MiB each. Each image must remain at least 32 px on both sides after its analysis-size limit. **Try the old-photo demo** loads a synthetic sepia photo and a colourized restoration.

Use the original at its native size. Measurements use a source reduced to at most 1024 px on the longer side and a restoration reduced to at most 4096 px. Fine detail removed during this step is outside the analysis. You can replace files or start the demo while decoding; outdated files and worker results are discarded.

## 2. Read the summary

- **Support score** — faithful plus enhanced among classified tiles; a descriptive heuristic, not confidence in historical truth.
- **Class bars** — faithful, enhanced, invented, contradicted.
- **Sampling scale** — alignment-adjusted pixel density in the original files, corrected for internal downsampling. Additional pixel positions can come from ordinary resizing; this does not measure AI invention.
- **Alignment** — the sizes matched. A warning means the images may not show the same framing.
- **Comparison** — colour, or lightness only (chosen automatically for black-and-white and toned photos).
- **Global grade** — whether the restoration changed overall brightness or colour, and whether that was set aside.

## 3. Look at the image

| View | Shows |
| --- | --- |
| **Swipe** | the source (smoothly enlarged) on the left and the restoration on the right; drag the slider |
| **Support map** | the restoration in grey with every tile coloured by its class |
| **Source** | the source, enlarged smoothly — what the evidence can show at this size |
| **Restoration** | the restoration, aligned to the source |

Numbered boxes mark contradicted (red) and invented (amber) regions in every view.

## 4. Mark focus areas

Drag a box on the image around a face, a sign, a number plate or any detail you care about. The panel lists each focus area with its own class bars. **Remove** deletes one. Focus areas are included in the JSON report.

## 5. Review regions

Each region card explains the finding in plain words and shows the source and the restoration crops side by side. **Highlight** outlines it on the image.

## 6. Settings

- **Colour / Lightness only** — use lightness for colourized photos; use colour when both images are in colour and colour fidelity matters.
- **Ignore an overall brightness or colour grade** — on by default. Turn it off when the restoration's overall tone should be judged too.

## 7. Export

| Button | File |
| --- | --- |
| **Comparison sheet (PNG)** | source and restoration side by side with regions and a summary |
| **Support map (PNG)** | the map with regions and a legend |
| **Report (JSON)** | all numbers, regions and focus areas |

## Troubleshooting

| Symptom | Try |
| --- | --- |
| Almost everything is contradicted | check the comparison mode (lightness for colourized photos) and that the grade is ignored; check the alignment warning |
| Alignment warning | the restoration may be cropped, rotated or re-framed; crop the original to match |
| Nothing is invented on an obviously AI-sharpened face | the source probably shows the face clearly enough; look at the enhanced share |
| *could not be decoded* | convert to PNG or JPEG |
| *too small or narrow* | use an image that remains at least 32 px on both sides after resizing; extreme panoramas may need a matching crop |
| Memory or browser failure on a very large original | use smaller copies of both images; the 80 MiB limit does not guarantee that decompression fits your device |

The four labels use fixed thresholds. A faithful or enhanced tile can still contain incorrect facial features, letters or numbers. Use the original and independent evidence before drawing conclusions.
