# Method

Invented Detail uses classic signal processing to highlight differences between an original photo and its restoration. Fixed thresholds make its measurements inspectable and reproducible. They are heuristics for review, not a validation of truth or AI provenance.

## The principle

An enlargement by a factor `s` has `s²` times as many pixel positions. That arithmetic says nothing about new information: ordinary interpolation also adds positions. This tool instead measures two properties on bounded analysis images:

1. **Consistency.** Compare the restoration averaged back to the source's analysis grid. A large difference is labelled *contradicted*; it can also reflect alignment error, damage removal or compression.
2. **Added detail.** Compare finer texture against the source's local structure. On structured areas it is labelled *enhanced*, and on flat or blurred areas *invented*. Neither label establishes which pixels came from a model or whether their content is correct.

## 1. Decoding and limits

The source is analysed at up to 1024 px on its longer side; the restoration is downsampled to at most 4096 px. Files are limited to 80 MiB, and each resulting canvas must remain at least 32 px on both sides. EXIF orientation is applied. Transparent pixels are composited on white for analysis. Decoding a very large original can still exceed browser memory; the byte-size limit is not a memory guarantee.

Fine structure removed by downsampling is outside the analysis. The report records both original and analysis dimensions. Its `resolutionGain` corrects the alignment scale for both size reductions; `additionalPixelShare` describes the increase in pixel positions, never the amount of invented content.

## 2. Alignment

The restoration is area-averaged down to the source's size, and the two are aligned with the coarse-to-fine scale and offset search shared with Edit Creep: gradient-magnitude pyramids (insensitive to colourization and grading), scale searched within ±10 % of the size ratio, translation within ±12 %, sub-pixel polishing, and a preference for the exact plain resize when it is as good. Transforms use pixel-centre conventions: an index `v` in the shrunk copy is `u = f·v + (f − 1)/2` in the full restoration.

An alignment error above 0.9 or an overlap below 75 % is reported as doubtful.

## 3. Comparison frame

The frame is the source grid enlarged by `factor = min(scale, 1600 / longer side)`. The restoration is resampled into it bilinearly (and area-prefiltered first when it is more than 1.5 × larger than the frame). Frame pixels the restoration does not cover are excluded.

## 4. Consistency (question 1)

- The frame is area-averaged back to the source grid.
- In **lightness** mode both images are converted to grey first.
- A per-channel linear grade (gain and offset, robust to the 20 % worst residuals) is fitted between the source and the averaged restoration. With **Ignore an overall brightness or colour grade** on, it is removed.
- Both are lightly blurred (3 × 3) to absorb grain, converted to CIELAB, and compared: ΔE76 in colour mode, |ΔL\*| in lightness mode.

## 5. Added and source detail (question 2)

- **Added detail:** the lightness of the frame minus the lightness of the averaged restoration enlarged back with bilinear interpolation — the restoration's content above the source's resolution. Per tile, the root mean square.
- **Source detail:** the mean Sobel gradient of the source's lightness (divided by four, i.e. per-pixel differences).

## 6. Tiles and classes

The source is divided into 4 × 4-pixel tiles.

| Class | Rule |
| --- | --- |
| Contradicted | mean consistency > 10 |
| Invented | not contradicted, added detail > 5 and source detail < 6 |
| Enhanced | not contradicted, added detail > 5 and source detail ≥ 6 |
| Faithful | otherwise |

Tiles less than half covered by the restoration are *uncovered*. The outermost ring of tiles is excluded, because blur, scanning and resampling are unreliable at the border.

The **support score** is the share of faithful and enhanced tiles among classified tiles. Regions are 8-connected groups of at least three invented or contradicted tiles; contradicted regions are listed first, then invented regions by size.

## 7. Monochrome detection

A source is monochrome when its colour is a function of lightness: a\* and b\* are fitted as straight lines of L\*, and the residual RMS of both is below 3. This recognizes greyscale, sepia, cyanotype and other toned prints. Monochrome sources default to lightness comparison.

## Limitations

- **No truth or provenance guarantee.** The method cannot distinguish a correct guess from a wrong one or establish what an AI generated. It flags image properties for review.
- **Partially resolved detail.** Lettering, faces and textures that the source shows as a recognizable but blurred shape usually land in *enhanced*: the source confirms that structure exists, not its exact form.
- **Thresholds are fixed.** They suit typical 2–8× restorations of photographs. Extremely noisy scans can raise consistency differences; very soft restorations add little detail and look faithful.
- **Geometry.** Rotation, perspective changes, cropping beyond the search range and content-aware recomposition break the alignment.
- **Damage removal.** Scratches, dust and heavy JPEG artefacts are part of the evidence; removing them shows as contradiction where they were strong.
