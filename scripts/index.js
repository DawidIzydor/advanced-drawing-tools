import { MODULE_ID } from "./const.js";
import { cleanData } from "./utils.js";

import "./config.js";
import "./controls.js";
import "./convert.js";
import "./edit-mode.js";
import "./hud.js";
import "./precise-text.js";
import "./shape.js";
import "./text.js";

Hooks.once("libWrapper.Ready", () => {
    // v14: gridPrecision was removed; override getSnappedPoint to honour _forceSnap instead
    try {
        libWrapper.register(MODULE_ID, "foundry.canvas.layers.DrawingsLayer.prototype.getSnappedPoint", function (wrapped, point) {
            if (!this._forceSnap) return wrapped(point);
            // Force snap to grid vertices/corners
            return canvas.grid.getSnappedPoint(point, { mode: CONST.GRID_SNAPPING_MODES.CORNER });
        }, libWrapper.MIXED);
    } catch(e) {
        console.warn(`${MODULE_ID} | getSnappedPoint wrapper failed:`, e);
    }


    if (!foundry.utils.isNewerVersion(game.version, 11)) {
        libWrapper.register(MODULE_ID, "Drawing.prototype._rescaleDimensions", function (original, dx, dy) {
            let { points, width, height } = original.shape;
            width += dx;
            height += dy;
            points = points || [];

            // Rescale polygon points
            if (this.isPolygon) {
                const scaleX = 1 + (dx / original.shape.width);
                const scaleY = 1 + (dy / original.shape.height);
                points = points.map((p, i) => p * (i % 2 ? scaleY : scaleX));
            }

            // Normalize the shape
            return this.constructor.normalizeShape({
                x: original.x,
                y: original.y,
                shape: { width: Math.roundFast(width), height: Math.roundFast(height), points }
            });
        }, libWrapper.OVERRIDE);
    } else {
        Drawing.prototype._rescaleDimensions = function (original, dx, dy) {
            return Drawing.rescaleDimensions(original, dx, dy);
        };
    }
});

function preProcess(data) {
    const fill = foundry.utils.getProperty(data, `flags.${MODULE_ID}.textStyle.fill`);

    if (fill != null && !Array.isArray(fill)) {
        foundry.utils.setProperty(data, `flags.${MODULE_ID}.textStyle.fill`, [fill]);
    }

    return data;
}

Hooks.on("preCreateDrawing", (document) => {
    document.updateSource(cleanData(preProcess(document.toObject()), { deletionKeys: true }));
});

Hooks.on("preUpdateDrawing", (document, data) => {
    cleanData(preProcess(data), { inplace: true, deletionKeys: true, partial: true });
});

Hooks.once("init", () => {
    if (foundry.utils.isNewerVersion(game.version, 11)) {
        Hooks.on("updateDrawing", (document, changes) => {
            if (!document.rendered) {
                return;
            }

            if (changes.flags && (changes.flags[MODULE_ID] !== undefined
                || changes.flags[`-=${MODULE_ID}`] !== undefined)) {
                document.object.refresh();
            }
        });
    }
});
