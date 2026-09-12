import { lookup } from "node:dns/promises";
import { publicAddress, remoteURL } from "../browser/fetch";
/** Return a public address which callers must use directly, without a second lookup. */
export async function publicDestination(input: string) {
  const url = remoteURL(input);
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (
    !addresses.length ||
    addresses.some((address) => !publicAddress(address.address))
  )
    throw new Error("Private network requests are blocked.");
  return { url, ...addresses[0] };
}
