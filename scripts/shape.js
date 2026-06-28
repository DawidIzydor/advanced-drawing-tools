import { MODULE_ID } from "./const.js";
import { calculateValue } from "./utils.js";

// ──────────────────────────────────────────────────────────────────────────────
// Base-stroke suppression via libWrapper MIXED on _refreshShape
// When a dashed overlay is active we zero the native strokeWidth so the solid
// stroke doesn't bleed through beneath the dashes.
// ──────────────────────────────────────────────────────────────────────────────
Hooks.once("libWrapper.Ready", () => {
    libWrapper.register(
        MODULE_ID,
        "foundry.canvas.placeables.Drawing.prototype._refreshShape",
        function (wrapped, ...args) {
            const doc = this.document;
            const ls = doc.getFlag(MODULE_ID, "lineStyle");
            const dashActive = Array.isArray(ls?.dash) && ls.dash[0] > 0 && doc.strokeWidth > 0;

            if (dashActive) {
                // Temporarily zero strokeWidth on the document data so Foundry
                // draws no visible solid stroke, then restore it afterwards.
                const real = doc._source.strokeWidth;
                doc._source.strokeWidth = 0;
                try {
                    wrapped(...args);
                } finally {
                    doc._source.strokeWidth = real;
                }
            } else {
                wrapped(...args);
            }
        },
        libWrapper.MIXED,
    );
});

// ──────────────────────────────────────────────────────────────────────────────
// refreshDrawing hook — dashed overlay + fillStyle texture transform
// ──────────────────────────────────────────────────────────────────────────────
Hooks.on("refreshDrawing", drawing => {
    if (drawing.shape?.destroyed) {
        return;
    }

    const document = drawing.document;

    // ---- Invisible flag ----
    if (document.getFlag(MODULE_ID, "invisible") && !(drawing.layer.active && (game.user.isGM || game.user === document.author))) {
        drawing.visible = false;
        drawing.shape.visible = false;
    }

    // ---- Dashed overlay ----
    _refreshDashOverlay(drawing);

    // ---- Fill style texture transform (v7-compatible path via graphicsData) ----
    const { fillStyle } = drawing.shape.geometry?.graphicsData?.[0] ?? {};

    if (fillStyle && document.fillType) {
        let texture;

        if (document.fillType === CONST.DRAWING_FILL_TYPES.PATTERN && (texture = drawing.texture)) {
            const fs = document.getFlag(MODULE_ID, "fillStyle");
            const transform = fs?.transform;
            let scaleW = calculateValue(fs?.texture?.width, document.shape.width) / texture.width;
            let scaleH = calculateValue(fs?.texture?.height, document.shape.height) / texture.height;

            [scaleW, scaleH] = [scaleW || scaleH || 1, scaleH || scaleW || 1];

            const width = scaleW * texture.width;
            const height = scaleH * texture.height;

            fillStyle.matrix = new PIXI.Matrix().setTransform(
                calculateValue(transform?.position?.x, width) ?? 0,
                calculateValue(transform?.position?.y, height) ?? 0,
                calculateValue(transform?.pivot?.x, width) ?? 0,
                calculateValue(transform?.pivot?.y, height) ?? 0,
                transform?.scale?.x ?? 1,
                transform?.scale?.y ?? 1,
                (transform?.rotation ?? 0) / 180 * Math.PI,
                (transform?.skew?.x ?? 0) / 180 * Math.PI,
                (transform?.skew?.y ?? 0) / 180 * Math.PI
            ).append(new PIXI.Matrix(scaleW, 0, 0, scaleH));
        } else {
            fillStyle.smooth = true;
        }
    }
});

// ──────────────────────────────────────────────────────────────────────────────
// Dash overlay renderer
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build or update the _dashOverlay child Graphics on the drawing.
 * Destroys the overlay when dash is no longer active.
 */
function _refreshDashOverlay(drawing) {
    const doc = drawing.document;
    const ls = doc.getFlag(MODULE_ID, "lineStyle");
    const dash = ls?.dash; // null | [segment, gap]

    const dashActive = Array.isArray(dash) && dash[0] > 0 && doc.strokeWidth > 0;

    // Tear down if no longer active
    if (!dashActive) {
        if (drawing._dashOverlay && !drawing._dashOverlay.destroyed) {
            drawing._dashOverlay.destroy();
        }
        drawing._dashOverlay = null;
        return;
    }

    // Create overlay if missing
    if (!drawing._dashOverlay || drawing._dashOverlay.destroyed) {
        drawing._dashOverlay = drawing.addChild(new PIXI.Graphics());
    }

    const g = drawing._dashOverlay;
    g.clear();

    const segment = dash[0];
    const gap = dash[1] ?? dash[0];

    // Resolve stroke colour and alpha from the drawing document
    const color = Color.from(doc.strokeColor ?? "#000000");
    const alpha = doc.strokeAlpha ?? 1;
    const width = doc.strokeWidth;

    // Build the point list for this shape type
    const pts = _getShapePoints(doc);
    if (!pts || pts.length < 4) return;

    const isClosed = doc.shape.type !== "f"; // freehand is open

    // Stroke the dashed path onto g using the v8 fluent API
    _strokeDashed(g, pts, isClosed, segment, gap);

    g.stroke({ width, color: color.valueOf(), alpha });
}

/**
 * Return a flat [x0,y0, x1,y1, ...] point list for the given drawing document's shape.
 */
function _getShapePoints(doc) {
    const { type, width, height, points } = doc.shape;

    switch (type) {
        case "p": // polygon (and bezier-smoothed polygon — shape.points are the raw vertices)
        case "f": // freehand
            return points;

        case "r": { // rectangle
            return [
                0, 0,
                width, 0,
                width, height,
                0, height,
            ];
        }

        case "e": { // ellipse — sample perimeter
            return _sampleEllipse(width / 2, height / 2);
        }

        default:
            return null;
    }
}

/**
 * Sample an axis-aligned ellipse centred at (rx, ry) with semi-axes rx, ry.
 * Uses the same quadrant-doubling strategy as convert.js for consistency.
 * Returns a flat [x0,y0, x1,y1, ...] array.
 */
function _sampleEllipse(rx, ry) {
    if (rx <= 0 || ry <= 0) return [];

    // Number of sample points — same heuristic as convert.js
    const n = Math.max(8, Math.ceil(Math.sqrt((rx + ry) / 2)) * 8);
    const pts = new Array(n * 2);
    const cx = rx;
    const cy = ry;

    for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        pts[i * 2] = cx + Math.cos(a) * rx;
        pts[i * 2 + 1] = cy + Math.sin(a) * ry;
    }

    return pts;
}

/**
 * Walk the point list building a dashed path on g using moveTo/lineTo only.
 * The caller is responsible for calling g.stroke({...}) afterwards.
 *
 * @param {PIXI.Graphics} g
 * @param {number[]} pts  Flat [x,y,...] array
 * @param {boolean} closed  Whether to connect last point back to first
 * @param {number} segment  Drawn dash length in pixels
 * @param {number} gap      Gap length in pixels
 */
function _strokeDashed(g, pts, closed, segment, gap) {
    const count = Math.floor(pts.length / 2);
    if (count < 2) return;

    // Accumulate total path length and store edge lengths for the state machine
    const edges = []; // { x0, y0, x1, y1, len }
    for (let i = 0; i < count - 1; i++) {
        const x0 = pts[i * 2];
        const y0 = pts[i * 2 + 1];
        const x1 = pts[(i + 1) * 2];
        const y1 = pts[(i + 1) * 2 + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len > 0) edges.push({ x0, y0, x1, y1, len });
    }

    if (closed) {
        const x0 = pts[(count - 1) * 2];
        const y0 = pts[(count - 1) * 2 + 1];
        const x1 = pts[0];
        const y1 = pts[1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len > 0) edges.push({ x0, y0, x1, y1, len });
    }

    if (edges.length === 0) return;

    // State machine: walk each edge, drawing dash/gap spans
    let drawing = true;        // true → currently in a drawn segment
    let remaining = segment;   // how many pixels left in the current dash/gap
    let penDown = false;       // whether we have an open moveTo

    for (const edge of edges) {
        let walked = 0;
        const { x0, y0, x1, y1, len } = edge;
        const dx = (x1 - x0) / len;
        const dy = (y1 - y0) / len;

        while (walked < len) {
            const avail = len - walked;
            const step = Math.min(remaining, avail);
            const ex = x0 + dx * (walked + step);
            const ey = y0 + dy * (walked + step);

            if (drawing) {
                if (!penDown) {
                    const sx = x0 + dx * walked;
                    const sy = y0 + dy * walked;
                    g.moveTo(sx, sy);
                    penDown = true;
                }
                g.lineTo(ex, ey);
            } else {
                // gap — lift pen for next dash
                penDown = false;
            }

            walked += step;
            remaining -= step;

            if (remaining <= 0) {
                drawing = !drawing;
                remaining = drawing ? segment : gap;
            }
        }
    }
}
