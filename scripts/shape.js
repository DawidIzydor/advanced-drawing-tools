import { MODULE_ID } from "./const.js";

Hooks.on("refreshDrawing", drawing => {
    if (drawing.shape?.destroyed) {
        return;
    }

    const document = drawing.document;

    if (document.getFlag(MODULE_ID, "invisible") && !(drawing.layer.active && (game.user.isGM || game.user === document.author))) {
        drawing.visible = false;
        drawing.shape.visible = false;
    }
});
