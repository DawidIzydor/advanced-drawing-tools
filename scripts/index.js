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
    libWrapper.register(MODULE_ID, "foundry.canvas.layers.DrawingsLayer.prototype.gridPrecision", function () {
        // Force snapping to grid vertices
        if (this._forceSnap) return canvas.grid.type <= CONST.GRID_TYPES.SQUARE ? 2 : 5;

        // Normal snapping precision
        let size = canvas.dimensions.size;
        if (size >= 128) return 16;
        else if (size >= 64) return 8;
        else if (size >= 32) return 4;
        return 1;
    }, libWrapper.OVERRIDE);
    libWrapper.ignore_conflicts(MODULE_ID, "precise-drawing-tools", "DrawingsLayer.prototype.gridPrecision");

    // Scaling seems to work fine without it, but this code broke it, leaving it commented for now as I'm not sure what needs fixing
    // libWrapper.register(MODULE_ID, `foundry.canvas.placeables.Drawing.rescaleDimensions`, function (original, dx, dy) {
    //     let { points, width, height } = original.shape;
    //     width += dx;
    //     height += dy;
    //     points = points || [];

    //     // Rescale polygon points
    //     if (this.isPolygon) {
    //         const scaleX = 1 + (dx / original.shape.width);
    //         const scaleY = 1 + (dy / original.shape.height);
    //         points = points.map((p, i) => p * (i % 2 ? scaleY : scaleX));
    //     }

    //     // Normalize the shape
    //     return this.normalizeShape({
    //         x: original.x,
    //         y: original.y,
    //         shape: { width: Math.round(width), height: Math.round(height), points }
    //     });
    // }, libWrapper.OVERRIDE);
     
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
