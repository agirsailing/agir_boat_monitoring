import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PAGES } from "../src/ui/pages.js";

test("all browser assets and module imports resolve under a GitHub Pages project path", async () => {
  const root = new URL("../", import.meta.url);
  const site = new URL("https://example.invalid/agir_boat_monitoring/");
  const entry = new URL("index.html", site);
  const queue = [entry, ...Object.values(PAGES).map(page => new URL(page.path, entry))];
  const visited = new Set();
  const add = (reference, base) => {
    if (!reference.startsWith("#")) queue.push(new URL(reference, base));
  };

  while (queue.length) {
    const url = queue.shift();
    if (url.origin !== site.origin || visited.has(url.pathname)) continue;
    assert.ok(url.pathname.startsWith(site.pathname), `Escapes project path: ${url}`);
    visited.add(url.pathname);
    const relative = url.pathname.slice(site.pathname.length);
    // Windows tolerates case mismatches that would fail on GitHub Pages.
    let directory = root;
    for (const part of relative.split("/")) {
      assert.ok((await readdir(directory)).includes(part), `Missing or incorrect case: ${relative}`);
      directory = new URL(`${part}/`, directory);
    }
    if (!/\.(html|js|css)$/.test(relative)) continue;
    const source = await readFile(new URL(relative, root), "utf8");
    if (relative.endsWith(".html")) {
      // Fragment assets, like shell assets, resolve against the document URL.
      for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) add(match[1], entry);
    } else if (relative.endsWith(".js")) {
      for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) add(match[1], url);
    } else {
      for (const match of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) add(match[1], url);
    }
  }
  assert.ok(visited.has(new URL("src/app.js", site).pathname));
  assert.ok(visited.has(new URL("assets/css/styles.css", site).pathname));
  assert.ok(visited.has(new URL("assets/css/login.css", site).pathname));
});
