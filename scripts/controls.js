import { MODULE_ID } from "./const.js";

Hooks.on("getSceneControlButtons", (controls) => {
    // v13: controls is a Record<string, SceneControl>, not an array
    const drawings = controls.drawings;
    if (!drawings) return;

    // v13: tools is a Record<string, SceneControlTool>, not an array
    const tools = drawings.tools;
    if (!tools) return;

    // Ensure activeTool is valid (v13 is strict about this)
    drawings.activeTool ??= drawings.activeTool in tools ? drawings.activeTool : Object.keys(tools)[0];
});
