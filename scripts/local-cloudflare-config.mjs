/**
 * Vite's config customizer accepts in-place mutation. Returning an override with
 * ai: undefined would not remove the binding: the plugin merges via defu.
 * Production config is never passed here by our Vite configuration.
 * @param {{ai?: unknown}} config
 * @param {string | undefined} optIn
 */
export function disableUnrequestedRemoteAI(config, optIn) {
  if (optIn !== "1") delete config.ai;
}
