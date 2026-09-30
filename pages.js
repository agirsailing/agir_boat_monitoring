// HTML views share the shell and the live MQTT session in index.html.
export const PAGES = Object.freeze({
  dashboard: {
    path: "./pages/dashboard.html",
    title: "A view from the water.",
    subtitle: "Live instruments and recording control.",
    label: "Boat dashboard",
  },
  map: {
    path: "./pages/map.html",
    title: "Follow the boat.",
    subtitle: "Live position on the water.",
    label: "Map",
  },
});

export async function mountPages(container, fetchPage = globalThis.fetch) {
  const views = await Promise.all(Object.values(PAGES).map(async page => {
    const response = await fetchPage(page.path);
    if (!response.ok) throw new Error(`Could not load ${page.path}: ${response.status}`);
    return response.text();
  }));
  // These are our own static HTML assets, never MQTT or user-supplied content.
  container.innerHTML = views.join("\n");
}

export function pageFromHash(hash) {
  const name = hash.slice(1);
  return Object.hasOwn(PAGES, name) ? name : "dashboard";
}

export function showPage(hash) {
  const name = pageFromHash(hash);
  const page = PAGES[name];
  for (const id of Object.keys(PAGES)) {
    document.getElementById(`${id}-page`).hidden = id !== name;
  }
  for (const link of document.querySelectorAll("[data-page]")) {
    if (link.dataset.page === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.getElementById("page-title").textContent = page.title;
  document.getElementById("page-subtitle").textContent = page.subtitle;
  document.title = `Ågir · ${page.label}`;
  return name;
}
