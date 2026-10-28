import { DEFAULT_FLAGS, MODULE_ID } from "./const.js";
import { calculateValue, parseValue } from "./utils.js";

const FILL_STYLE_PREFIX = `flags.${MODULE_ID}.fillStyle.`;

// Version of the fillStyle flag semantics, stored on every new drawing. Flags without a
// version are version 1: in v13 (Pixi v7) the matrix was written straight into the
// already-inverted graphicsData fill matrix, so it mapped drawing pixels to texture pixels
// and every transform field worked backwards. Version 2 maps texture pixels to drawing pixels.
export const FILL_STYLE_VERSION = DEFAULT_FLAGS[`${FILL_STYLE_PREFIX}version`];

const TRANSFORM_KEYS = Object.keys(DEFAULT_FLAGS)
    .filter(key => key.startsWith(FILL_STYLE_PREFIX) && key !== `${FILL_STYLE_PREFIX}version`)
    .map(key => key.slice(FILL_STYLE_PREFIX.length));

/**
 * Whether the fill style flags contain any non-default texture size or transform value.
 * @param {object} fs - The `fillStyle` flag data.
 * @returns {boolean}
 */
export function hasFillTransform(fs) {
    return TRANSFORM_KEYS.some(key => {
        const value = foundry.utils.getProperty(fs ?? {}, key);
        return value != null && value !== DEFAULT_FLAGS[FILL_STYLE_PREFIX + key];
    });
}

/**
 * Whether the fill style flags still use the v13 (version 1) semantics.
 * @param {object} fs - The `fillStyle` flag data.
 * @returns {boolean}
 */
export function isLegacyFillStyle(fs) {
    return (fs?.version ?? 1) < FILL_STYLE_VERSION && hasFillTransform(fs);
}

/**
 * Build the matrix that maps texture pixels to shape-local pixels for a pattern fill.
 * @param {object} fs - The `fillStyle` flag data.
 * @param {{width: number, height: number}} texture - The fill texture.
 * @param {{width: number, height: number}} shape - The drawing's shape data.
 * @returns {PIXI.Matrix}
 */
export function getFillMatrix(fs, texture, shape) {
    const transform = fs?.transform;
    let scaleW = calculateValue(fs?.texture?.width, shape.width) / texture.width;
    let scaleH = calculateValue(fs?.texture?.height, shape.height) / texture.height;

    [scaleW, scaleH] = [scaleW || scaleH || 1, scaleH || scaleW || 1];

    const width = scaleW * texture.width;
    const height = scaleH * texture.height;

    return new PIXI.Matrix().setTransform(
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
}

/**
 * Build the texture → shape-local matrix for the fill style, honouring legacy (v13) flags.
 * @param {object} fs - The `fillStyle` flag data.
 * @param {{width: number, height: number}} texture - The fill texture.
 * @param {{width: number, height: number}} shape - The drawing's shape data.
 * @returns {PIXI.Matrix}
 */
export function getFillStyleMatrix(fs, texture, shape) {
    const matrix = getFillMatrix(fs, texture, shape);
    return isLegacyFillStyle(fs) ? matrix.invert() : matrix;
}

/**
 * Convert legacy (v13) fill style flags into current flags that render identically.
 * The texture size absorbs the scale, the pivot becomes zero, and a skew X is used
 * where rotation and non-uniform scale cannot express the inverse transform on their own.
 * Percentage texture sizes stay percentages; position and pivot become pixels.
 * @param {object} fs - The legacy `fillStyle` flag data.
 * @param {{width: number, height: number}} texture - The fill texture.
 * @param {{width: number, height: number}} shape - The drawing's shape data.
 * @returns {object|null} The complete migrated `fillStyle` data, or null if it cannot be migrated.
 */
export function migrateFillStyle(fs, texture, shape) {
    const m = getFillMatrix(fs, texture, shape).invert();

    if (![m.a, m.b, m.c, m.d, m.tx, m.ty].every(Number.isFinite)) {
        return null;
    }

    // Decompose the linear part as rotation · skewX · scale (skew Y = 0); a negative
    // determinant means the texture is mirrored, which is kept in the sign of scale Y.
    const sign = Math.sign(m.a * m.d - m.b * m.c);

    if (!sign) {
        return null;
    }

    const rotation = Math.atan2(m.b, m.a);
    const scaleX = Math.hypot(m.a, m.b);
    const scaleY = Math.hypot(m.c, m.d);
    const skewX = rotation - Math.atan2(-m.c * sign, m.d * sign);

    let width = null;
    let height = null;

    if (Math.abs(scaleX - 1) > 1e-6 || Math.abs(scaleY - 1) > 1e-6) {
        width = scaleX * texture.width;
        height = scaleY * texture.height;

        const isPercent = [fs?.texture?.width, fs?.texture?.height].some(v => parseValue(v)?.unit === "%");

        if (isPercent && shape.width && shape.height) {
            width = `${round(width / shape.width * 100)}%`;
            height = `${round(height / shape.height * 100)}%`;
        } else {
            width = round(width);
            height = round(height);
        }
    }

    return {
        version: FILL_STYLE_VERSION,
        texture: { width, height },
        transform: {
            position: { x: round(m.tx), y: round(m.ty) },
            pivot: { x: 0, y: 0 },
            scale: { x: 1, y: sign },
            rotation: toDegrees(rotation),
            skew: { x: toDegrees(skewX), y: 0 }
        }
    };
}

function round(value) {
    return Math.round(value * 1e4) / 1e4 || 0;
}

function toDegrees(radians) {
    let degrees = radians / Math.PI * 180 % 360;

    if (degrees > 180) {
        degrees -= 360;
    } else if (degrees <= -180) {
        degrees += 360;
    }

    return round(degrees);
}
