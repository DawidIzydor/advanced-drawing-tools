import { DEFAULT_FLAGS, MODULE_ID, PERSISTENT_FLAGS } from "./const.js";

function isModuleFlag(key) {
    return key.startsWith(`flags.${MODULE_ID}.`);
}

export function parseValue(value) {
    if (value == null) {
        return null;
    }

    let unit;

    if (typeof value === "string") {
        value = value.match(/^\s*([+-]?\d*\.?\d+)\s*(px|%)?\s*$/i);

        if (!value) {
            return null;
        }

        unit = value[2] || "px";
        value = parseFloat(value[1]);
    } else if (typeof value === "number") {
        unit = "px";
    }

    if (value == null || unit == null) {
        return null;
    }

    return { value, unit };
}

export function calculateValue(value, base) {
    value = parseValue(value);

    if (!value) {
        return null;
    }

    if (value.unit === "%") {
        return base * (value.value / 100);
    }

    return value.value;
}

export function hexToRgba(hex, opacity = 1) {
    let c = hex.replace(/^#/, "");

    if (c.length === 3) {
        c = c.split("").map(ch => ch + ch).join("");
    }

    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;

    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function stringifyValue(value) {
    value = parseValue(value);

    if (!value) {
        return null;
    }

    if (value.unit === "%") {
        return `${value.value}%`;
    }

    return `${value.value}px`;
}

export function saveValue(value) {
    value = parseValue(value);

    if (!value) {
        return null;
    }

    // Percent values are stored as strings ("50%"); plain pixel values are stored as numbers.
    if (value.unit === "%") {
        return `${value.value}%`;
    }

    return value.value;
}

// Normalize a single flag value to a consistent type for storage.
// Strings are lowercased and trimmed; values that look like CSS lengths are saved via saveValue.
function normalizeFlag(value, defaultValue) {
    value = value ?? null;

    if (parseValue(defaultValue)) {
        value = saveValue(value);
    } else if (typeof value === "string") {
        value = value ? value.trim().toLowerCase() : null;
    }

    return value;
}

export function cleanData(data, { inplace = false, deletionKeys = false, keepOthers = true, partial = false }) {
    const flatData = foundry.utils.flattenObject(data);
    let newData = {};

    // Phase 1: Seed deletion keys so Foundry will remove any flag that is not explicitly re-set below.
    // In a partial update we only delete paths present in the incoming data, not every known default flag.
    if (deletionKeys || inplace) {
        const keysToErase = (partial ? [] : Object.keys(DEFAULT_FLAGS)).concat(Object.keys(flatData));

        for (const key of keysToErase) {
            if (!isModuleFlag(key)) continue;

            const pathParts = key.split(".");
            // For partial updates only add the leaf's immediate parent deletion key;
            // for full updates add a deletion key at every ancestor level.
            const startDepth = partial ? pathParts.length - 1 : 1;

            for (let i = startDepth; i < pathParts.length; i++) {
                newData[pathParts.slice(0, i + 1).join(".")] = new foundry.data.operators.ForcedDeletion();
            }
        }
    }

    // Full (non-partial) data is a new document: give it the persistent flags it lacks.
    // Partial updates of existing documents don't get them.
    if (!partial) {
        for (const key of PERSISTENT_FLAGS) {
            flatData[key] ??= DEFAULT_FLAGS[key];
        }
    }

    // Phase 2: Normalize each flag value and copy it into newData.
    // When a non-default value is stored, remove its ancestor deletion keys so Foundry
    // does not accidentally delete the parent object that now contains the value.
    for (let [key, value] of Object.entries(flatData)) {
        if (!isModuleFlag(key)) {
            if (keepOthers && !inplace) newData[key] = value;
            continue;
        }

        if (!(key in DEFAULT_FLAGS)) continue;

        const defaultValue = DEFAULT_FLAGS[key];

        if (Array.isArray(value)) {
            value = value.map(item => normalizeFlag(item, defaultValue));
        } else {
            value = normalizeFlag(value, defaultValue);
        }

        const hasValue = value != null;
        const isDefaultValue = !hasValue || value === defaultValue || value.equals?.(defaultValue);
        const isPersistent = hasValue && PERSISTENT_FLAGS.includes(key);

        if (!isDefaultValue || isPersistent) {
            newData[key] = value;

            // Cancel the ForcedDeletion entries for this path — the value is being set, not erased.
            // The leaf's own entry was already overwritten by the value, so stop at its parent.
            if (deletionKeys || inplace) {
                const pathParts = key.split(".");
                for (let i = 1; i < pathParts.length - 1; i++) {
                    delete newData[pathParts.slice(0, i + 1).join(".")];
                }
            }
        } else if (!deletionKeys) {
            // Not using deletion-key mode: write the default explicitly so the consumer
            // always receives a complete, predictable data set.
            newData[key] = foundry.utils.deepClone(defaultValue);
        }
    }

    // Phase 3: Remove child entries made redundant by a parent ForcedDeletion.
    // e.g. if "fillStyle" is ForcedDeletion there is no need to also carry "fillStyle.texture.width".
    if (deletionKeys || inplace) {
        for (const key in newData) {
            if (!(newData[key] instanceof foundry.data.operators.ForcedDeletion)) continue;
            if (!key.startsWith(`flags.${MODULE_ID}`)) continue;
            const childPrefix = `${key}.`;
            for (const otherKey in newData) {
                if (otherKey.startsWith(childPrefix)) delete newData[otherKey];
            }
        }
    }

    // Phase 4: Expand the flat key map back to a nested object.
    // Sorting longer keys first ensures children are processed before parents during expansion.
    newData = foundry.utils.expandObject(
        Object.fromEntries(Object.entries(newData).sort((a, b) => b[0].length - a[0].length))
    );

    if (!inplace) {
        return newData;
    }

    // Merge the cleaned flags into the data.
    // Without applyOperators, a ForcedDeletion replaces the value it targets, so the deletion is kept for Foundry.
    // `mergeObject` only drops one for a key the data doesn't have, and there is nothing to delete then.
    // The previous version first merged with applyOperators, which removed those keys and so lost the deletions.
    foundry.utils.mergeObject(data, newData, { applyOperators: !deletionKeys });

    if (!keepOthers) {
        foundry.utils.filterObject(data, foundry.utils.expandObject(DEFAULT_FLAGS));
    }

    return data;
}

