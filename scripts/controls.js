import { MODULE_ID } from "./const.js";

Hooks.on("getSceneControlButtons", (controls) => {
    const drawings = controls.drawings;
    if (!drawings) return;

    const tools = drawings.tools;
    if (!tools) return;

    const clearTool = tools.clear;
    const targetOrder = clearTool ? (clearTool.order - 0.5) : 1000;

    tools[`${MODULE_ID}.snap`] = {
        name: `${MODULE_ID}.snap`,
        title: "CONTROLS.WallSnap",
        icon: "fas fa-plus",
        toggle: true,
        order: targetOrder,
        onChange: (event, active) => {
            canvas.drawings._forceSnap = active;
        }
    };

    drawings.activeTool ??= drawings.activeTool in tools ? drawings.activeTool : Object.keys(tools)[0];
});
