import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { gunzipSync, brotliDecompressSync, inflateSync } from "node:zlib";
import ipaddr from "ipaddr.js";
const LIMIT = 2 * 1024 * 1024;
export function publicAddress(address: string) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export function remoteURL(input: string) {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !["", "80", "443"].includes(url.port)
  )
    throw new Error(
      "Only public HTTP(S) pages on standard ports are supported.",
    );
  return url;
}
export async function fetchPage(
  input: string,
  redirects = 0,
  deadline = Date.now() + 20000,
): Promise<{ html: string; url: string }> {
  const url = remoteURL(input);
  if (Date.now() >= deadline) throw new Error("Website timed out.");
  if (redirects > 5) throw new Error("Too many redirects.");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error(
      "Private and local network addresses are not available through the web gateway.",
    );
  const { address, family } = addresses[0];
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        family,
        lookup: (_host, _options, callback) => callback(null, address, family),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; oma.os/0.1; public document browser)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.destroy();
          void fetchPage(
            new URL(res.headers.location, url).href,
            redirects + 1,
            deadline,
          ).then(resolve, reject);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume();
          reject(new Error(`Website returned HTTP ${res.statusCode}.`));
          return;
        }
        if (
          !/text\/html|application\/xhtml\+xml/.test(
            res.headers["content-type"] ?? "",
          )
        ) {
          res.resume();
          reject(new Error("This address is not an HTML page."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > LIMIT) {
            req.destroy(new Error("Page exceeds the 2 MB document limit."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            let body = Buffer.concat(chunks);
            const encoding = res.headers["content-encoding"];
            if (encoding === "gzip")
              body = gunzipSync(body, { maxOutputLength: LIMIT });
            else if (encoding === "br")
              body = brotliDecompressSync(body, { maxOutputLength: LIMIT });
            else if (encoding === "deflate")
              body = inflateSync(body, { maxOutputLength: LIMIT });
            const charset =
              /charset=["\']?([^;"\'\s]+)/i.exec(
                res.headers["content-type"] || "",
              )?.[1] || "utf-8";
            let html: string;
            try {
              html = new TextDecoder(charset).decode(body);
            } catch {
              html = body.toString("utf8");
            }
            resolve({ html, url: url.href });
          } catch {
            reject(new Error("Could not decode this page."));
          }
        });
      },
    );
    const timeout = setTimeout(
      () => req.destroy(new Error("Website timed out.")),
      Math.max(1, deadline - Date.now()),
    );
    req.on("close", () => clearTimeout(timeout));
    req.setTimeout(10000, () => req.destroy(new Error("Website timed out.")));
    req.on("error", reject);
    req.end();
  });
}
