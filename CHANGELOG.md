# Changelog

All notable changes to Invented Detail are documented here. The project follows [Semantic Versioning](https://semver.org/).

## 1.0.0 — 2026-11-14

First public release.

### Added

- Two-slot loader with drag and drop and EXIF orientation.
- Alignment of restorations of any size with pixel-centre-exact transforms.
- Comparison frame up to 1600 px with prefiltered resampling.
- Consistency check at the source's resolution with an optional global-grade compensation.
- Added-detail and source-detail measurement, and four classes: faithful, enhanced, invented, contradicted.
- Automatic monochrome detection for greyscale, sepia and other toned prints, with lightness-only comparison.
- Support score, class shares, resolution gain and synthesized-pixel share.
- Support map, swipe, source and restoration views with numbered regions.
- Focus areas with their own composition.
- Comparison sheet PNG, support map PNG and JSON report exports.
- Synthetic old-photo demo, 26 unit tests, 6 Playwright browser tests and CI.
- Strict Content-Security-Policy with `connect-src 'none'`.
