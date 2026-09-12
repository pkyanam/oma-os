/**
 * Vite's config customizer accepts in-place mutation. Returning an override with
 * ai: undefined would not remove the binding: the plugin merges via defu.
 * Production config is never passed here by our Vite configuration.
 * @param {{ai?: unknown, browser?: {remote?: boolean}}} config
 * @param {string | undefined} optIn
 * @param {string | undefined} browserOptIn
 */
export function disableUnrequestedRemoteAI(config, optIn, browserOptIn) {
  if (optIn !== "1") delete config.ai;
  if (browserOptIn !== "1") delete config.browser;
  else if (config.browser) config.browser.remote = true;
}
