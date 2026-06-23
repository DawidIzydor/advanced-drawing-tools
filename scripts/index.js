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

    foundry.canvas.placeables.Drawing.prototype._rescaleDimensions = function (original, dx, dy) {
        return foundry.canvas.placeables.Drawing.rescaleDimensions(original, dx, dy);
    };
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

    Hooks.on("updateDrawing", (document, changes) => {
        if (!document.rendered) {
            return;
        }

        // Refresh when module flags change
        if (changes.flags && (changes.flags[MODULE_ID] !== undefined
            || changes.flags[`-=${MODULE_ID}`] !== undefined)) {
            document.object.refresh();
        }
        
        // Also refresh when text changes (to ensure text rendering updates)
        if (changes.text !== undefined) {
            document.object.refresh();
        }
    });
    
});
