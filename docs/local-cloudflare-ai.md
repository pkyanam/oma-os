# Local Cloudflare AI bindings

Default `npm run dev:cloudflare` does not bind Workers AI and disables remote
binding connections. `/api/agent-config` consequently reports
`workersAI.enabled: false`; local apps, device auth and direct-provider mode remain
available. The local AI quota Durable Object can remain bound without making any
network requests. Its production migration and export stay intact.

Cloudflare documents that [AI has no local simulation](https://developers.cloudflare.com/workers/local-development/bindings-per-env/).
Setting `remote: false` on the AI binding itself is unsupported. We instead use the
[Vite plugin's config customization API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)
to remove that binding during `serve`. The installed plugin merges returned config
objects with `defu`, so returning `ai: undefined` would retain the original binding;
the customization callback deletes the property in place.

For deliberate remote development with a configured Cloudflare account:

```sh
OMA_REMOTE_AI=1 npm run dev:cloudflare
```

This connects to hosted AI and can consume account usage. It is never enabled by
the installer or CI. `vite build` uses the unchanged production Wrangler bindings,
so deployments retain Workers AI. The configuration does not read, print, or copy
Cloudflare credentials.

Managed Browser Run is also unbound by default in local Vite. Its placeholder
binding cannot provide a live browser. Enable it separately with a configured
Cloudflare account:

```sh
OMA_REMOTE_BROWSER=1 npm run dev:cloudflare
```

This sets `browser.remote: true` and permits remote binding connections. Combine
both opt-ins only when you intend to use both managed services. Without opt-ins,
the Cloudflare local profile uses document browsing; the alternative Node profile
can use locally installed Chromium. Production Browser Run bindings are unchanged.
