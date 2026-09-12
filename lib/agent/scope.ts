export class AgentScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentScopeError";
  }
}
const privateRoots = [
  "conversations",
  "agent",
  "auth",
  "private",
  "credentials",
  "secrets",
];
export function privateAgentPath(path: string) {
  const normalized = path.toLowerCase();
  return privateRoots.some(
    (name) =>
      normalized === `/.oma/${name}` || normalized.startsWith(`/.oma/${name}/`),
  );
}
export function scopedPath(
  fs: { normalize: (path: string) => string },
  path: string,
) {
  const normalized = fs.normalize(path);
  if (!(
    normalized === "/home/guest" ||
    normalized.startsWith("/home/guest/") ||
    normalized === "/.oma" ||
    normalized.startsWith("/.oma/")
  ))
    throw new AgentScopeError("Path is outside the agent filesystem scope.");
  if (privateAgentPath(normalized))
    throw new AgentScopeError(
      "This directory is private. Attach an exported document to share it.",
    );
  return normalized;
}
