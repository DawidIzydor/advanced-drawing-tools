import { MODULE_NAME } from "./const.js";

foundry.canvas.placeables.Drawing.prototype._convertToPolygon = async function ({ confirm = false } = {}) {
    if (this.document.shape.type === "p") {
        return;
    }

    return await (confirm ? foundry.applications.api.DialogV2.confirm({
        window: { title: `${MODULE_NAME}: Convert Drawing to Polygon` },
        content: `<p>Permanently convert this Drawing to a Polygon?</p>`,
        yes: { label: "Yes" },
        no: { label: "No", default: true }
    }) : Promise.resolve(true)).then(async result => {
        if (!result) {
            return;
        }

        this.document.reset();

        const { x, y, shape: { width, height, type } } = this.document;
        let update = { x, y, shape: { width, height, type: "p" } };

        if (type === "r") {
            update.shape.points = [0, 0, width, 0, width, height, 0, height];
        } else if (type === "e") {
            update.shape.points = approximateEllipse(width, height);
        } else {
            return;
        }

        this.document.shape.type = "p";
        update = this._rescaleDimensions(update, 0, 0);
        update.shape.type = "p";

        if (this.document.fillType === CONST.DRAWING_FILL_TYPES.NONE) {
            update.fillType = CONST.DRAWING_FILL_TYPES.SOLID;
            update.fillAlpha = 0;
        }

        update.bezierFactor = 0;

        await this.document.update(update);
    });
};

// Generates a clockwise polygon that approximates an ellipse with semi-axes rx and ry.
// Uses n*8 vertices, filling all four quadrants simultaneously with four write cursors so that
// the output array is already in the correct winding order without a second pass.
//
// Write cursors and the quadrant each fills (starting from the rightmost point, going clockwise):
//   rightToBottom  — forward  from index 0:       right  → bottom-right → bottom
//   topToLeft      — backward from index n*4+2:   top    → top-left     → left
//   leftToBottom   — forward  from index n*4+2:   left   → bottom-left
//   bottomToRight  — backward from index n*8:     bottom → bottom-right (mirror of topToLeft quadrant)
function approximateEllipse(width, height) {
    const rx = width / 2;
    const ry = height / 2;

    if (!(rx > 0 && ry > 0)) {
        return [];
    }

    const cx = rx;
    const cy = ry;

    // n controls vertex density; roughly sqrt of the average radius.
    const n = Math.ceil(Math.sqrt((rx + ry) / 2));
    const totalPoints = n * 8;
    const points = new Array(totalPoints);

    let rightToBottom = 0;
    let topToLeft     = n * 4 + 2;
    let leftToBottom  = n * 4 + 2;
    let bottomToRight = totalPoints;

    // Seed the rightmost (index 0) and leftmost (index n*4) vertices.
    {
        const xRight = cx + rx;
        const xLeft  = cx - rx;

        points[rightToBottom++] = xRight;
        points[rightToBottom++] = cy;
        points[--topToLeft]     = cy;
        points[--topToLeft]     = xLeft;
    }

    // Fill the top-right and top-left quadrant pairs, mirrored into the bottom-right and bottom-left.
    for (let i = 1; i < n; i++) {
        const angle = Math.PI / 2 * (i / n);
        const dx = Math.cos(angle) * rx;
        const dy = Math.sin(angle) * ry;

        const xRight = cx + dx;
        const xLeft  = cx - dx;
        const yBelow = cy + dy;
        const yAbove = cy - dy;

        // Right half going down (top-right → bottom-right)
        points[rightToBottom++] = xRight;
        points[rightToBottom++] = yBelow;

        // Left half going up toward top (reflected top-right → top-left)
        points[--topToLeft]     = yBelow;
        points[--topToLeft]     = xLeft;

        // Left half going down (bottom-left)
        points[leftToBottom++]  = xLeft;
        points[leftToBottom++]  = yAbove;

        // Right half going up from bottom (reflected bottom-left → bottom-right)
        points[--bottomToRight] = yAbove;
        points[--bottomToRight] = xRight;
    }

    // Seed the bottom (index n*2) and top (index n*6) vertices.
    {
        const yBottom = cy + ry;
        const yTop    = cy - ry;

        points[rightToBottom++] = cx;
        points[rightToBottom++] = yBottom;
        points[--bottomToRight] = yTop;
        points[--bottomToRight] = cx;
    }

    return points;
}
