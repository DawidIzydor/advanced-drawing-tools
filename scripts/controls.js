import { MODULE_ID } from "./const.js";

Hooks.on("getSceneControlButtons", (controls) => {
    // v13: controls is a Record<string, SceneControl>, not an array
    const drawings = controls.drawings;
    if (!drawings) return;

    // v13: tools is a Record<string, SceneControlTool>, not an array
    const tools = drawings.tools;
    if (!tools) return;

    // Get the order for positioning our tool before the "clear" tool
    const clearTool = tools.clear;
    const targetOrder = clearTool ? (clearTool.order - 0.5) : 1000;

    // Add our snap tool
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

    // Ensure activeTool is valid (v13 is strict about this)
    drawings.activeTool ??= drawings.activeTool in tools ? drawings.activeTool : Object.keys(tools)[0];
});
