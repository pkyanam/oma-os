import type { ModelMessage } from "ai";
// Trim complete old turns so tool calls always retain their matching results.
export function fitConversation(
  messages: ModelMessage[],
  maxCharacters = 160000,
): { messages: ModelMessage[]; omitted: number } {
  let start = 0;
  const sizes = messages.map((message) => JSON.stringify(message).length);
  let total = sizes.reduce((sum, size) => sum + size, 0);
  while (total > maxCharacters) {
    const nextUser = messages.findIndex(
      (message, index) => index > start && message.role === "user",
    );
    if (nextUser < 0) break;
    for (let index = start; index < nextUser; index++) total -= sizes[index];
    start = nextUser;
  }
  return { messages: messages.slice(start), omitted: start };
}
