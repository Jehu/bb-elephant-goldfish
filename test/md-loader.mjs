// Test-only: lets node load `import x from "./file.md" with { type: "text" }`
// the way `bb plugin build` bundles it (the file's text as the default export).
import { readFile } from "node:fs/promises";
import { register } from "node:module";

if (!globalThis.__egmMdLoader) {
  globalThis.__egmMdLoader = true;
  register(import.meta.url);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".md")) {
    const text = await readFile(new URL(url), "utf8");
    return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(text)};` };
  }
  return nextLoad(url, context);
}
