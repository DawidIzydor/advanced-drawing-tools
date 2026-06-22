import { MODULE_ID } from "./const.js";

Hooks.on("refreshDrawing", drawing => {
    drawing._refreshEditMode();
});

Hooks.once("libWrapper.Ready", () => {
    const getInteractionData = foundry.utils.isNewerVersion(game.version, 11)
        ? (event) => event.interactionData
        : (event) => event.data;
    const getOriginalData = foundry.utils.isNewerVersion(game.version, 11)
        ? (drawing, event) => event.interactionData.originalData
        : (drawing, event) => drawing._original;
    const setOriginalData = foundry.utils.isNewerVersion(game.version, 11)
        ? (drawing, event) => event.interactionData.originalData = drawing.document.toObject()
        : (drawing, event) => drawing._original = drawing.document.toObject();
    const setRestoreOriginalData = foundry.utils.isNewerVersion(game.version, 11)
        ? (drawing, event, value) => event.interactionData.restoreOriginalData = value
        : (drawing, event, value) => { };
    const refreshSize = foundry.utils.isNewerVersion(game.version, 12)
        ? (drawing) => drawing.renderFlags.set({ refreshSize: true })
        : foundry.utils.isNewerVersion(game.version, 11)
            ? (drawing) => drawing.renderFlags.set({ refreshShape: true })
            : (drawing) => drawing.refresh();
    const isDraggingHandle = foundry.utils.isNewerVersion(game.version, 12)
        ? (drawing, event) => event.interactionData.dragHandle
        : (drawing, event) => drawing._dragHandle;

    const tryRegister = (path, fn, type) => {
        try {
            libWrapper.register(MODULE_ID, path, fn, type);
        } catch(e) {
            console.warn(`${MODULE_ID} | libWrapper registration failed for '${path}' (v14 API change?):`, e.message);
        }
    };

    tryRegister(`foundry.canvas.placeables.Drawing.prototype.activateListeners`, function (wrapped, ...args) {
        wrapped(...args);
        // frame.handle may not exist on all Drawing types
        if (this.frame?.handle) {
            this.frame.handle.off("pointerup").on("pointerup", this._onHandleMouseUp.bind(this));
        }
    }, libWrapper.WRAPPER);

    // _onHandleHoverIn/Out and _onHandleDragStart were removed in v14.
    // Hover is now handled by inline PIXI event listeners in _refreshEditMode.
    // _onHandleDragStart logic moved into _onClickLeft below.

    tryRegister(`foundry.canvas.placeables.Drawing.prototype._onDragLeftStart`, function (wrapped, event) {
        if (!isDraggingHandle(this, event)) {
            return wrapped(event);
        }

        setOriginalData(this, event);

        let { handle, destination } = getInteractionData(event);

        if (this._editHandle) {
            handle = this._editHandle;
        }

        let update;

        if (handle instanceof EdgeHandle) {
            const point = new PIXI.Point(destination.x, destination.y);
            const matrix = new PIXI.Matrix();
            const { x, y, rotation, shape: { width, height, points } } = this.document;

            matrix.translate(-width / 2, -height / 2);
            matrix.rotate(Math.toRadians(rotation || 0));
            matrix.translate(x + width / 2, y + height / 2);
            matrix.applyInverse(point, point);

            update = { x, y, shape: { width, height, points: Array.from(points) } };
            update.shape.points.splice(handle.index * 2, 0, point.x, point.y);
        } else if (!(handle instanceof PointHandle)) {
            // Not our custom handle (resize handle or other) — let original handle it
            return wrapped(event);
        }

        if (update) {
            this.document.updateSource(update);
            refreshSize(this);
        }
    }, libWrapper.MIXED);

    // v14: _onHandleDragMove was removed; handle custom edit-handle drag via _onDragLeftMove MIXED
    tryRegister(`foundry.canvas.placeables.Drawing.prototype._onDragLeftMove`, function (wrapped, event) {
        const handle = this._editHandle ?? getInteractionData(event)?.handle;

        if (!(handle instanceof PointHandle) && !(handle instanceof EdgeHandle)) {
            return wrapped(event);
        }

        const interactionData = getInteractionData(event);
        let destination = interactionData?.destination;
        const originalEvent = event.nativeEvent ?? event.data?.originalEvent;

        if (!originalEvent?.shiftKey) {
            destination = this.layer.getSnappedPoint(destination);
        }

        canvas._onDragCanvasPan(originalEvent);

        const matrix = new PIXI.Matrix();
        const point = new PIXI.Point(destination.x, destination.y);
        const { x, y, rotation, shape: { width, height, points } } = getOriginalData(this, event);

        matrix.translate(-width / 2, -height / 2);
        matrix.rotate(Math.toRadians(rotation || 0));
        matrix.translate(x + width / 2, y + height / 2);
        matrix.applyInverse(point, point);

        const update = { x, y, shape: { width, height, points: Array.from(points) } };

        if (handle instanceof EdgeHandle) {
            update.shape.points.splice(handle.index * 2, 0, point.x, point.y);
        } else {
            update.shape.points[handle.index * 2] = point.x;
            update.shape.points[handle.index * 2 + 1] = point.y;
        }

        try {
            this.document.updateSource(update);
            refreshSize(this);
        } catch (err) { }
    }, libWrapper.MIXED);

    // v14: _onHandleDragDrop was removed; handle custom edit-handle drop via _onDragLeftDrop MIXED
    tryRegister(`foundry.canvas.placeables.Drawing.prototype._onDragLeftDrop`, function (wrapped, event) {
        const handle = this._editHandle ?? getInteractionData(event)?.handle;

        if (!(handle instanceof PointHandle) && !(handle instanceof EdgeHandle)) {
            return wrapped(event);
        }

        const interactionData = getInteractionData(event);
        let destination = interactionData?.destination;
        const originalEvent = event.nativeEvent ?? event.data?.originalEvent;

        setRestoreOriginalData(this, event, false);

        if (!originalEvent?.shiftKey) {
            destination = this.layer.getSnappedPoint(destination);
        }

        this._dragHandle = false;
        handle._hover = false;
        handle.refresh();
        this._editHandle = null;
        this._hoveredEditHandle = null;

        const matrix = new PIXI.Matrix();
        const point = new PIXI.Point(destination.x, destination.y);
        const { x, y, rotation, shape: { width, height, points } } = getOriginalData(this, event);

        matrix.translate(-width / 2, -height / 2);
        matrix.rotate(Math.toRadians(rotation || 0));
        matrix.translate(x + width / 2, y + height / 2);
        matrix.applyInverse(point, point);

        let update = { x, y, shape: { width, height, points: Array.from(points) } };

        if (handle instanceof EdgeHandle) {
            update.shape.points.splice(handle.index * 2, 0, point.x, point.y);
        } else {
            update.shape.points[handle.index * 2] = point.x;
            update.shape.points[handle.index * 2 + 1] = point.y;
        }

        update = (() => foundry.canvas?.placeables?.Drawing)().rescaleDimensions(update, 0, 0);

        return this.document.update(update, { diff: false });
    }, libWrapper.MIXED);

    if (foundry.utils.isNewerVersion(game.version, 12)) {
        libWrapper.register(MODULE_ID, "Drawing.prototype._onClickLeft", function (wrapped, event) {
            this._editHandle = null;

    tryRegister(`foundry.canvas.placeables.Drawing.prototype._onClickLeft`, function (wrapped, event) {
        this._editHandle = null;

        if (this._editHandles?.points.children.includes(event.target)
            || this._editHandles?.edges.children.includes(event.target)) {
            event.interactionData.dragHandle = true;
            event.stopPropagation();
            if (!this.document.locked) {
                this._dragHandle = true;
                this._editHandle = event.target;
                this._editHandle._hover = true;
                this._editHandle.refresh();
            }
            return;
        }

        return wrapped(event);
    }, libWrapper.MIXED);


    tryRegister(`foundry.canvas.placeables.Drawing.prototype._onClickRight`, function (wrapped, event) {
        // In v14 interactionData.handle is no longer populated by _onHandleHoverIn,
        // so fall back to the hovered handle tracked by _refreshEditMode's inline listener.
        let handle = getInteractionData(event)?.handle ?? this._hoveredEditHandle;

        if (this._editHandle) {
            handle = this._editHandle;
        }

        if ((handle instanceof PointHandle || handle instanceof EdgeHandle) && handle._hover) {
            event.stopPropagation();
            this._dragHandle = false;
            handle._hover = false;
            handle.refresh();
            this._editHandle = null;

            const { x, y, rotation, shape: { width, height, points } } = this.document;
            let update = { x, y, shape: { width, height, points: Array.from(points) } };

            if (handle instanceof EdgeHandle) {
                const origin = getInteractionData(event).origin;
                const matrix = new PIXI.Matrix();
                const point = new PIXI.Point(origin.x, origin.y);

                matrix.translate(-width / 2, -height / 2);
                matrix.rotate(Math.toRadians(rotation || 0));
                matrix.translate(x + width / 2, y + height / 2);
                matrix.applyInverse(point, point);

                update.shape.points[(handle.index * 2 + points.length - 2) % points.length] = point.x;
                update.shape.points[(handle.index * 2 + points.length - 1) % points.length] = point.y;
            }

            update.shape.points.splice(handle.index * 2, 2);
            update = this._rescaleDimensions(update, 0, 0);

            return this.document.update(update, { diff: false });
        }

        return wrapped(event);
    }, libWrapper.MIXED);


    (() => foundry.canvas?.placeables?.Drawing)().prototype._onHandleMouseUp = function (event) {
        if (!getOriginalData(this, event)) {
            this._dragHandle = false;
            this._editHandle = null;
            this._hoveredEditHandle = null;
        }
    };
    
});

Drawing.prototype._editMode = false;

Drawing.prototype._toggleEditMode = function (active) {
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

(() => foundry.canvas?.placeables?.Drawing)().prototype._editHandles = null;
(() => foundry.canvas?.placeables?.Drawing)().prototype._hoveredEditHandle = null;

Drawing.prototype._refreshEditMode = function () {
    const document = this.document;

    if (this._editMode && this.layer.active && !document._source.locked && document.shape.type === "p") {
        let editHandles = this._editHandles;

        if (!editHandles || editHandles.destroyed) {
            editHandles = this._editHandles = this.addChild(new PIXI.Container());
            editHandles.edges = editHandles.addChild(new PIXI.Container());
            editHandles.points = editHandles.addChild(new PIXI.Container());
        }

        const drawing = this;
        const activateListeners = (handle) => {
            handle.off("pointerover").off("pointerout")
                .on("pointerover", () => {
                    if (!drawing._dragHandle) {
                        handle._hover = true;
                        handle.refresh();
                        drawing._hoveredEditHandle = handle;
                    }
                })
                .on("pointerout", () => {
                    handle._hover = false;
                    handle.refresh();
                    if (drawing._hoveredEditHandle === handle) drawing._hoveredEditHandle = null;
                });
            handle.eventMode = "static";
        };

        const points = document.shape.points;

        for (let i = editHandles.edges.children.length; i <= points.length; i++) {
            activateListeners(editHandles.edges.addChild(new EdgeHandle(this, i)));
        }

        for (let i = editHandles.points.children.length; i <= points.length; i++) {
            activateListeners(editHandles.points.addChild(new PointHandle(this, i)));
        }

        if (editHandles.edges.children.length > points.length) {
            editHandles.edges.removeChildren(points.length).forEach(c => c.destroy({ children: true }));
        }

        if (editHandles.points.children.length > points.length) {
            editHandles.points.removeChildren(points.length).forEach(c => c.destroy({ children: true }));
        }

        editHandles.edges.children.forEach(h => h.refresh());
        editHandles.points.children.forEach(h => h.refresh());
    } else {
        this._editMode = false;

        if (this._editHandles) {
            this._editHandles.destroy({ children: true });
            this._editHandles = null;
        }
    }
}

class PointHandle extends PIXI.Graphics {
    _hover = false;

    constructor(object, index) {
        super();

        this.object = object;
        this.index = index;
        this.cursor = "pointer";
        this.eventMode = "static";
    }

    refresh() {
        if (this.destroyed) {
            return;
        }

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

        this.clear()
            .circle(0, 0, r)
            .fill({ color: 0xFFFFFF, alpha: 1.0 })
            .stroke({ width: lw, color: 0x000000, alpha: 1.0 });

        this.position.set(x, y);
        this.visible = true;
    }
}

class EdgeHandle extends PIXI.Graphics {
    _hover = false;

    constructor(object, index) {
        super();

        this.object = object;
        this.index = index;
        this.cursor = "pointer";
        this.eventMode = "static";
    }

    refresh() {
        if (this.destroyed) {
            return;
        }

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

        this.clear()
            .rect(-w / 2, -h / 2, w, h)
            .fill({ color: 0xFFFFFF, alpha: 1.0 });

        if (this.index === 0) {
            // Closing edge: draw dashed top and bottom lines
            const dashLen = lw * 1.618;
            const gapLen = lw;
            drawEdgeDashes(this, -w / 2, -h / 2, w / 2, -h / 2, dashLen, gapLen, lw);
            drawEdgeDashes(this, -w / 2, +h / 2, w / 2, +h / 2, dashLen, gapLen, lw);
        } else {
            this.moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2)
                .moveTo(-w / 2, +h / 2).lineTo(w / 2, +h / 2)
                .stroke({ width: lw, color: 0x000000, alpha: 1.0 });
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

    g.stroke({ width: lineWidth, color: 0x000000, alpha: 1.0 });
}
