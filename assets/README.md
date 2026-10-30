# Visual assets — Styles and team identity

**Agir Boat Monitoring · `assets/`**  
_Last updated: 30/10/2026_

[Project overview](../README.md) · [HTML views](../pages/README.md)

## Introduction

This folder holds the web app's local visual resources. CSS defines layout,
colours and small-screen adaptation; images contain the team's original logos.
They do not need to be generated during deployment.

## Structure

| Path | Purpose |
|---|---|
| [`css/styles.css`](css/styles.css) | Shared theme, navbar, instruments, panels, map and responsive rules. |
| [`css/login.css`](css/login.css) | Login overlay, form box and its logo dimensions. |
| [`images/Agir-4x1_Text.png`](images/Agir-4x1_Text.png) | Horizontal logo with text: navbar and login screen. |
| [`images/Agir-4x4.png`](images/Agir-4x4.png) | Vertical logo: site favicon. |

## How styles are loaded

[`index.html`](../index.html) loads Leaflet CSS first, then `styles.css` and finally
`login.css`. The latter can therefore customize the login appearance.
`styles.css` imports DM Sans and Manrope from Google Fonts, with system fonts as fallback.

| Element | Where to edit |
|---|---|
| Main colours | `--teal`, `--muted`, `--border` variables and `:root` properties. |
| Navbar and navigation | `.topbar`, `.brand`, `.page-nav`. |
| Cards and instruments | `.metric`, `.panel`, `.metric-grid`, `.attitude-values`. |
| Map and controls | `#boat-map`, `.map-toolbar`, `.map-controls`. |
| Arrow and buoys | `.boat-marker`, `.boat-arrow`, `.buoy-marker` and type-specific classes. |
| Login form | `.login-overlay`, `.login-box`, `.login-brand` in `login.css`. |

Numeric values are written by JavaScript renderers. Some state colours depend
on `data-tone`, such as `good` and `alert`, set by the UI.

## Logos: proportions and dimensions

The original horizontal logo measures 8000×2000 pixels and includes transparent
side margins. `.logo-frame` hides those margins; the image is centred and positioned
absolutely inside a frame with an explicit height.
The PNG file is neither cropped nor altered.

| Usage | Frame | Inner image |
|---|---|---|
| Navbar, wide screen | 220×100 px | 400×100 px |
| Navbar, up to 800 px | 176×80 px | 320×80 px |
| Login | Up to 280 px wide, 128 px high | 512×128 px |
| Login, up to 380 px | 220×100 px, within available width | 400×100 px |

Keep frame and image dimensions consistent. HTML attributes use display dimensions,
not the original 8000×2000 pixels: without the correct CSS, huge dimensions could
push the form off screen. The login box also has a maximum height tied to the
window and vertical scrolling.

## Paths and cache

URLs in `index.html` are relative to the site root, for example
`./assets/images/Agir-4x1_Text.png`. URLs written in CSS are instead relative to
the CSS file itself: from `assets/css/`, a local image is reached with `../images/...`.

CSS links include a version parameter. When a change requires new styles to load
together with new HTML, update that parameter. To diagnose an old copy, first
verify that deployment succeeded, then inspect the files actually downloaded
by the browser.

## Checking a visual change

Check login, Dashboard and Map on wide and narrow screens. Include a short window:
fields and the Connect button must remain reachable. Verify logo legibility,
controls without overlaps, keyboard focus and visible map attribution.

The [path test](../test/assets.test.js) finds missing local files or incorrect
filename case, but does not validate dimensions, contrast or font rendering.
CDN libraries, fonts and map tiles remain dependencies outside this folder.
