import { MODULE_ID } from "./const.js";
import { calculateValue } from "./utils.js";

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

    if (document.fillType === CONST.DRAWING_FILL_TYPES.PATTERN) {
        const fillSprite = drawing.fill ?? drawing.mesh;
        if (fillSprite) {
            const texture = drawing.texture ?? fillSprite.texture;
            const fs = document.getFlag(MODULE_ID, "fillStyle");
            const transform = fs?.transform;

            let scaleW = 1;
            let scaleH = 1;
            if (texture && fs?.texture) {
                scaleW = calculateValue(fs.texture.width,  document.shape.width)  / texture.width;
                scaleH = calculateValue(fs.texture.height, document.shape.height) / texture.height;
                scaleW = scaleW || scaleH || 1;
                scaleH = scaleH || scaleW || 1;
            }

            const tileW = scaleW * (texture?.width  ?? 1);
            const tileH = scaleH * (texture?.height ?? 1);

            const posX = calculateValue(transform?.position?.x, tileW) ?? 0;
            const posY = calculateValue(transform?.position?.y, tileH) ?? 0;
            const pivX = calculateValue(transform?.pivot?.x,    tileW) ?? 0;
            const pivY = calculateValue(transform?.pivot?.y,    tileH) ?? 0;
            const userScaleX = transform?.scale?.x ?? 1;
            const userScaleY = transform?.scale?.y ?? 1;
            const rot = (transform?.rotation ?? 0) / 180 * Math.PI;

            if (fillSprite.tileScale)    fillSprite.tileScale.set(scaleW * userScaleX, scaleH * userScaleY);
            if (fillSprite.tilePosition) fillSprite.tilePosition.set(posX - pivX, posY - pivY);
            if ("tileRotation" in fillSprite) fillSprite.tileRotation = rot;
        }
    }
});

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

    _strokeDashed(g, pts, isClosed, segment, gap);

    g.stroke({ width, color: color.valueOf(), alpha });
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
