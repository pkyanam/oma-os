import sanitize from "sanitize-html";
import { randomBytes } from "node:crypto";
import { localKeyboardBridge } from "../apps/browser-target";
function absolute(value: string, base: string) {
  try {
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function documentHTML(html: string, base: string) {
  const cleaned = sanitize(html, {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      "html",
      "head",
      "body",
      "title",
      "style",
      "link",
      "img",
      "picture",
      "source",
      "form",
      "input",
      "select",
      "option",
      "textarea",
      "button",
      "label",
      "details",
      "summary",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
    ],
    allowedAttributes: {
      "*": [
        "class",
        "id",
        "style",
        "title",
        "role",
        "aria-label",
        "dir",
        "lang",
      ],
      a: ["href", "target"],
      img: ["src", "alt", "width", "height", "loading"],
      source: ["src", "type"],
      link: ["href", "rel", "type", "media"],
      form: ["action", "method"],
      input: ["type", "name", "value", "placeholder", "checked", "disabled"],
      button: ["type", "name", "value"],
      select: ["name"],
      option: ["value", "selected"],
      textarea: ["name", "placeholder"],
      label: ["for"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http"],
    allowProtocolRelative: false,
    allowVulnerableTags: true,
    transformTags: {
      "*": (tag, attrs) => {
        for (const key of ["href", "src", "action"])
          if (attrs[key]) attrs[key] = absolute(attrs[key], base);
        if (tag === "link" && attrs.rel !== "stylesheet")
          return { tagName: "span", attribs: {} };
        if (tag === "input" && attrs.type === "password")
          return {
            tagName: "input",
            attribs: {
              type: "text",
              placeholder: "Sign-in is unavailable in document mode",
              disabled: "disabled",
            },
          };
        return { tagName: tag, attribs: attrs };
      },
    },
  });
  const safeBase = JSON.stringify(base).replace(/</g, "\\u003c");
  const nonce = randomBytes(18).toString("base64");
  // Only our navigation/keyboard bridge executes. Remote scripts, forms, frames,
  // workers and connection APIs cannot run inside the readable document.
  const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src https: http: 'unsafe-inline'; img-src https: http: data:; font-src https: http: data:; media-src https: http:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; connect-src 'none'`;
  const keyboard = localKeyboardBridge.replace(
    "<script>",
    `<script nonce="${nonce}">`,
  );
  return (
    `<meta name="oma-document" content="1"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    cleaned +
    keyboard +
    `<script nonce="${nonce}">const base=${safeBase};addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(!a)return;e.preventDefault();const u=new URL(a.href,base);if(u.hash&&u.origin+u.pathname+u.search===new URL(base).origin+new URL(base).pathname+new URL(base).search){const target=document.getElementById(decodeURIComponent(u.hash.slice(1)));if(target){target.scrollIntoView();return;}}parent.postMessage({type:'oma:web-navigate',url:u.href,newTab:e.ctrlKey||e.metaKey||a.target==='_blank'},'*');},true);addEventListener('submit',e=>{e.preventDefault();const f=e.target;if((f.method||'get').toLowerCase()!=='get'){parent.postMessage({type:'oma:web-error',message:'This form needs a full browser runtime. Document mode supports links and GET search forms.'},'*');return;}const u=new URL(f.getAttribute('action')||base,base);u.search='';for(const [k,v] of new FormData(f,e.submitter))if(typeof v==='string')u.searchParams.append(k,v);parent.postMessage({type:'oma:web-navigate',url:u.href},'*');},true);<\/script>`
  );
}
