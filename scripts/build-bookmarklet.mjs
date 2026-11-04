// Builds the bookmarklet from content.js and writes the install page.
//   npm install && npm run build
// Outputs:
//   docs/bookmarklet.js  minified code (for reference)
//   docs/index.html      install page, from docs/template.html

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { minify } from "terser";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(join(root, "content.js"), "utf8");
const { version } = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));

const { code } = await minify(source, {
  ecma: 2020,
  compress: { passes: 2 },
  mangle: true,
  format: { comments: false },
});

// "void 0" stops browsers from replacing the page with the script's result.
const href = "javascript:" + encodeURIComponent(`${code};void 0`);

const template = await readFile(join(root, "docs", "template.html"), "utf8");
const page = template
  .replaceAll("__BOOKMARKLET_HREF__", href)
  .replaceAll("__VERSION__", version);
if (page.includes("__BOOKMARKLET_HREF__")) throw new Error("template placeholder not replaced");

await writeFile(join(root, "docs", "bookmarklet.js"), code + "\n");
await writeFile(join(root, "docs", "index.html"), page);
console.log(`Built v${version}: ${code.length} chars of code, ${href.length} char bookmarklet`);
