/** Next may expose its bind address in request.url. Use the HTTP authority
 * browsers actually addressed, never the caller-controlled Origin header. */
export function authRequest(request: Request): Request {
  const host = request.headers.get('host');
  if (!host) return request;
  const url = new URL(request.url);
  const authority = new URL(`${url.protocol}//${host}`);
  if (authority.host !== host || authority.username || authority.password || authority.pathname !== '/') {
    throw new Error('Invalid request host');
  }
  url.host = authority.host;
  return new Request(url, request);
}
