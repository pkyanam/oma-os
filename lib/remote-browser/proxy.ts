import { createServer, request, type IncomingHttpHeaders } from "node:http";
import { connect } from "node:net";
import type { Socket } from "node:net";
import { publicDestination } from "./network";
/** A fail-closed egress proxy. DNS answers are validated and pinned before any socket opens. */
export async function startPublicProxy() {
  const sockets = new Set<Socket>();
  const server = createServer(async (incoming, response) => {
    try {
      const { url, address, family } = await publicDestination(
        incoming.url || "",
      );
      if (url.protocol !== "http:") throw new Error("HTTPS requires CONNECT.");
      const headers: IncomingHttpHeaders = {
        ...incoming.headers,
        host: url.host,
      };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      const upstream = request(
        url,
        {
          method: incoming.method,
          headers,
          family,
          lookup: (_host, _options, callback) =>
            callback(null, address, family),
        },
        (result) => {
          response.writeHead(result.statusCode || 502, result.headers);
          result.pipe(response);
        },
      );
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      incoming.on("aborted", () => upstream.destroy());
      incoming.pipe(upstream);
    } catch {
      response.writeHead(403);
      response.end("Public websites only.");
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", async (incoming, client, head) => {
    try {
      const target = incoming.url || "";
      if (!target || target.includes("/") || target.includes("@"))
        throw new Error("Invalid tunnel.");
      const { url, address, family } = await publicDestination(
        "https://" + target,
      );
      if (url.port && url.port !== "443")
        throw new Error("Only HTTPS tunnels are allowed.");
      const upstream = connect({ host: address, family, port: 443 });
      upstream.setTimeout(60000, () => upstream.destroy());
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
      upstream.on("close", () => client.destroy());
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    }
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Proxy did not start.");
  server.unref();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}
