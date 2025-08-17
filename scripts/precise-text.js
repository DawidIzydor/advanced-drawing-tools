foundry.canvas.containers.PreciseText.prototype._quality = 1;

Object.defineProperties(foundry.canvas.containers.PreciseText.prototype, {
    resolution: {
        get() {
            return this._resolution;
        },
        set(value) { }
    },
    quality: {
        get() {
            return this._quality;
        },
        set(value) {
            if (this._quality !== value) {
                this._quality = value;
                this.dirty = true;
            }
        }
    }
});

foundry.canvas.containers.PreciseText.prototype.updateText = function (respectDirty) {
    const style = this._style;

    if (!respectDirty || this.dirty || this.localStyleID !== style.styleID) {
        const measured = PIXI.TextMetrics.measureText(this._text || " ", style, style.wordWrap, this.canvas);
        const lineHeight = (style.lineHeight === "normal" || style.lineHeight === null) ? style.fontSize * 1.2 : style.lineHeight;
        const size = Math.ceil(Math.max(measured.width, measured.height, lineHeight ?? 1, 1) + style.padding * 2);
        const maxSize = foundry.canvas.containers.PreciseText._MAX_TEXTURE_SIZE ?? 4096;
        const maxZoom = foundry.canvas.containers.PreciseText._MAX_ZOOM ?? 3;
        const maxResolution = foundry.canvas.containers.PreciseText._MAX_RESOLUTION ?? 2;

        this._resolution = Math.min(Math.max((maxSize / 2 - 1) / size, Math.min((maxSize - 1) / size, 2)), maxZoom) * this._quality;
        this._resolution *= Math.min((maxSize - 1) / Math.ceil(size * this._resolution), 1);
        this._resolution = Math.min(this._resolution, maxResolution);
    }

    PIXI.Text.prototype.updateText.call(this, respectDirty);
};