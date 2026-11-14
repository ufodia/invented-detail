# Third-party notices

Invented Detail's source code, documentation and artwork are MIT-licensed © 2026 ufodia.

## Runtime dependencies

None. Image decoding uses the browser's built-in `createImageBitmap`; every analysis step is implemented in this repository. The alignment, resampling, tone-fitting and component modules share their design with Edit Creep by the same author.

## Development tools

Vite, TypeScript, Vitest, Playwright and Prettier build and test the project and are not shipped to users. Exact versions are pinned in `package-lock.json`.

## Demo images

The demo photo and restoration are drawn procedurally in `src/demo.ts`. The bakery and the person are invented.
