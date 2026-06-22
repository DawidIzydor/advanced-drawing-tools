import { MODULE_ID } from "./const.js";

Hooks.on("getSceneControlButtons", controls => {
    const drawingsControl = controls["drawings"];

    if (drawingsControl) {
        drawingsControl.tools[`${MODULE_ID}.snap`] = {
            name: `${MODULE_ID}.snap`,
            title: "CONTROLS.WallSnap",
            icon: "fas fa-plus",
            toggle: true,
            active: canvas.drawings?._forceSnap || false,
            onChange: toggled => canvas.drawings._forceSnap = toggled
        };
    }
});
