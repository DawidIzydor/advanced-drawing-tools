import { MODULE_ID } from "./const.js";
import { calculateValue } from "./utils.js";

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
        const texture = drawing.texture;
        const fs = document.getFlag(MODULE_ID, "fillStyle");

        if (texture && fs) {
            const transform = fs?.transform;
            let scaleW = calculateValue(fs?.texture?.width, document.shape.width) / texture.width;
            let scaleH = calculateValue(fs?.texture?.height, document.shape.height) / texture.height;

            [scaleW, scaleH] = [scaleW || scaleH || 1, scaleH || scaleW || 1];

            const width = scaleW * texture.width;
            const height = scaleH * texture.height;

            const matrix = new PIXI.Matrix().setTransform(
                calculateValue(transform?.position?.x, width) ?? 0,
                calculateValue(transform?.position?.y, height) ?? 0,
                calculateValue(transform?.pivot?.x, width) ?? 0,
                calculateValue(transform?.pivot?.y, height) ?? 0,
                transform?.scale?.x ?? 1,
                transform?.scale?.y ?? 1,
                (transform?.rotation ?? 0) / 180 * Math.PI,
                (transform?.skew?.x ?? 0) / 180 * Math.PI,
                (transform?.skew?.y ?? 0) / 180 * Math.PI
            ).append(new PIXI.Matrix(scaleW, 0, 0, scaleH));

            // v14: TilingSprite is used for pattern fills; apply transform if available
            const fillSprite = drawing.fill ?? drawing.mesh;
            if (fillSprite?.tileTransform) {
                fillSprite.tileTransform.setFromMatrix(matrix);
            }
        }
    }
});

function drawDashedPolygon(g, points, dash, gap, lineWidth, color, alpha, closed) {
    const n = points.length / 2;
    const segs = closed ? n : n - 1;

    let dashRemain = dash;
    let isDash = true;

    for (let i = 0; i < segs; i++) {
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

    g.stroke({ width: lineWidth, color, alpha });
}
