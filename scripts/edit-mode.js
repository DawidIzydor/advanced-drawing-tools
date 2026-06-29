import { MODULE_ID } from "./const.js";

// Detect PIXI.Graphics drawing API at module load.
// In PixiJS v8 with the fluent API, fill()/stroke() are instance methods.
// In PixiJS v7 (and some v8 builds without the fluent shim), fill/stroke are
// not methods; instead style is set with lineStyle()/beginFill()/endFill().
const _tmpGfx = new PIXI.Graphics();
export const _PIXI_FLUENT_FILL = typeof _tmpGfx.fill === "function";
export const _PIXI_LEGACY_FILL = !_PIXI_FLUENT_FILL && typeof _tmpGfx.beginFill === "function";
_tmpGfx.destroy();

Hooks.on("refreshDrawing", drawing => {
    drawing._refreshEditMode();
});

// Transforms a canvas-space point into the drawing's local (unrotated, origin-at-top-left) space.
export function canvasToLocal(canvasPoint, { x, y, rotation, shape: { width, height } }) {
    const local = new PIXI.Point(canvasPoint.x, canvasPoint.y);
    new PIXI.Matrix()
        .translate(-width / 2, -height / 2)
        .rotate(Math.toRadians(rotation || 0))
        .translate(x + width / 2, y + height / 2)
        .applyInverse(local, local);
    return local;
}

// Returns a mutable shape update object seeded from the given document data.
export function shapeUpdateFrom({ x, y, shape: { width, height, points } }) {
    return { x, y, shape: { width, height, points: Array.from(points) } };
}

// Applies a handle's local point into the update: EdgeHandle inserts a new vertex; PointHandle moves an existing one.
export function applyHandlePoint(update, handle, localPoint) {
    if (handle instanceof EdgeHandle) {
        update.shape.points.splice(handle.index * 2, 0, localPoint.x, localPoint.y);
    } else {
        update.shape.points[handle.index * 2] = localPoint.x;
        update.shape.points[handle.index * 2 + 1] = localPoint.y;
    }
}

foundry.canvas.placeables.Drawing.prototype._editMode = false;

foundry.canvas.placeables.Drawing.prototype._toggleEditMode = function (active) {
    this.layer.placeables.forEach(drawing => {
        if (drawing !== this && drawing._editMode) {
            drawing._editMode = false;
            drawing.refresh();
        }
    });

    if (active === undefined) {
        active = !this._editMode;
    } else {
        active = !!active;
    }

    if (this._editMode !== active) {
        this._editMode = active;
        this.refresh();
    }
};

foundry.canvas.placeables.Drawing.prototype._editHandles = null;
foundry.canvas.placeables.Drawing.prototype._hoveredEditHandle = null;
foundry.canvas.placeables.Drawing.prototype._activeEditHandle = null;

foundry.canvas.placeables.Drawing.prototype._refreshEditMode = function () {
    const document = this.document;

    if (this._editMode && !document.locked && document.shape.type === (CONST.DRAWING_SHAPES?.POLYGON ?? "p")) {
        let editHandles = this._editHandles;

        if (!editHandles || editHandles.destroyed) {
            editHandles = this._editHandles = this.addChild(new PIXI.Container());
            editHandles.edges = editHandles.addChild(new PIXI.Container());
            editHandles.points = editHandles.addChild(new PIXI.Container());
        }

        // In Foundry v14 the Drawing container may be at world origin (0, 0) with
        // the document position applied elsewhere in the render pipeline. Detect this
        // by comparing the Drawing's effective world origin against document.(x,y).
        // If they differ, apply the document transform to editHandles so handles land
        // on the polygon vertices. Re-applied every refresh so moves stay in sync.
        const { x: docX, y: docY, rotation, shape: { width, height, points } } = document;
        const effectiveX = this.x - (this.pivot?.x ?? 0);
        const effectiveY = this.y - (this.pivot?.y ?? 0);
        if (Math.abs(effectiveX - docX) > 0.5 || Math.abs(effectiveY - docY) > 0.5) {
            editHandles.position.set(docX + width / 2, docY + height / 2);
            editHandles.pivot.set(width / 2, height / 2);
            editHandles.rotation = Math.toRadians(rotation || 0);
        } else {
            editHandles.position.set(0, 0);
            editHandles.pivot.set(0, 0);
            editHandles.rotation = 0;
        }

        for (let i = editHandles.edges.children.length; i <= points.length; i++) {
            editHandles.edges.addChild(new EdgeHandle(this, i));
        }
        if (editHandles.edges.children.length > points.length) {
            editHandles.edges.removeChildren(points.length).forEach(c => c.destroy({ children: true }));
        }

        for (let i = editHandles.points.children.length; i <= points.length; i++) {
            editHandles.points.addChild(new PointHandle(this, i));
        }
        if (editHandles.points.children.length > points.length) {
            editHandles.points.removeChildren(points.length).forEach(c => c.destroy({ children: true }));
        }

        editHandles.edges.children.forEach(h => h.refresh());
        editHandles.points.children.forEach(h => h.refresh());
    } else {
        this._editMode = false;
        this._activeEditHandle = null;
        this._hoveredEditHandle = null;

        if (this._editHandles) {
            this._editHandles.destroy({ children: true });
            this._editHandles = null;
        }
    }
};

export class PointHandle extends PIXI.Graphics {
    _hover = false;
    _dragging = false;
    _originalData = null;

    constructor(object, index) {
        super();

        this.object = object;
        this.index = index;
        this.cursor = "pointer";
        this.eventMode = "static";

        this.on("pointerover", this._onPointerOver, this);
        this.on("pointerout", this._onPointerOut, this);
        this.on("pointerdown", this._onPointerDown, this);
        this.on("globalpointermove", this._onPointerMove, this);
        this.on("pointerup", this._onPointerUp, this);
        this.on("pointerupoutside", this._onPointerUp, this);
        this.on("rightdown", this._onRightDown, this);
    }

    _onPointerOver() {
        if (this.object._activeEditHandle) return;
        this._hover = true;
        this.refresh();
        this.object._hoveredEditHandle = this;
    }

    _onPointerOut() {
        this._hover = false;
        this.refresh();
        if (this.object._hoveredEditHandle === this) this.object._hoveredEditHandle = null;
    }

    _onPointerDown(event) {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (this.object.document.locked) return;

        this._originalData = this.object.document.toObject();
        this._dragging = true;
        this._hover = true;
        this.object._activeEditHandle = this;
        this.refresh();
    }

    _onPointerMove(event) {
        if (!this._dragging || this.destroyed) return;

        const worldPoint = event.getLocalPosition
            ? event.getLocalPosition(canvas.stage)
            : canvas.stage.toLocal(event.global);
        const snapped = event.shiftKey ? worldPoint : this.object.layer.getSnappedPoint(worldPoint);

        const localPoint = canvasToLocal(snapped, this._originalData);
        const update = shapeUpdateFrom(this._originalData);
        applyHandlePoint(update, this, localPoint);

        try {
            this.object.document.updateSource(update);
            this.object.renderFlags.set({ refreshShape: true });
        } catch (err) { }
    }

    _onPointerUp(event) {
        if (!this._dragging || this.destroyed) return;

        const worldPoint = event.getLocalPosition
            ? event.getLocalPosition(canvas.stage)
            : canvas.stage.toLocal(event.global);
        const snapped = event.shiftKey ? worldPoint : this.object.layer.getSnappedPoint(worldPoint);

        const localPoint = canvasToLocal(snapped, this._originalData);
        let update = shapeUpdateFrom(this._originalData);
        applyHandlePoint(update, this, localPoint);
        update = this.object._rescaleDimensions(update, 0, 0);

        this._endDrag();
        this.object.document.update(update, { diff: false });
    }

    _onRightDown(event) {
        if (this.destroyed) return;
        event.stopPropagation();

        if (this._dragging) {
            this._cancelDrag();
            return;
        }

        if (!this._hover) return;
        const { x, y, shape: { width, height, points } } = this.object.document;
        if (points.length <= 6) return; // refuse delete below 3 vertices

        let update = shapeUpdateFrom({ x, y, shape: { width, height, points } });
        update.shape.points.splice(this.index * 2, 2);
        update = this.object._rescaleDimensions(update, 0, 0);
        this.object.document.update(update, { diff: false });
    }

    _endDrag() {
        this._dragging = false;
        this._originalData = null;
        if (this.object._activeEditHandle === this) this.object._activeEditHandle = null;
        if (!this.destroyed) {
            this._hover = false;
            this.refresh();
        }
    }

    _cancelDrag() {
        if (!this._dragging || !this._originalData) return;
        const originalData = this._originalData;
        this._endDrag();
        this.object.document.updateSource(shapeUpdateFrom(originalData));
        this.object.renderFlags.set({ refreshShape: true });
    }

    refresh() {
        if (this.destroyed) return;

        const document = this.object.document;
        const points = document.shape.points;
        const i = this.index * 2;

        if (i >= points.length) {
            this.visible = false;
            return;
        }

        const x = points[i];
        const y = points[i + 1];

        let lw = 2;
        if (canvas.dimensions.size > 150) lw = 4;
        else if (canvas.dimensions.size > 100) lw = 3;

        const r = lw * (this._hover ? 4 : 3);

        this.clear();
        if (_PIXI_FLUENT_FILL) {
            (this.circle ?? this.drawCircle).call(this, 0, 0, r)
                .fill({ color: 0xFFFFFF, alpha: 1.0 })
                .stroke({ width: lw, color: 0x000000, alpha: 1.0 });
        } else if (_PIXI_LEGACY_FILL) {
            this.lineStyle(lw, 0x000000, 1.0).beginFill(0xFFFFFF, 1.0);
            (this.circle ?? this.drawCircle).call(this, 0, 0, r);
            this.endFill();
        }

        this.position.set(x, y);
        this.visible = true;
    }
}

export class EdgeHandle extends PIXI.Graphics {
    _hover = false;
    _dragging = false;
    _originalData = null;
    _insertedIndex = null;

    constructor(object, index) {
        super();

        this.object = object;
        this.index = index;
        this.cursor = "pointer";
        this.eventMode = "static";

        this.on("pointerover", this._onPointerOver, this);
        this.on("pointerout", this._onPointerOut, this);
        this.on("pointerdown", this._onPointerDown, this);
        this.on("globalpointermove", this._onPointerMove, this);
        this.on("pointerup", this._onPointerUp, this);
        this.on("pointerupoutside", this._onPointerUp, this);
        this.on("rightdown", this._onRightDown, this);
    }

    _onPointerOver() {
        if (this.object._activeEditHandle) return;
        this._hover = true;
        this.refresh();
        this.object._hoveredEditHandle = this;
    }

    _onPointerOut() {
        this._hover = false;
        this.refresh();
        if (this.object._hoveredEditHandle === this) this.object._hoveredEditHandle = null;
    }

    _onPointerDown(event) {
        if (event.button !== 0) return;
        event.stopPropagation();
        if (this.object.document.locked) return;

        this._originalData = this.object.document.toObject();
        this._dragging = true;
        this._insertedIndex = this.index;
        this.object._activeEditHandle = this;

        // Insert the new vertex at the click position
        const worldPoint = event.getLocalPosition
            ? event.getLocalPosition(canvas.stage)
            : canvas.stage.toLocal(event.global);
        const snapped = event.shiftKey ? worldPoint : this.object.layer.getSnappedPoint(worldPoint);
        const localPoint = canvasToLocal(snapped, this._originalData);

        const { x, y, shape: { width, height, points } } = this._originalData;
        const insertUpdate = shapeUpdateFrom({ x, y, shape: { width, height, points } });
        insertUpdate.shape.points.splice(this._insertedIndex * 2, 0, localPoint.x, localPoint.y);

        try {
            this.object.document.updateSource(insertUpdate);
            this.object.renderFlags.set({ refreshShape: true });
        } catch (err) { }
    }

    _onPointerMove(event) {
        if (!this._dragging || this.destroyed) return;

        const worldPoint = event.getLocalPosition
            ? event.getLocalPosition(canvas.stage)
            : canvas.stage.toLocal(event.global);
        const snapped = event.shiftKey ? worldPoint : this.object.layer.getSnappedPoint(worldPoint);
        const localPoint = canvasToLocal(snapped, this._originalData);

        const { x, y, shape: { width, height, points } } = this._originalData;
        const update = shapeUpdateFrom({ x, y, shape: { width, height, points } });
        update.shape.points.splice(this._insertedIndex * 2, 0, localPoint.x, localPoint.y);

        try {
            this.object.document.updateSource(update);
            this.object.renderFlags.set({ refreshShape: true });
        } catch (err) { }
    }

    _onPointerUp(event) {
        if (!this._dragging || this.destroyed) return;

        const worldPoint = event.getLocalPosition
            ? event.getLocalPosition(canvas.stage)
            : canvas.stage.toLocal(event.global);
        const snapped = event.shiftKey ? worldPoint : this.object.layer.getSnappedPoint(worldPoint);
        const localPoint = canvasToLocal(snapped, this._originalData);

        const { x, y, shape: { width, height, points } } = this._originalData;
        let update = shapeUpdateFrom({ x, y, shape: { width, height, points } });
        update.shape.points.splice(this._insertedIndex * 2, 0, localPoint.x, localPoint.y);
        update = this.object._rescaleDimensions(update, 0, 0);

        this._endDrag();
        this.object.document.update(update, { diff: false });
    }

    _onRightDown(event) {
        if (this.destroyed) return;
        event.stopPropagation();

        if (this._dragging) {
            this._cancelDrag();
            return;
        }

        if (!this._hover) return;
        const { x, y, rotation, shape: { width, height, points } } = this.object.document;
        if (points.length <= 6) return; // refuse delete below 3 vertices

        let update = shapeUpdateFrom({ x, y, shape: { width, height, points } });

        // Move the edge's start point to the right-click origin before splicing out this vertex.
        const worldPoint = event.getLocalPosition
            ? event.getLocalPosition(canvas.stage)
            : canvas.stage.toLocal(event.global);
        const localPoint = canvasToLocal(worldPoint, { x, y, rotation, shape: { width, height } });
        update.shape.points[(this.index * 2 + points.length - 2) % points.length] = localPoint.x;
        update.shape.points[(this.index * 2 + points.length - 1) % points.length] = localPoint.y;

        update.shape.points.splice(this.index * 2, 2);
        update = this.object._rescaleDimensions(update, 0, 0);
        this.object.document.update(update, { diff: false });
    }

    _endDrag() {
        this._dragging = false;
        this._originalData = null;
        this._insertedIndex = null;
        if (this.object._activeEditHandle === this) this.object._activeEditHandle = null;
        if (!this.destroyed) {
            this._hover = false;
            this.refresh();
        }
    }

    _cancelDrag() {
        if (!this._dragging || !this._originalData) return;
        const originalData = this._originalData;
        this._endDrag();
        this.object.document.updateSource(shapeUpdateFrom(originalData));
        this.object.renderFlags.set({ refreshShape: true });
    }

    refresh() {
        if (this.destroyed) return;

        const document = this.object.document;
        const points = document.shape.points;
        const i = this.index * 2;

        if (i >= points.length || (i === 0 && document.fillType === CONST.DRAWING_FILL_TYPES.NONE)) {
            this.visible = false;
            return;
        }

        const j = (i + points.length - 2) % points.length;
        const ax = points[j];
        const ay = points[j + 1];
        const bx = points[i];
        const by = points[i + 1];

        let lw = 2;
        if (canvas.dimensions.size > 150) lw = 4;
        else if (canvas.dimensions.size > 100) lw = 3;

        const cx = (ax + bx) / 2;
        const cy = (ay + by) / 2;
        const w = Math.hypot(ax - bx, ay - by);
        const h = lw * (this._hover ? 4 / 3 : 1) * 2;

        this.clear();
        if (_PIXI_FLUENT_FILL) {
            (this.rect ?? this.drawRect).call(this, -w / 2, -h / 2, w, h)
                .fill({ color: 0xFFFFFF, alpha: 1.0 });
            if (this.index === 0) {
                const dashLen = lw * 1.618;
                const gapLen = lw;
                drawEdgeDashes(this, -w / 2, -h / 2, w / 2, -h / 2, dashLen, gapLen, lw);
                drawEdgeDashes(this, -w / 2, +h / 2, w / 2, +h / 2, dashLen, gapLen, lw);
            } else {
                this.moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2)
                    .moveTo(-w / 2, +h / 2).lineTo(w / 2, +h / 2)
                    .stroke({ width: lw, color: 0x000000, alpha: 1.0 });
            }
        } else if (_PIXI_LEGACY_FILL) {
            this.lineStyle(0).beginFill(0xFFFFFF, 1.0);
            (this.rect ?? this.drawRect).call(this, -w / 2, -h / 2, w, h);
            this.endFill();
            if (this.index === 0) {
                const dashLen = lw * 1.618;
                const gapLen = lw;
                drawEdgeDashes(this, -w / 2, -h / 2, w / 2, -h / 2, dashLen, gapLen, lw);
                drawEdgeDashes(this, -w / 2, +h / 2, w / 2, +h / 2, dashLen, gapLen, lw);
            } else {
                this.lineStyle(lw, 0x000000, 1.0);
                this.moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2);
                this.moveTo(-w / 2, +h / 2).lineTo(w / 2, +h / 2);
            }
        }

        this.position.set(cx, cy);
        this.rotation = Math.atan2(by - ay, bx - ax);
        this.visible = true;
        this.hitArea = new PIXI.Rectangle(-w / 2 - lw / 2, -h / 2 - lw / 2, w + lw, h + lw);
    }
}

function drawEdgeDashes(g, x1, y1, x2, y2, dash, gap, lineWidth) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len === 0) return;
    const dx = (x2 - x1) / len;
    const dy = (y2 - y1) / len;

    // In legacy mode the line style must be set before the path operations.
    if (_PIXI_LEGACY_FILL) g.lineStyle(lineWidth, 0x000000, 1.0);

    let pos = 0;
    let drawing = true;

    while (pos < len - 0.001) {
        const step = Math.min(drawing ? dash : gap, len - pos);
        if (drawing) {
            const sx = x1 + dx * pos;
            const sy = y1 + dy * pos;
            const ex = x1 + dx * (pos + step);
            const ey = y1 + dy * (pos + step);
            g.moveTo(sx, sy).lineTo(ex, ey);
        }
        pos += step;
        drawing = !drawing;
    }

    // In fluent mode the path must be explicitly stroked; legacy renders automatically.
    if (_PIXI_FLUENT_FILL) g.stroke({ width: lineWidth, color: 0x000000, alpha: 1.0 });
}
