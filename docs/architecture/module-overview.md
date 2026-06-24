# Advanced Drawing Tools — Module Overview

A FoundryVTT module (id `advanced-drawing-tools`, requires `lib-wrapper`, compatible with Foundry v14) that extends the built-in Drawing placeable with extra line styles, fill controls, text styling, and polygon editing. All state is stored in `flags.advanced-drawing-tools.*` on the Drawing document. The entrypoint is `scripts/index.js`; all other files are imported from there.

```
scripts/
├── index.js          — bootstrap, libWrapper init, preCreate/preUpdate hooks
├── const.js          — MODULE_ID, MODULE_NAME, DEFAULT_FLAGS
├── utils.js          — value parsing/serialisation, cleanData()
├── config.js         — DrawingConfig UI injection, form-data serialisation
├── controls.js       — scene control toolbar (snap toggle)
├── convert.js        — Drawing._convertToPolygon(), approximateEllipse()
├── edit-mode.js      — polygon vertex/edge edit handles, drag wrappers
├── hud.js            — HUD buttons: edit mode, flip H/V
├── shape.js          — refreshDrawing: dashed stroke overlay, texture transform
├── text.js           — refreshDrawing: text style application, arc warping
├── precise-text.js   — PreciseText resolution override (Pixi v8 compat)
└── warped-text.js    — WarpedText / WarpedTextGeometry PIXI mesh for arc text
```

---

## scripts/const.js

Exports three names used across the module:

```js
export const MODULE_ID   = "advanced-drawing-tools";
export const MODULE_NAME = "Advanced Drawing Tools";
export const DEFAULT_FLAGS = Object.freeze({ ... });
```

`DEFAULT_FLAGS` is a flat object whose keys are full dotted flag paths (e.g. `flags.advanced-drawing-tools.lineStyle.dash`). It serves as both the schema and the set of recognised flag paths for `cleanData()`. A flag absent from `DEFAULT_FLAGS` is ignored by `cleanData()` even if it appears in the data.

---

## scripts/utils.js

Value parsing and flag-cleaning utilities.

### `parseValue(value) → { value, unit } | null`

Parses a string like `"50%"` or `"12px"` (or a bare number, assumed `px`) into `{ value: number, unit: "px" | "%" }`. Returns `null` for anything that doesn't match.

### `calculateValue(value, base) → number | null`

Calls `parseValue`, then resolves `%` against `base`. Used to resolve texture/wrap sizes at render time.

### `stringifyValue(value) → string | null`

Round-trips through `parseValue` and returns `"12px"` or `"50%"`. Used to populate form field values.

### `saveValue(value) → number | string | null`

Like `stringifyValue` but returns a number for `px` values (Foundry stores those as numbers, not strings).

### `hexToRgba(hex, opacity?) → string`

Converts a hex colour + opacity to a CSS `rgba(...)` string. Used when building PIXI text stroke values.

### `cleanData(data, opts) → data`

The central data-normalisation function. Called in `preCreateDrawing` and `preUpdateDrawing`.

```js
cleanData(data, {
    inplace:     false,   // mutate data in place vs return a new object
    deletionKeys: false,  // emit Foundry "-=key" deletion keys for unset flags
    keepOthers:  true,    // pass through non-module keys
    partial:     false,   // treat data as a partial update (fewer deletion keys)
})
```

Four phases:
1. Seed deletion keys so Foundry removes any previously stored flag that is no longer set.
2. Normalize each recognised flag value via `normalizeFlag` (string trim/lowercase for strings; `saveValue` for CSS-length defaults). Skip values that equal their `DEFAULT_FLAGS` default.
3. Remove child deletion keys made redundant by a parent deletion key.
4. Expand the flat key map back to a nested object with `foundry.utils.expandObject`.

---

## scripts/index.js

Bootstrap file. Does four things:

1. **Imports** all feature modules (side-effect-only imports).
2. **`libWrapper.Ready`** — registers a MIXED wrapper on `DrawingsLayer.prototype.getSnappedPoint` to honour `_forceSnap` (replaces the removed `gridPrecision` from v14). Also patches `Drawing.prototype._rescaleDimensions` to delegate to the static `Drawing.rescaleDimensions`.
3. **`preCreateDrawing` / `preUpdateDrawing` hooks** — run `cleanData` (with deletion keys) over the document before it is persisted. A `preProcess` step normalises legacy single-value `fill` to `[fill]`.
4. **`init` hook** — subscribes to `updateDrawing` and calls `document.object.refresh()` when module flags or `text` change on a rendered drawing.

---

## scripts/config.js

Extends the Drawing configuration form (`renderDrawingConfig` hook) by injecting additional HTML fields for every module-controlled property.

Injected controls by tab:

| Tab | Field(s) added |
|-----|---------------|
| Position | Invisible checkbox |
| Line (after strokeWidth) | Dash length + Gap + enable checkbox |
| Fill | Texture size, position, pivot, scale, rotation, skew |
| Text (after fontFamily) | Font style, variant, weight |
| Text (after fontSize) | Leading, letter spacing, line height, word wrap width |
| Text (around textColor) | Multi-stop gradient colours + stops, gradient type |
| Text (after textAlpha) | Alignment, stroke colour/thickness/opacity, drop shadow controls, arc |

**jQuery compatibility shim** — `getDOMHelper(root)` / `createMinimalJQuery(element)`: the hook receives an `HTMLElement` in v13+ rather than a jQuery object. These helpers provide a minimal jQuery-like API (`.find`, `.append`, `.after`, `.click`, `.val`, etc.) so the injection code runs unchanged on both versions.

**`_prepareSubmitData` wrapper** (libWrapper WRAPPER on `DocumentSheetV2.prototype._prepareSubmitData`) — runs only for Drawing sheets. Coerces form values before they reach Foundry:
- `lineStyle.dash`: reads the checkbox; writes a `[dash, gap]` number array or `null`.
- Several `fillStyle.*` and `textStyle.*` paths run through `saveValue` (handles px/% strings).
- `textStyle.fill` / `fillGradientStops`: normalises multi-input arrays, collapses all-empty arrays to `null`.

---

## scripts/controls.js

Adds a **snap toggle** button to the Drawings layer toolbar via `getSceneControlButtons`.

```js
tools[`${MODULE_ID}.snap`] = {
    name, title, icon, toggle: true,
    onChange: (event, active) => { canvas.drawings._forceSnap = active; }
};
```

The toggle is inserted just before the existing `clear` tool. `_forceSnap` is read by the `getSnappedPoint` wrapper in `index.js`.

---

## scripts/convert.js

Adds `Drawing.prototype._convertToPolygon({ confirm? })`.

- No-ops if the drawing is already a polygon (`shape.type === "p"`).
- Optionally shows a `DialogV2.confirm` prompt.
- For `"r"` (rectangle): generates 4 corner points.
- For `"e"` (ellipse): calls `approximateEllipse(width, height)`.
- Calls `Drawing.rescaleDimensions` on the update before persisting.
- If `fillType === NONE`, switches to `SOLID` with `fillAlpha = 0` so the polygon has a hit area.
- Sets `bezierFactor = 0`.

### `approximateEllipse(width, height) → number[]`

Returns a flat `[x0, y0, x1, y1, ...]` clockwise polygon approximating an ellipse. Uses `n = ceil(sqrt((rx+ry)/2))` to set vertex density. Fills the four quadrants in parallel using four write cursors to avoid a second-pass winding correction.

---

## scripts/edit-mode.js

Implements interactive polygon vertex editing via two custom PIXI handle classes and several `libWrapper` overrides.

### Handle classes

**`PointHandle extends PIXI.Graphics`** — circular handle at a polygon vertex. `index` is the vertex index. Renders a filled white circle with black stroke; grows on hover.

**`EdgeHandle extends PIXI.Graphics`** — rectangular handle centred on the midpoint of a polygon edge. `index` is the index of the edge's *end* vertex. Renders a white rectangle with solid or dashed border (dashed for the closing edge at `index === 0`). Clicking inserts a new vertex; right-clicking deletes the adjacent vertex.

### `Drawing.prototype._refreshEditMode()`

Called on every `refreshDrawing`. When `_editMode` is `true` and the shape is a polygon:
- Creates `_editHandles` PIXI container (with `.edges` and `.points` sub-containers) if it doesn't exist.
- Adds/removes `EdgeHandle` and `PointHandle` children to match `shape.points.length`.
- Attaches inline `pointerover`/`pointerout` listeners (v14 no longer provides `_onHandleHoverIn`/`Out`).

When `_editMode` is `false`, destroys the container.

### libWrapper overrides

| Wrapped method | Type | What it does |
|---|---|---|
| `activateListeners` | WRAPPER | Rebinds `pointerup` on `frame.handle` to `_onHandleMouseUp` |
| `_onDragLeftStart` | MIXED | For `EdgeHandle`: inserts vertex into document source before drag begins |
| `_onDragLeftMove` | MIXED | Updates document source position live during drag; applies snapping |
| `_onDragLeftDrop` | MIXED | Finalises the vertex move/insert via `document.update` |
| `_onClickLeft` | MIXED | Detects clicks on edit handles and sets `_editHandle` / `dragHandle` flag |
| `_onClickRight` | MIXED | Deletes hovered vertex (or adjusts edge start) on right-click |

All wrappers are version-guarded: v11/v12/v13/v14 differences in `interactionData`, `originalData`, `dragHandle`, and `renderFlags` are resolved through small adapter closures built once inside `libWrapper.Ready`.

### Coordinate helpers

```js
canvasToLocal(canvasPoint, { x, y, rotation, shape }) → PIXI.Point
shapeUpdateFrom({ x, y, shape: { width, height, points } }) → updateObj
applyHandlePoint(update, handle, localPoint) → void
```

`canvasToLocal` inverts the drawing's translation + rotation matrix to convert a canvas-space point into the drawing's local coordinate space.

---

## scripts/hud.js

Adds buttons to the Drawing HUD (`renderDrawingHUD` hook):

- **Edit** (`fas fa-draw-polygon`): unlocks the drawing if needed, optionally converts to polygon, then toggles `_editMode`.
- **Flip H** / **Flip V** (polygon only): mirrors all `shape.points` coordinates around the bounding box centre axis via `doc.update`.

`unlockDrawing(hud)` shows a `DialogV2.confirm` and calls `doc.update({ locked: false })` if confirmed.

---

## scripts/shape.js

`refreshDrawing` hook handler for non-text visual overrides.

**Invisible flag** — if `flags.advanced-drawing-tools.invisible` is set, hides `drawing.visible` and `drawing.shape.visible` unless the drawings layer is active and the user is GM or author.

**Dashed stroke overlay** — active when `lineStyle.dash` is set, `strokeWidth > 0`, and `shape.type === "p"`. Creates `drawing._dashOverlay` (a child `PIXI.Graphics`) and draws a dashed polygon over the shape on each refresh. The overlay replicates `strokeColor` / `strokeAlpha` from the base drawing.

`drawDashedPolygon(g, points, dash, gap, lineWidth, color, alpha, closed)` — state-machine dash renderer that tracks remaining dash/gap across polygon segment boundaries.

**Texture fill transform** — active when `fillType === PATTERN` and `fillStyle` flags are present. Computes a `PIXI.Matrix` from the stored transform (position, pivot, scale, rotation, skew) and `fillStyle.texture` size, then applies it to the fill sprite's `tileTransform` (v14 `TilingSprite`).

---

## scripts/text.js

`refreshDrawing` hook handler for text styling.

Reads `flags.advanced-drawing-tools.textStyle` and applies all properties directly to `drawing.text.style` (a PIXI `TextStyle`):

- Gradient fill: prepends `document.textColor` to `ts.fill` array if gradient stops exist.
- Stroke: builds an `rgba(...)` string from `ts.stroke` (or auto-contrasting colour) and `ts.strokeOpacity`.
- `lineHeight`: defaults to `fontSize * 1.2` when not explicitly set.
- `fillGradientType 0` = `LINEAR_VERTICAL` (constant; `PIXI.TEXT_GRADIENT` was removed in Pixi v8).

Repositions `text.anchor` and `text.position` for left/centre/right alignment.

**Arc text** — when `ts.arc !== 0`, creates a `WarpedText` child and hides the original `drawing.text` (`renderable = false`). Cleans up on arc = 0.

---

## scripts/precise-text.js

Overrides `foundry.canvas.containers.PreciseText` to fix text resolution in Pixi v8.

Pins `_quality` to `1`. Replaces `updateText` with a version that:
- Does not crash when `dirty` / `localStyleID` / `styleID` are absent (removed in Pixi v8).
- Handles `lineHeight === "normal"` or `null`.
- Clamps `_resolution` to `PreciseText._MAX_RESOLUTION` (default 2).

Guards against a missing `PreciseText` class (logs a warning and skips).

---

## scripts/warped-text.js

PIXI mesh that renders a `PIXI.Text` object warped along a circular arc.

### `WarpedText extends PIXI.Mesh`

Wraps a `text: PIXI.Text` object. Shares the text's texture (via `BaseTexture`/`source`, handling the Pixi v7→v8 rename). Uses `WarpedTextGeometry` as the mesh geometry and `MeshSimpleMaterial` / `MeshMaterial` (v7→v8 rename).

Key members:

| Member | Description |
|--------|-------------|
| `arc` (get/set) | Arc in radians; triggers `_buildGeometry` on change |
| `textureUpdated()` | Rebuilds geometry when the texture dimensions change |
| `_buildGeometry(w, h, arc)` | Sets `segWidth`/`segHeight` proportional to `sqrt(radius)`, then calls `geometry.build()` |
| `_render` / `updateTransform` / `getBounds` / `getLocalBounds` | All call `text.updateText(true)` first to keep the texture current |

### `WarpedTextGeometry extends PIXI.PlaneGeometry`

Extends `PlaneGeometry.build()` to deform vertices along a circular arc:
- `radius = width / arc`
- Each vertex `(u, v)` is converted to polar `(angle, r)` around the arc centre, then back to Cartesian.
- `dy = radius * cos(arc/2)` keeps the arc centred vertically within the bounding box.
