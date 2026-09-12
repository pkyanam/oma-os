import { DurableObject } from "cloudflare:workers";
import {
  createAuthController,
  verifiedSession,
  routeAuth,
  authenticatedIdentity,
  type AuthEnv,
} from "./auth-core";
export { routeAuth, authenticatedIdentity };
export class AuthSession extends DurableObject<AuthEnv> {
  private controller: ReturnType<typeof createAuthController>;
  constructor(ctx: DurableObjectState, env: AuthEnv) {
    super(ctx, env);
    this.controller = createAuthController(ctx.storage, env.LWC_SECRET);
  }
  async fetch(request: Request) {
    const id = await verifiedSession(request, this.env.LWC_SECRET);
    if (
      !id ||
      this.env.AUTH_SESSIONS.idFromName(id).toString() !==
        this.ctx.id.toString()
    )
      return Response.json(
        { error: "not_authenticated" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    return this.controller.fetch(request);
  }
  alarm() {
    return this.controller.alarm();
  }
}
