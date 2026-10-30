# Interface — Navigation, dashboard and map

**Agir Boat Monitoring · `src/ui/`**  
_Last updated: 30/10/2026_

[JavaScript code](../README.md) · [HTML views](../../pages/README.md)

## Introduction

The modules in this folder turn application state into visible content.
Buttons remain connected to commands in `app.js`; the MQTT connection stays
in its dedicated service. The map uses Leaflet, loaded as the global `L`.

## Structure

| File | Main elements | Responsibility |
|---|---|---|
| [`pages.js`](pages.js) | `PAGES`, `mountPages()`, `showPage()` | View loading, titles and hash navigation. |
| [`dashboard.js`](dashboard.js) | `renderDashboard()` | Measurements, units, timestamps and recording command state. |
| [`map.js`](map.js) | `BoatMap`, `movementBearing()` | Map, arrow, track and buoy markers. |

## Navigation and loading

`mountPages()` downloads the fragments registered in `PAGES` in parallel, then
inserts them together into the container. If one fails, initialization is rejected:
an incomplete combination of views is not mounted.

`showPage()` shows `<name>-page`, hides the other views, updates the document title
and sets `aria-current` on the active link. Empty or unknown hashes select Dashboard.
Browser Back/Forward navigation works through `hashchange`.

Views remain in the DOM even when hidden: switching pages does not recreate the
MQTT session or lose the track. IDs must therefore be unique.
`PAGES.path` strings are relative to the `index.html` document, whereas JavaScript
imports are relative to the module.

## Dashboard rendering

The renderer reads `state.values()` and `state.recording()`. It writes text only
when it changes and uses `textContent` for received bag names and errors too.
Unavailable data is not converted to zero.

| Values | Format |
|---|---|
| Roll, pitch, yaw and main speed | One decimal place. |
| Height and ultrasonic distances | Two decimal places. |
| Coordinates | Six decimal places and degree symbols. |
| Speed in the position card | Two decimal places, m/s. |
| Battery voltage | One decimal place, V. |
| Timestamp | ISO UTC if `sec` and `nanosec` are numeric and the date can be represented. |

Start/Stop depend on `state.canCommand()` and demo mode.
The UI does not independently reconstruct sensor validity conditions.

## Map creation and behaviour

`BoatMap.show(true)` creates the map only on its first display. The initial view
is Stockholm, coordinates `[59.3293, 18.0686]`, zoom 13. Tiles come from OpenStreetMap;
attribution remains visible. The configured maximum zoom is 19.

Each opening calls `invalidateSize()` because the container may have been hidden
or resized. Missing Leaflet produces an error; if some tiles fail, position updates
can continue.

`update()` uses absolute latitude and longitude. It does not add position increments.
Direction comes from the initial bearing between two points on the Earth's sphere;
movements under one metre do not update orientation. Before the first meaningful
movement, direction is reported as unavailable.

Follow moves the centre only while enabled and the map is visible.
Dragging the map disables Follow without interrupting track collection or arrow updates.

## Track and GPS gaps

| Method | Effect |
|---|---|
| `recordPosition()` | Appends a point different from the previous one; keeps points even before Leaflet is created. |
| `reset()` | Removes the arrow and resets direction and the active segment, preserving earlier segments. |
| `reset({clearTrack:true})` | Also clears all track segments. |
| `resetTrack(values)` | Clears the track and starts a segment at the supplied valid fix; preserves arrow, direction, Follow and buoys. |

The one-metre filter concerns **orientation**, not track appending:
only consecutive identical coordinates are ignored for the latter.
An expired fix closes the segment; recovery does not draw a line across the
unknown interval. The track has neither persistence nor a maximum point count:
memory usage can grow during long sessions.

## Buoy markers

`updateMarks()` maintains a map of markers indexed by numeric type.
An existing type is moved; a type missing from the new state is removed.
Labels come from `MARK_NAMES`, not from HTML sent by the broker.

Markers are updated exclusively from periodic state, not from the Ping response.
An invalid current fix alone does not remove buoys received in map state that is
still recent. Expired state or disconnection hides them.

## Start line

`drawStartLine()` connects Committee (`0`) and Pin (`1`) with an orange dashed
polyline. Clicking Draw changes the button to **Clear line**: the next click calls
`clearStartLine()`, removes only the line and restores Draw, keeping buoys and
track intact. `updateMarks()` updates the endpoints of an existing line and removes
it if either buoy is missing. After clearing, buoy updates do not redraw the line
until Draw is pressed again.

The line is independent of the track: Reset track and loss of only the boat's fix
do not clear it. When buoy state expires or the session closes, `updateMarks([])`
removes it; drawing it again requires another click.

## When extending these modules

For views, consult the [`pages/` documentation](../../pages/README.md).
For a new measurement, change validation in `core/` first, then the renderer and
HTML fragment. For colours and sizes, edit
[`assets/css/`](../../assets/README.md), avoiding styles generated from MQTT messages.

Tests use simulated Leaflet objects: they check map behaviour, not its appearance
in a real browser. Visual verification is still needed for layout.
