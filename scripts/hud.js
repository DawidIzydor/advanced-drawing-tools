import { MODULE_ID, MODULE_NAME } from "./const.js";

Hooks.on("renderDrawingHUD", (hud, html) => {
    const left = html.querySelector(".col.left");
    if (!left) return;

    const edit = document.createElement("div");
    edit.classList.add("control-icon");
    if (hud.object._editMode) edit.classList.add("active");
    edit.setAttribute("title", "Edit");
    edit.dataset.action = `${MODULE_ID}.edit`;
    edit.innerHTML = `<i class="fas fa-draw-polygon"></i>`;
    left.append(edit);

    edit.addEventListener("click", async event => {
        await unlockDrawing(hud);

        const drawing = hud.object;
        if (drawing.document.locked) return;

        await drawing._convertToPolygon({ confirm: true });

        if (drawing.document.shape.type === (CONST.DRAWING_SHAPES?.POLYGON ?? "p")) {
            drawing._toggleEditMode();
            hud.render(true);
        }
    });

    if (hud.object.document.shape.type === (CONST.DRAWING_SHAPES?.POLYGON ?? "p")) {
        const flipH = document.createElement("div");
        flipH.classList.add("control-icon");
        flipH.setAttribute("title", "Flip horizontally");
        flipH.dataset.action = `${MODULE_ID}.flip-h`;
        flipH.innerHTML = `<i class="fas fa-arrows-alt-h"></i>`;
        left.append(flipH);

        flipH.addEventListener("click", async event => {
            await unlockDrawing(hud);
            if (hud.object.document.locked) return;

            const doc = hud.object.document;
            const width = Math.abs(doc.shape.width);
            const points = foundry.utils.deepClone(doc.shape.points);
            for (let i = 0; i < points.length; i += 2) points[i] = width - points[i];
            await doc.update({ shape: { points } });
        });

        const flipV = document.createElement("div");
        flipV.classList.add("control-icon");
        flipV.setAttribute("title", "Flip vertically");
        flipV.dataset.action = `${MODULE_ID}.flip-v`;
        flipV.innerHTML = `<i class="fas fa-arrows-alt-v"></i>`;
        left.append(flipV);

        flipV.addEventListener("click", async event => {
            await unlockDrawing(hud);
            if (hud.object.document.locked) return;

            const doc = hud.object.document;
            const height = Math.abs(doc.shape.height);
            const points = foundry.utils.deepClone(doc.shape.points);
            for (let i = 1; i < points.length; i += 2) points[i] = height - points[i];
            await doc.update({ shape: { points } });
        });
    }
});

async function unlockDrawing(hud) {
    if (!hud.object.document.locked) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: `${MODULE_NAME}: Unlock Drawing` },
        content: `<p>Unlock this Drawing?</p>`,
        yes: { label: "Yes" },
        no: { label: "No" }
    });

    if (!confirmed) return;

    await hud.object.document.update({ locked: false });
    hud.render(true);
}
