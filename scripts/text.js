import { MODULE_ID } from "./const.js";
import { WarpedText } from "./warped-text.js";
import { calculateValue } from "./utils.js";
import { hexToRgba } from "./utils.js";

Hooks.on("refreshDrawing", drawing => {
    const text = drawing.text;

    if (!text) {
        if (drawing._warpedText) {
            if (!drawing._warpedText.destroyed) {
                drawing._warpedText.destroy();
            }

            drawing._warpedText = null;
        }

        return;
    }

    const document = drawing.document;
    const ts = document.getFlag(MODULE_ID, "textStyle");

    Object.assign(text.style, {
        align: ts?.align || "left",
        dropShadow: ts?.dropShadow ?? true,
        dropShadowAlpha: ts?.dropShadowAlpha ?? 1,
        dropShadowAngle: (ts?.dropShadowAngle ?? 0) / 180 * Math.PI,
        dropShadowBlur: ts?.dropShadowBlur ?? Math.max(Math.round(document.fontSize / 16), 2),
        dropShadowColor: ts?.dropShadowColor || "#000000",
        dropShadowDistance: ts?.dropShadowDistance ?? 0,
        fill: ts?.fill?.length ? [document.textColor || "#ffffff"].concat(ts.fill.map(c => c || "#ffffff")) : document.textColor || "#ffffff",
        fillGradientStops: ts?.fillGradientStops ?? [],
        fillGradientType: ts?.fillGradientType ?? PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
        fontStyle: ts?.fontStyle || "normal",
        fontVariant: ts?.fontVariant || "normal",
        fontWeight: ts?.fontWeight || "normal",
        leading: ts?.leading ?? 0,
        letterSpacing: ts?.letterSpacing ?? 0,
        lineHeight: ts?.lineHeight ?? Math.round((ts?.fontSize ?? document.fontSize ?? 16) * 1.2),
        lineJoin: "round",
        stroke: hexToRgba(ts?.stroke || (Color.from(document.textColor || "#ffffff").hsv[2] > 0.6 ? "#000000" : "#FFFFFF"), ts?.strokeOpacity ?? 1),
        strokeThickness: ts?.strokeThickness ?? Math.max(Math.round(document.fontSize / 32), 2),
        wordWrapWidth: calculateValue(ts?.wordWrapWidth, document.shape.width) ?? document.shape.width
    });

    if (ts?.align === "left" || ts?.align === "justify") {
        text.position.set(0, document.shape.height / 2);
        text.anchor.set(0, 0.5);
    } else if (ts?.align === "right") {
        text.anchor.set(1, 0.5);
        text.position.set(document.shape.width, document.shape.height / 2);
    } else {
        text.anchor.set(0.5, 0.5);
        text.position.set(document.shape.width / 2, document.shape.height / 2);
    }
    

    const arc = Math.clamp(ts?.arc ? ts.arc / 180 * Math.PI : 0, -2 * Math.PI, +2 * Math.PI);

    if (arc !== 0) {
        if (drawing._warpedText?.destroyed) {
            drawing._warpedText = null;
        }

        if (!drawing._warpedText) {
            drawing._warpedText = drawing.addChildAt(new WarpedText(drawing.text), drawing.text.parent.getChildIndex(drawing.text) + 1);
        }

        drawing._warpedText.alpha = document.hidden ? Math.min(0.5, document.textAlpha ?? 1) : (document.textAlpha ?? 1);
        drawing._warpedText.pivot.set(drawing.text.width / 2, drawing.text.height / 2);
        drawing._warpedText.position.set(document.shape.width / 2, document.shape.height / 2);
        drawing._warpedText.angle = document.rotation;
        drawing._warpedText.arc = arc;

        drawing.text.renderable = false;
    } else if (drawing._warpedText) {
        if (!drawing._warpedText.destroyed) {
            drawing._warpedText.destroy();
        }

        drawing._warpedText = null;
        drawing.text.renderable = true;
    }else{
        drawing.text.renderable = true;
    }
});
