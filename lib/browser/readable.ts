// Server/Worker only. Never import this parser into the desktop client bundle.
import { Parser } from "htmlparser2";
const OMIT = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
]);
const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "nav",
  "aside",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ul",
  "ol",
  "tr",
  "table",
  "pre",
  "blockquote",
  "br",
  "hr",
]);
export const READABLE_LIMIT = 24000;
/** Static source text, not a DOM execution engine or a promise of rendered visibility. */
export function readablePage(html: string) {
  let text = "",
    title = "";
  const stack: Array<{ hidden: boolean; title: boolean }> = [];
  const append = (value: string) => {
    if (text.length <= READABLE_LIMIT)
      text += value.slice(0, READABLE_LIMIT + 1 - text.length);
  };
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const parent = stack.at(-1);
        const hidden =
          !!parent?.hidden ||
          OMIT.has(name) ||
          name === "head" ||
          Object.hasOwn(attributes, "hidden") ||
          attributes["aria-hidden"] === "true" ||
          /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(
            attributes.style ?? "",
          );
        const isTitle = name === "title" && title.length < 300;
        stack.push({ hidden, title: isTitle });
        if (!hidden && BLOCK.has(name)) append("\n");
      },
      ontext(value) {
        const current = stack.at(-1);
        if (current?.title) {
          title += value.slice(0, 300 - title.length);
          return;
        }
        if (current?.hidden) return;
        append(value.replace(/[\t\r\f ]+/g, " "));
      },
      onclosetag(name) {
        const current = stack.pop();
        if (!current?.hidden && BLOCK.has(name)) append("\n");
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return {
    title: title.replace(/\s+/g, " ").trim(),
    readableText: text
      .slice(0, READABLE_LIMIT)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    readableTruncated: text.length > READABLE_LIMIT,
  };
}
