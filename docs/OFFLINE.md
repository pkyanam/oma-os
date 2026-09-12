# Offline access

Offline caching is optional in the production Cloudflare build. It is not enabled when you first open oma.os. Development builds do not offer the download.

1. While online, open **Settings → Desktop → Offline access**.
2. Select **Enable offline access** and wait for the file download to finish.
3. Confirm **Offline files ready** before disconnecting.

The download includes the desktop, Applications, Notes and Settings. Other application assets can be cached after use, subject to cache limits. Their presence is not guaranteed: an app you have not opened, a runtime loaded from another location, AI connections and websites may still require a network connection. If a download fails, Settings displays the error and offers a retry.

The progress indicator reports completed files against the actual download count. It does not estimate transferred bytes or promise a completion time. Closing Settings does not automatically cancel a browser-managed service-worker installation; reopen Settings to inspect its state.

## Updates and removal

A downloaded update can wait while an older version is open. Close all oma.os tabs and reopen the app to apply it. Settings never forces a reload or activates an update over a running session.

**Disable offline access** unregisters oma.os's offline worker and removes its application caches. A small control marker prevents a worker still controlling an open page from recreating the disabled cache. Your OPFS documents and provider preferences are not deleted. Offline installation is separate from installing an app shortcut through the browser's Install/Add to Dock action.

## Files and privacy

Offline caches contain approved build assets and the desktop entry page. API responses, authentication traffic, browsed web pages, query-string URLs and cross-origin responses are not included by the offline worker. The generated asset allowlist is build-specific; the service worker does not act as a general web cache.

Documents continue to use the browser's existing Origin Private File System. The offline cache is not a backup and is not included in file backup ZIPs. Clearing site data can remove both documents and cached application files. Browser storage can also be evicted; export important documents through Files or Settings → Storage & backup.

## Implementation and checks

- `scripts/offline-build.mjs` generates the production asset manifest and worker.
- `scripts/offline-worker.js` handles the bounded cache and download progress.
- `lib/offline/client.ts` exposes explicit enable/disable/status operations.
- `components/apps/OfflineSettings.tsx` presents those operations in Settings.
- `e2e/settings.spec.ts` checks that opening Settings and changing tabs never registers a service worker automatically.

The production service-worker lifecycle is tested separately from the development UI; a development page is intentionally not evidence of offline support.
