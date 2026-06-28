import { MODULE_ID } from "./const.js";
import { calculateValue } from "./utils.js";
import { _PIXI_FLUENT_FILL, _PIXI_LEGACY_FILL } from "./edit-mode.js";

Hooks.on("refreshDrawing", drawing => {
    if (drawing.shape?.destroyed) {
        return;
    }

    const document = drawing.document;

    if (document.getFlag(MODULE_ID, "invisible") && !(drawing.layer.active && (game.user.isGM || game.user === document.author))) {
        drawing.visible = false;
        drawing.shape.visible = false;
    }

    const ls = document.getFlag(MODULE_ID, "lineStyle");
    const hasDash = ls?.dash?.[0] && ls?.dash?.[1] && document.strokeWidth && document.shape.type === "p";

    if (hasDash) {
        if (!drawing._dashOverlay || drawing._dashOverlay.destroyed) {
            drawing._dashOverlay = drawing.addChild(new PIXI.Graphics());
        }

        const overlay = drawing._dashOverlay;
        overlay.clear();

        const points = document.shape.points;
        if (points && points.length >= 4) {
            drawDashedPolygon(
                overlay,
                points,
                ls.dash[0],
                ls.dash[1],
                document.strokeWidth,
                document.strokeColor ?? 0x000000,
                document.strokeAlpha ?? 1,
                document.fillType !== CONST.DRAWING_FILL_TYPES.NONE
            );
        }
    } else {
        if (drawing._dashOverlay && !drawing._dashOverlay.destroyed) {
            drawing._dashOverlay.destroy();
        }
        drawing._dashOverlay = null;
    }

    if (document.fillType === CONST.DRAWING_FILL_TYPES.PATTERN) {
        const fillSprite = drawing.fill ?? drawing.mesh;
        if (fillSprite) {
            // drawing.texture may be null in v14; fall back to the sprite's own texture.
            const texture = drawing.texture ?? fillSprite.texture;
            const fs = document.getFlag(MODULE_ID, "fillStyle");
            const transform = fs?.transform;

            // Compute the tile scale from the desired pixel/percent size.
            // Default to 1:1 (natural texture size = repeating pattern) so the module
            // always overrides whatever Foundry set — in v14 the base code may stretch
            // the texture to fill the shape, making the pattern look solid.
            let scaleW = 1;
            let scaleH = 1;
            if (texture && fs?.texture) {
                scaleW = calculateValue(fs.texture.width,  document.shape.width)  / texture.width;
                scaleH = calculateValue(fs.texture.height, document.shape.height) / texture.height;
                scaleW = scaleW || scaleH || 1;
                scaleH = scaleH || scaleW || 1;
            }

            const tileW = scaleW * (texture?.width  ?? 1);
            const tileH = scaleH * (texture?.height ?? 1);

            const posX      = calculateValue(transform?.position?.x, tileW) ?? 0;
            const posY      = calculateValue(transform?.position?.y, tileH) ?? 0;
            const pivX      = calculateValue(transform?.pivot?.x,    tileW) ?? 0;
            const pivY      = calculateValue(transform?.pivot?.y,    tileH) ?? 0;
            const userScaleX = transform?.scale?.x ?? 1;
            const userScaleY = transform?.scale?.y ?? 1;
            const rot       = (transform?.rotation ?? 0) / 180 * Math.PI;
            const skewX     = (transform?.skew?.x ?? 0) / 180 * Math.PI;
            const skewY     = (transform?.skew?.y ?? 0) / 180 * Math.PI;

            if (typeof fillSprite.tileTransform?.setFromMatrix === "function") {
                // PixiJS v7: apply full matrix via tileTransform
                const matrix = new PIXI.Matrix()
                    .setTransform(posX, posY, pivX, pivY, userScaleX, userScaleY, rot, skewX, skewY)
                    .append(new PIXI.Matrix(scaleW, 0, 0, scaleH));
                fillSprite.tileTransform.setFromMatrix(matrix);
            } else {
                // PixiJS v8: tileTransform.setFromMatrix was removed; apply individual tile properties.
                // Pivot is approximated as a simple translation offset (skew is not supported here).
                if (fillSprite.tileScale) fillSprite.tileScale.set(scaleW * userScaleX, scaleH * userScaleY);
                if (fillSprite.tilePosition) fillSprite.tilePosition.set(posX - pivX, posY - pivY);
                if ("tileRotation" in fillSprite) fillSprite.tileRotation = rot;
            }
        }
    }
});

function drawDashedPolygon(g, points, dash, gap, lineWidth, color, alpha, closed) {
    const n = points.length / 2;
    const segmentCount = closed ? n : n - 1;

    if (_PIXI_LEGACY_FILL) g.lineStyle(lineWidth, color, alpha);

    let dashRemain = dash;
    let isDash = true;

    for (let i = 0; i < segmentCount; i++) {
        const ax = points[i * 2];
        const ay = points[i * 2 + 1];
        const bx = points[((i + 1) % n) * 2];
        const by = points[((i + 1) % n) * 2 + 1];

        const segLen = Math.hypot(bx - ax, by - ay);
        if (segLen === 0) continue;

        const dx = (bx - ax) / segLen;
        const dy = (by - ay) / segLen;
        let pos = 0;

        while (pos < segLen - 0.001) {
            const step = Math.min(dashRemain, segLen - pos);

            if (isDash) {
                const sx = ax + dx * pos;
                const sy = ay + dy * pos;
                const ex = ax + dx * (pos + step);
                const ey = ay + dy * (pos + step);
                g.moveTo(sx, sy).lineTo(ex, ey);
            }

            pos += step;
            dashRemain -= step;

            if (dashRemain <= 0.001) {
                isDash = !isDash;
                dashRemain = isDash ? dash : gap;
            }
        }
    }

    if (_PIXI_FLUENT_FILL) g.stroke({ width: lineWidth, color, alpha });
}
