import { MODULE_ID } from "./const.js";
import { getFillStyleMatrix, hasFillTransform, isLegacyFillStyle, migrateFillStyle } from "./fill-style.js";
import { _PIXI_FLUENT_FILL, _PIXI_LEGACY_FILL } from "./edit-mode.js";

// When a dashed overlay is active, zero the native strokeWidth before Foundry
// draws the base shape so the solid stroke doesn't bleed through the dashes.
Hooks.once("libWrapper.Ready", () => {
    libWrapper.register(
        MODULE_ID,
        "foundry.canvas.placeables.Drawing.prototype._refreshShape",
        function (wrapped, ...args) {
            const doc = this.document;
            const ls = doc.getFlag(MODULE_ID, "lineStyle");
            const dashActive = Array.isArray(ls?.dash) && ls.dash[0] > 0 && doc.strokeWidth > 0;

            if (dashActive) {
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

    // Pattern fills are drawn from this._getFillStyle(), so the texture transform is injected
    // into the fill style Foundry builds. The matrix maps texture pixels to shape-local pixels;
    // Pixi v7 (beginTextureFill) and v8 (fill) both invert it for the UVs.
    libWrapper.register(
        MODULE_ID,
        "foundry.canvas.placeables.Drawing.prototype._getFillStyle",
        function (wrapped, ...args) {
            const style = wrapped(...args);
            const doc = this.document;
            const fs = doc.getFlag(MODULE_ID, "fillStyle");

            if (!style?.texture || doc.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN || !hasFillTransform(fs)) {
                return style;
            }

            const matrix = getFillStyleMatrix(fs, style.texture, doc.shape);
            style.matrix = style.matrix ? style.matrix.clone().append(matrix) : matrix;
            // Pixi v8 stretches the texture to the shape bounds unless the texture space is
            // global, which keeps it at its pixel size like Pixi v7. Pixi v7 ignores this.
            style.textureSpace = "global";

            return style;
        },
        libWrapper.WRAPPER,
    );
});

Hooks.on("refreshDrawing", drawing => {
    if (drawing.shape?.destroyed) {
        return;
    }

    const document = drawing.document;

    if (document.getFlag(MODULE_ID, "invisible") && !(drawing.layer.active && (game.user.isGM || game.user === document.author))) {
        drawing.visible = false;
        drawing.shape.visible = false;
    }

    _refreshDashOverlay(drawing);
    _migrateFillStyle(drawing);
});

// Legacy (v13) fill flags render correctly as they are, but with an active GM they get rewritten
// to the current semantics once the texture is loaded and its size is known.
// Each drawing is migrated at most once per session, so a migration that doesn't stick can't loop.
const _migratedFillStyles = new Set();

function _migrateFillStyle(drawing) {
    const doc = drawing.document;

    if (drawing.isPreview || _migratedFillStyles.has(doc.uuid) || game.user !== game.users.activeGM) {
        return;
    }

    const fs = doc.getFlag(MODULE_ID, "fillStyle");
    const texture = drawing.texture;

    if (doc.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN || !texture?.width || !isLegacyFillStyle(fs)) {
        return;
    }

    const migrated = migrateFillStyle(fs, texture, doc.shape);

    if (!migrated) {
        return;
    }

    _migratedFillStyles.add(doc.uuid);
    doc.update({ [`flags.${MODULE_ID}.fillStyle`]: migrated })
        .catch(error => console.warn(`${MODULE_ID} | Failed to migrate fill style of ${doc.uuid}:`, error));
}

function _refreshDashOverlay(drawing) {
    const doc = drawing.document;
    const ls = doc.getFlag(MODULE_ID, "lineStyle");
    const dash = ls?.dash;

    const dashActive = Array.isArray(dash) && dash[0] > 0 && doc.strokeWidth > 0;

    if (!dashActive) {
        if (drawing._dashOverlay && !drawing._dashOverlay.destroyed) {
            drawing._dashOverlay.destroy();
        }
        drawing._dashOverlay = null;
        return;
    }

    if (!drawing._dashOverlay || drawing._dashOverlay.destroyed) {
        drawing._dashOverlay = drawing.addChild(new PIXI.Graphics());
    }

    const g = drawing._dashOverlay;
    g.clear();

    const segment = dash[0];
    const gap = dash[1] ?? dash[0];

    const color = Color.from(doc.strokeColor ?? "#000000");
    const alpha = doc.strokeAlpha ?? 1;
    const width = doc.strokeWidth;

    const pts = _getShapePoints(doc);
    if (!pts || pts.length < 4) return;

    const isClosed = doc.shape.type !== "f";

    if (_PIXI_LEGACY_FILL) g.lineStyle(width, color.valueOf(), alpha);
    _strokeDashed(g, pts, isClosed, segment, gap);
    if (_PIXI_FLUENT_FILL) g.stroke({ width, color: color.valueOf(), alpha });
}

function _getShapePoints(doc) {
    const { type, width, height, points } = doc.shape;

    switch (type) {
        case "p":
        case "f":
            return points;

        case "r":
            return [0, 0, width, 0, width, height, 0, height];

        case "e":
            return _sampleEllipse(width / 2, height / 2);

        default:
            return null;
    }
}

function _sampleEllipse(rx, ry) {
    if (rx <= 0 || ry <= 0) return [];

    const n = Math.max(8, Math.ceil(Math.sqrt((rx + ry) / 2)) * 8);
    const pts = new Array(n * 2);
    const cx = rx;
    const cy = ry;

    for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        pts[i * 2]     = cx + Math.cos(a) * rx;
        pts[i * 2 + 1] = cy + Math.sin(a) * ry;
    }

    return pts;
}

function _strokeDashed(g, pts, closed, segment, gap) {
    const count = Math.floor(pts.length / 2);
    if (count < 2) return;

    const edges = [];
    for (let i = 0; i < count - 1; i++) {
        const x0 = pts[i * 2],       y0 = pts[i * 2 + 1];
        const x1 = pts[(i + 1) * 2], y1 = pts[(i + 1) * 2 + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len > 0) edges.push({ x0, y0, x1, y1, len });
    }

    if (closed) {
        const x0 = pts[(count - 1) * 2], y0 = pts[(count - 1) * 2 + 1];
        const x1 = pts[0],               y1 = pts[1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len > 0) edges.push({ x0, y0, x1, y1, len });
    }

    if (edges.length === 0) return;

    let drawing = true;
    let remaining = segment;
    let penDown = false;

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
                    g.moveTo(x0 + dx * walked, y0 + dy * walked);
                    penDown = true;
                }
                g.lineTo(ex, ey);
            } else {
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
