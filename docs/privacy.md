# Privacy

Family photos, archive material and evidence images are personal. Invented Detail processes them entirely in your browser.

| Behaviour | How it is implemented |
| --- | --- |
| No upload | Images are decoded by the browser and analysed in a Web Worker. There is no server endpoint. The production configuration sends `Content-Security-Policy: connect-src 'none'`, which blocks `fetch`, XHR, WebSocket, EventSource and beacons. |
| No third-party code | `default-src 'self'` and zero runtime dependencies. |
| No storage | Nothing is written to cookies, `localStorage`, `sessionStorage` or IndexedDB. Reloading the tab discards everything. |
| Local exports | PNG and JSON files are created in the tab and saved through the browser's downloads. |

## What remains your responsibility

- **Exports** contain your images (PNG) or file names and measurements (JSON).
- **Your device** — browser extensions with page access or screen recording are outside the app's control.
- **Hosting** — keep the headers from [`vercel.json`](../vercel.json) when self-hosting (see [deployment](deployment.md)). The Vite development server does not send them; the app still never sends images anywhere.

Report a way to make the page send data, or to execute content from an image file, privately as described in [SECURITY.md](../SECURITY.md).
