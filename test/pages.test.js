import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PAGES, mountPages, pageFromHash, showPage } from "../pages.js";

test("all views load from relative static assets with unique IDs across the shell", async () => {
  const container = { innerHTML: "" };
  await mountPages(container, async path => ({
    ok: true,
    text: () => readFile(new URL(`../${path}`, import.meta.url), "utf8"),
  }));
  const shell = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const html = shell + container.innerHTML;
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const name of Object.keys(PAGES)) assert.ok(ids.includes(`${name}-page`));
  for (const module of ["app.js", "dashboard.js"]) {
    const source = await readFile(new URL(`../${module}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/(?:el|setText|getElementById)\("([^"]+)"/g)) {
      assert.ok(ids.includes(match[1]), `Missing ${match[1]} used by ${module}`);
    }
  }
});

test("a missing view rejects initialization without inserting a partial interface", async () => {
  const container = { innerHTML: "unchanged" };
  await assert.rejects(mountPages(container, async path => ({
    ok: path !== PAGES.map.path, status: 404, text: async () => "dashboard",
  })), /map\.html: 404/);
  assert.equal(container.innerHTML, "unchanged");
});

test("navigation switches existing views and handles unknown hashes", () => {
  for (const hash of ["", "#unknown", "#constructor", "#__proto__"]) {
    assert.equal(pageFromHash(hash), "dashboard");
  }
  const previousDocument = globalThis.document;
  const elements = Object.fromEntries(["map-page", "dashboard-page", "page-title", "page-subtitle"]
    .map(id => [id, {}]));
  const links = Object.keys(PAGES).map(page => ({
    dataset: { page }, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  }));
  globalThis.document = {
    getElementById: id => elements[id],
    querySelectorAll: () => links,
  };
  try {
    assert.equal(showPage("#map"), "map");
    assert.equal(elements["map-page"].hidden, false);
    assert.equal(elements["dashboard-page"].hidden, true);
    assert.equal(links[1].attributes["aria-current"], "page");
    assert.equal(showPage("#dashboard"), "dashboard");
    assert.equal(elements["map-page"].hidden, true);
    assert.equal(elements["dashboard-page"].hidden, false);
    assert.equal(links[1].attributes["aria-current"], undefined);
    assert.equal(links[0].attributes["aria-current"], "page");
  } finally {
    globalThis.document = previousDocument;
  }
});
