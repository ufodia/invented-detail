# Deployment

Invented Detail is a static site: `npm run build` writes everything to `dist/`.

Production: **[invented-detail.vercel.app](https://invented-detail.vercel.app/)**. The production origin is `https://invented-detail.vercel.app/`.

## Build

```bash
npm ci
npm run check   # strict typecheck, unit tests and production build into dist/
```

`postbuild` runs `scripts/prepare-hosting.mjs`, which only touches `dist/`. On a Vercel production build (`VERCEL_ENV=production` with `VERCEL_PROJECT_PRODUCTION_URL`) it adds a canonical URL, makes the social image absolute and writes `robots.txt` and `sitemap.xml`. Other builds are marked `noindex`.

## Security headers

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

## Vercel

[`vercel.json`](../vercel.json) sets the framework, `npm ci`, `npm run build`, the `dist` output directory and the headers above. Node.js 24 comes from `engines`.

To recover hosting, reconnect the authorized Vercel account to `ufodia/invented-detail`, select `main` as the production branch and retain these repository settings. Reassign `invented-detail.vercel.app` to the restored project and verify that `VERCEL_PROJECT_PRODUCTION_URL` resolves to that production hostname. Deploy the checked `main` commit, then confirm the deployment's source SHA, canonical URL, security headers and synthetic demo at the public address. Keep account tokens and `.vercel/` metadata outside Git.

## Other hosts

Publish `dist/` and add the headers. For hosts that read `_headers`, create `public/_headers` before building:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
```

## Verify a deployment

1. Check the response headers of the page and the worker script.
2. Run the demo; the Network panel should show only same-origin files.
3. `PLAYWRIGHT_BASE_URL=https://your-deployment.example npx playwright test`

## Restore on a replacement computer

Use the repository's verified `main` branch as the source of first-party code, pinned dependencies and artwork:

```bash
git clone https://github.com/ufodia/invented-detail.git
cd invented-detail
git switch main
git pull --ff-only
node --version             # Node.js 24.x
npm ci
npx playwright install chromium
npm run check
npm run test:browser
npm run format:check
```

No runtime API keys, model downloads or databases are required. The build output and browser-test artifacts are reproducible and ignored by Git. Hosting credentials and the local `.vercel/` account link are intentionally excluded; reconnect the authorized Vercel account rather than committing tokens. `vercel.json` preserves the install, build, output and security-header configuration.

For a local smoke test, use `npm run preview` after the build and open the printed loopback URL. Verify the synthetic demo, view switching and all three downloads. A local preview does not prove production headers, property verification or search indexing.
