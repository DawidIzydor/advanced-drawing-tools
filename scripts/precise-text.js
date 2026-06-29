const PreciseText = foundry.canvas.containers?.PreciseText;
if (!PreciseText) {
    console.warn("Advanced Drawing Tools: PreciseText not found, skipping text resolution overrides");
} else {
    PreciseText.prototype._quality = 1;

    Object.defineProperties(PreciseText.prototype, {
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
                    // Pixi v8: 'dirty' may not exist; use _styleDirty or just mark text dirty
                    if (typeof this.dirty !== "undefined") this.dirty = true;
                }
            }
        }
    });

    PreciseText.prototype.updateText = function (respectDirty) {
        const style = this._style;

        // Pixi v8: localStyleID/styleID may not exist; fall back to always recomputing
        const isDirty = typeof this.dirty !== "undefined" ? this.dirty : true;
        const styleChanged = (typeof this.localStyleID !== "undefined" && typeof style?.styleID !== "undefined")
            ? this.localStyleID !== style.styleID
            : true;

        if (!respectDirty || isDirty || styleChanged) {
            const measured = PIXI.TextMetrics.measureText(this._text || " ", style, style.wordWrap, this.canvas);
            const lineHeight = (style.lineHeight === "normal" || style.lineHeight === null) ? style.fontSize * 1.2 : style.lineHeight;
            const size = Math.ceil(Math.max(measured.width, measured.height, lineHeight ?? 1, 1) + style.padding * 2);
            const maxSize = PreciseText._MAX_TEXTURE_SIZE ?? 4096;
            const maxZoom = PreciseText._MAX_ZOOM ?? 3;
            const maxResolution = PreciseText._MAX_RESOLUTION ?? 2;

            this._resolution = Math.min(Math.max((maxSize / 2 - 1) / size, Math.min((maxSize - 1) / size, 2)), maxZoom) * this._quality;
            this._resolution *= Math.min((maxSize - 1) / Math.ceil(size * this._resolution), 1);
            this._resolution = Math.min(this._resolution, maxResolution);
        }

        try {
            PIXI.Text.prototype.updateText.call(this, respectDirty);
        } catch (err) {
            console.warn("Advanced Drawing Tools: PreciseText.updateText failed, falling back", err);
        }
    };
}
