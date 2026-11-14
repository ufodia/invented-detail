# User guide

## 1. Load the two images

| Slot | What to use |
| --- | --- |
| **1 · Original photo** | the scan or file *before* any AI processing — the evidence |
| **2 · AI restoration or upscale** | the result, at its full size |

Click a slot, drop a file on it, or drop both files on the page (the smaller file becomes the original). PNG, JPEG, WebP and AVIF are supported, up to 80 MB each. **Try the old-photo demo** loads a synthetic sepia photo and a colourized restoration.

Use the original at its native size. If you only have a downscaled copy of the original, the method still works but the support score describes that copy.

## 2. Read the summary

- **Support score** — the share of the picture that is faithful or enhanced.
- **Class bars** — faithful, enhanced, invented, contradicted.
- **Resolution gain** — how many times larger the restoration is, and how many of its pixels cannot exist in the source.
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
