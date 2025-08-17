import { MODULE_ID } from "./const.js";
import { saveValue, stringifyValue } from "./utils.js";

Hooks.once("libWrapper.Ready", () => {
    libWrapper.register(MODULE_ID, "foundry.applications.api.DocumentSheetV2.prototype._prepareSubmitData", 
        
    function (wrapped, event, form, formData, updateData) {
        // 1) Start with the prepared data from the base sheet
        const data = wrapped(event, form, formData, updateData);

        // Short return if not a Drawing
        if(this.document.documentName != "Drawing")
        {
            return data;
        }

        // ---- lineStyle.dash handling ----
        // Read the UI state from the provided form element
        const dashToggle = form?.querySelector(`input.${MODULE_ID}--lineStyle-dash`);
        
        // Ensure nested structure exists
        data.flags = data.flags || {};
        data.flags[MODULE_ID] = data.flags[MODULE_ID] || {};
        data.flags[MODULE_ID].lineStyle = data.flags[MODULE_ID].lineStyle || {};
        
        if (dashToggle?.checked) {
            // Ensure we have a 2-length numeric array; coerce strings -> numbers with sane defaults
            const a = data.flags[MODULE_ID].lineStyle.dash;
            const d0 = Array.isArray(a) ? a[0] : undefined;
            const d1 = Array.isArray(a) ? a[1] : undefined;
            data.flags[MODULE_ID].lineStyle.dash = [
            Number(d0) || 8,
            Number(d1) || 5
            ];
        } else {
            data.flags[MODULE_ID].lineStyle.dash = null;
        }

        // ---- helpers ----
        const processValue = (obj, path) => {
            const keys = path.split('.');
            let current = obj;
            for (let i = 0; i < keys.length - 1; i++) {
                current[keys[i]] = current[keys[i]] || {};
                current = current[keys[i]];
            }
            const lastKey = keys[keys.length - 1];
            current[lastKey] = saveValue(current[lastKey]);
        };

        const processStringArray = (obj, path) => {
            const keys = path.split('.');
            let current = obj;
            for (let i = 0; i < keys.length - 1; i++) {
                current[keys[i]] = current[keys[i]] || {};
                current = current[keys[i]];
            }
            const lastKey = keys[keys.length - 1];
            
            if (current[lastKey] == null) {
                current[lastKey] = [];
            } else if (!Array.isArray(current[lastKey])) {
                current[lastKey] = [current[lastKey]];
            }
            if (current[lastKey].every(v => !v)) {
                current[lastKey] = null;
            }
        };

        const processNumberArray = (obj, path) => {
            const keys = path.split('.');
            let current = obj;
            for (let i = 0; i < keys.length - 1; i++) {
                current[keys[i]] = current[keys[i]] || {};
                current = current[keys[i]];
            }
            const lastKey = keys[keys.length - 1];
            
            if (current[lastKey] == null) {
                current[lastKey] = [];
            } else if (!Array.isArray(current[lastKey])) {
                current[lastKey] = [current[lastKey]];
            }
            if (current[lastKey].every(v => v === null)) {
                current[lastKey] = null;
            }
        };

        // ---- numeric-ish values coerced through saveValue ----
        processValue(data, `flags.${MODULE_ID}.fillStyle.texture.width`);
        processValue(data, `flags.${MODULE_ID}.fillStyle.texture.height`);
        processValue(data, `flags.${MODULE_ID}.fillStyle.transform.position.x`);
        processValue(data, `flags.${MODULE_ID}.fillStyle.transform.position.y`);
        processValue(data, `flags.${MODULE_ID}.fillStyle.transform.pivot.x`);
        processValue(data, `flags.${MODULE_ID}.fillStyle.transform.pivot.y`);
        processValue(data, `flags.${MODULE_ID}.textStyle.wordWrapWidth`);

        // ---- arrays from form inputs ----
        processStringArray(data, `flags.${MODULE_ID}.textStyle.fill`);
        processNumberArray(data, `flags.${MODULE_ID}.textStyle.fillGradientStops`);

        return data;
        }, libWrapper.WRAPPER);
});

// Helper function to handle both jQuery and HTMLElement with fallback to jQuery when available
function getDOMHelper(htmlOrElement) {
    // If it's already jQuery, return it
    if (htmlOrElement?.find) return htmlOrElement;
    
    // If it's HTMLElement and jQuery is available, wrap it
    const element = htmlOrElement?.jquery ? htmlOrElement[0] : 
                   (htmlOrElement instanceof HTMLElement ? htmlOrElement : null);
    
    if (element && typeof $ !== 'undefined') {
        return $(element);
    }
    
    // Fallback: create a minimal jQuery-like interface
    return createMinimalJQuery(element);
}

function createMinimalJQuery(element) {
    if (!element) return { find: () => ({ length: 0, append: () => {}, after: () => {}, click: () => {}, val: () => '', change: () => {}, closest: () => ({ length: 0 }), eq: () => ({ length: 0, val: () => '' }), replaceWith: () => {}, remove: () => {} }) };
    
    return {
        find: (selector) => {
            const found = element.querySelector(selector);
            return createMinimalJQuery(found);
        },
        append: (html) => {
            if (typeof html === 'string') {
                element.insertAdjacentHTML('beforeend', html);
            } else {
                element.appendChild(html);
            }
            return createMinimalJQuery(element);
        },
        after: (html) => {
            if (typeof html === 'string') {
                element.insertAdjacentHTML('afterend', html);
            } else {
                element.parentNode.insertBefore(html, element.nextSibling);
            }
            return createMinimalJQuery(element);
        },
        replaceWith: (html) => {
            if (typeof html === 'string') {
                element.outerHTML = html;
            } else {
                element.parentNode.replaceChild(html, element);
            }
            return createMinimalJQuery(element);
        },
        closest: (selector) => {
            const found = element.closest(selector);
            return createMinimalJQuery(found);
        },
        click: (handler) => {
            if (element) element.addEventListener('click', handler);
            return createMinimalJQuery(element);
        },
        change: (handler) => {
            if (element) element.addEventListener('change', handler);
            return createMinimalJQuery(element);
        },
        val: (value) => {
            if (arguments.length === 0) {
                // For range-picker elements, try to get the value attribute first
                if (element?.tagName === 'RANGE-PICKER') {
                    return element.getAttribute('value') || element.value || '';
                }
                return element?.value || '';
            }
            if (element) {
                if (element.tagName === 'RANGE-PICKER') {
                    element.setAttribute('value', value);
                }
                element.value = value;
            }
            return createMinimalJQuery(element);
        },
        eq: (index) => {
            return createMinimalJQuery(element);
        },
        attr: (name, value) => {
            if (arguments.length === 1) {
                return element?.getAttribute(name) || '';
            }
            if (element) element.setAttribute(name, value);
            return createMinimalJQuery(element);
        },
        remove: () => {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
            return createMinimalJQuery(null);
        },
        length: element ? 1 : 0
    };
}

Hooks.on("renderDrawingConfig", (app, root, data) => {
    // Use our DOM helper that works with both jQuery and HTMLElement
    // In v13, 'root' is HTMLElement and 'data' is frozen/immutable
    // In v12, 'root' might be jQuery and 'data' can be mutated
    // IMPORTANT: We only manipulate the DOM, never the data object (v13 safe)
    const $ = getDOMHelper(root);
    
    const document = app.document;
    const ls = document.getFlag(MODULE_ID, "lineStyle") ?? {};
    const fs = document.getFlag(MODULE_ID, "fillStyle") ?? {};
    const ts = document.getFlag(MODULE_ID, "textStyle") ?? {};

    // Add scrolling styles for the drawing config form
    const styleId = `${MODULE_ID}-scrolling-styles`;
    if (!globalThis.document.getElementById(styleId)) {
        const style = globalThis.document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Make drawing config form scrollable - targeting proper selectors */
            .app.drawing-config,
            .app.sheet.drawing-config,
            .app.${MODULE_ID}-scrollable-config,
            [data-advanced-drawing-tools-scrollable="true"] {
                max-height: 90vh;
                resize: vertical;
                overflow: hidden;
            }
            
            /* Target the actual form content containers */
            .app.drawing-config .sheet-body,
            .app.drawing-config .form-body,
            .app.drawing-config .tab,
            .app.sheet.drawing-config .sheet-body,
            .app.sheet.drawing-config .form-body,
            .app.sheet.drawing-config .tab,
            .app.${MODULE_ID}-scrollable-config .sheet-body,
            .app.${MODULE_ID}-scrollable-config .form-body,
            .app.${MODULE_ID}-scrollable-config .tab,
            [data-advanced-drawing-tools-scrollable="true"] .sheet-body,
            [data-advanced-drawing-tools-scrollable="true"] .form-body,
            [data-advanced-drawing-tools-scrollable="true"] .tab {
                max-height: ${Math.min(window.innerHeight * 0.8, 650)}px;
                overflow-y: auto;
                overflow-x: hidden;
                padding-right: 8px;
            }
            
            /* Scrollbar styling for all targeted containers */
            .app.drawing-config .sheet-body::-webkit-scrollbar,
            .app.drawing-config .form-body::-webkit-scrollbar,
            .app.drawing-config .tab::-webkit-scrollbar,
            .app.sheet.drawing-config .sheet-body::-webkit-scrollbar,
            .app.sheet.drawing-config .form-body::-webkit-scrollbar,
            .app.sheet.drawing-config .tab::-webkit-scrollbar,
            .app.${MODULE_ID}-scrollable-config .sheet-body::-webkit-scrollbar,
            .app.${MODULE_ID}-scrollable-config .form-body::-webkit-scrollbar,
            .app.${MODULE_ID}-scrollable-config .tab::-webkit-scrollbar {
                width: 8px;
            }
            
            .app.drawing-config .sheet-body::-webkit-scrollbar-track,
            .app.drawing-config .form-body::-webkit-scrollbar-track,
            .app.drawing-config .tab::-webkit-scrollbar-track,
            .app.sheet.drawing-config .sheet-body::-webkit-scrollbar-track,
            .app.sheet.drawing-config .form-body::-webkit-scrollbar-track,
            .app.sheet.drawing-config .tab::-webkit-scrollbar-track,
            .app.${MODULE_ID}-scrollable-config .sheet-body::-webkit-scrollbar-track,
            .app.${MODULE_ID}-scrollable-config .form-body::-webkit-scrollbar-track,
            .app.${MODULE_ID}-scrollable-config .tab::-webkit-scrollbar-track {
                background: var(--color-border-light-tertiary, #ccc);
                border-radius: 4px;
            }
            
            .app.drawing-config .sheet-body::-webkit-scrollbar-thumb,
            .app.drawing-config .form-body::-webkit-scrollbar-thumb,
            .app.drawing-config .tab::-webkit-scrollbar-thumb,
            .app.sheet.drawing-config .sheet-body::-webkit-scrollbar-thumb,
            .app.sheet.drawing-config .form-body::-webkit-scrollbar-thumb,
            .app.sheet.drawing-config .tab::-webkit-scrollbar-thumb,
            .app.${MODULE_ID}-scrollable-config .sheet-body::-webkit-scrollbar-thumb,
            .app.${MODULE_ID}-scrollable-config .form-body::-webkit-scrollbar-thumb,
            .app.${MODULE_ID}-scrollable-config .tab::-webkit-scrollbar-thumb {
                background: var(--color-border-dark, #666);
                border-radius: 4px;
            }
            
            .app.drawing-config .sheet-body::-webkit-scrollbar-thumb:hover,
            .app.drawing-config .form-body::-webkit-scrollbar-thumb:hover,
            .app.drawing-config .tab::-webkit-scrollbar-thumb:hover,
            .app.sheet.drawing-config .sheet-body::-webkit-scrollbar-thumb:hover,
            .app.sheet.drawing-config .form-body::-webkit-scrollbar-thumb:hover,
            .app.sheet.drawing-config .tab::-webkit-scrollbar-thumb:hover,
            .app.${MODULE_ID}-scrollable-config .sheet-body::-webkit-scrollbar-thumb:hover,
            .app.${MODULE_ID}-scrollable-config .form-body::-webkit-scrollbar-thumb:hover,
            .app.${MODULE_ID}-scrollable-config .tab::-webkit-scrollbar-thumb:hover {
                background: var(--color-border-dark-primary, #333);
            }
            
            /* Form group spacing improvements */
            .app.drawing-config .form-group:last-child,
            .app.sheet.drawing-config .form-group:last-child,
            .app.${MODULE_ID}-scrollable-config .form-group:last-child {
                margin-bottom: 1rem;
            }
            
            /* Ensure tabs don't interfere with scrolling - stick to top */
            .app.drawing-config .sheet-tabs,
            .app.drawing-config .tabs,
            .app.sheet.drawing-config .sheet-tabs,
            .app.sheet.drawing-config .tabs,
            .app.${MODULE_ID}-scrollable-config .sheet-tabs,
            .app.${MODULE_ID}-scrollable-config .tabs {
                position: sticky;
                top: 0;
                background: var(--color-bg, #f8f9fa);
                z-index: 10;
                margin-bottom: 0.5rem;
                border-bottom: 1px solid var(--color-border-light-tertiary, #ccc);
                padding-bottom: 0.25rem;
            }
            
            /* Better spacing for text style fields */
            .app.drawing-config .tab[data-tab="text"] .form-group,
            .app.sheet.drawing-config .tab[data-tab="text"] .form-group,
            .app.${MODULE_ID}-scrollable-config .tab[data-tab="text"] .form-group {
                margin-bottom: 0.75rem;
            }
            
            /* Ensure form content has proper padding and doesn't clip */
            .app.drawing-config form,
            .app.sheet.drawing-config form,
            .app.${MODULE_ID}-scrollable-config form {
                padding-bottom: 1rem;
            }
        `;
        globalThis.document.head.appendChild(style);
    }

    $.find(`.tab[data-tab="position"]`).append(`
        <div class="form-group">
            <label>Invisible</label>
            <div class="form-fields">
                <input type="checkbox" name="flags.${MODULE_ID}.invisible" ${document.getFlag(MODULE_ID, "invisible") ? "checked" : ""}>
            </div>
            <p class="notes">Invisible drawings are visible to their authors and GMs if the drawings layer is active. Otherwise they are not visible to anyone.</p>
        </div>
    `);

    $.find(`input[name="text"]`).replaceWith(`
        <textarea name="text" style="font-family: var(--font-primary); min-height: calc(var(--form-field-height) + 3px); height: 100; border-color: var(--color-border-light-tertiary);">${document.text ?? ""}</textarea>
    `);

    $.find(`input[name="strokeWidth"]`).closest(".form-group").after(`
        <div class="form-group">
            <label>Dashed <span class="units">(Pixels)</span></label>
            <div class="form-fields">
                <label>Dash</label>
                <input type="number" name="flags.${MODULE_ID}.lineStyle.dash" min="0.1" step="0.1" placeholder="8" value="${ls.dash?.[0] ?? "8"}">
                <label>Gap</label>
                <input type="number" name="flags.${MODULE_ID}.lineStyle.dash" min="0.1" step="0.1" placeholder="5" value="${ls.dash?.[1] ?? "5"}">
                &nbsp;&nbsp;&nbsp;
                <input type="checkbox" name="flags.${MODULE_ID}.lineStyle.dashEnabled" class="${MODULE_ID}--lineStyle-dash" ${ls.dash ? "checked" : ""}>
            </div>
        </div>
    `);

    $.find(`div[data-tab="fill"]`).append(`
        <div class="form-group">
            <label>Texture Size <span class="units">(Pixels or %)</span></label>
            <div class="form-fields">
                <label>X</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.texture.width" title="Pixels (px) or Percent (%)" pattern="\\s*(\\d*\\.?\\d+)\\s*(px|%)?\\s*" placeholder="Width" value="${stringifyValue(fs.texture?.width) ?? ""}">
                <label>Y</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.texture.height" title="Pixels (px) or Percent (%)" pattern="\\s*(\\d*\\.?\\d+)\\s*(px|%)?\\s*" placeholder="Height" value="${stringifyValue(fs.texture?.height) ?? ""}">
            </div>
        </div>
        <div class="form-group">
            <label>Texture Position <span class="units">(Pixels or %)</span></label>
            <div class="form-fields">
                <label>X</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.position.x" title="Pixels (px) or Percent (%)" pattern="\\s*(\\d*\\.?\\d+)\\s*(px|%)?\\s*" placeholder="0px" value="${stringifyValue(fs.transform?.position?.x) ?? "0px"}">
                <label>Y</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.position.y" title="Pixels (px) or Percent (%)" pattern="\\s*(\\d*\\.?\\d+)\\s*(px|%)?\\s*" placeholder="0px" value="${stringifyValue(fs.transform?.position?.y) ?? "0px"}">
            </div>
        </div>
        <div class="form-group">
            <label>Texture Pivot <span class="units">(Pixels or %)</span></label>
            <div class="form-fields">
                <label>X</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.pivot.x" title="Pixels (px) or Percent (%)" pattern="\\s*(\\d*\\.?\\d+)\\s*(px|%)?\\s*" placeholder="0px" value="${stringifyValue(fs.transform?.pivot?.x) ?? "0px"}">
                <label>Y</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.pivot.y" title="Pixels (px) or Percent (%)" pattern="\\s*(\\d*\\.?\\d+)\\s*(px|%)?\\s*" placeholder="0px" value="${stringifyValue(fs.transform?.pivot?.y) ?? "0px"}">
            </div>
        </div>
        <div class="form-group">
            <label>Texture Scale</label>
            <div class="form-fields">
                <label>X</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.scale.x" data-dtype="Number" placeholder="1" value="${fs.transform?.scale?.x ?? "1"}">
                <label>Y</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.scale.y" data-dtype="Number" placeholder="1" value="${fs.transform?.scale?.y ?? "1"}">
            </div>
        </div>
        <div class="form-group">
            <label>Texture Rotation <span class="units">(Degrees)</span></label>
            <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.rotation" data-dtype="Number" placeholder="0" value="${fs.transform?.rotation ?? "0"}">
        </div>
        <div class="form-group">
            <label>Texture Skew <span class="units">(Degrees)</span></label>
            <div class="form-fields">
                <label>X</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.skew.x" data-dtype="Number" placeholder="0" value="${fs.transform?.skew?.x ?? "0"}">
                <label>Y</label>
                <input type="text" name="flags.${MODULE_ID}.fillStyle.transform.skew.y" data-dtype="Number" placeholder="0" value="${fs.transform?.skew?.y ?? "0"}">
            </div>
        </div>
    `);

    $.find(`select[name="fontFamily"]`).closest(".form-group").after(`
        <div class="form-group">
            <label>Font Style</label>
            <select name="flags.${MODULE_ID}.textStyle.fontStyle">
                <option value="normal" ${ts.fontStyle === "normal" || ts.fontStyle == null ? "selected" : ""}>Normal</option>
                <option value="italic" ${ts.fontStyle === "italic" ? "selected" : ""}>Italic</option>
                <option value="oblique" ${ts.fontStyle === "oblique" ? "selected" : ""}>Oblique</option>
            </select>
        </div>
        <div class="form-group">
            <label>Font Variant</label>
            <select name="flags.${MODULE_ID}.textStyle.fontVariant">
                <option value="normal" ${ts.fontVariant === "normal" || ts.fontVariant == null ? "selected" : ""}>Normal</option>
                <option value="small-caps" ${ts.fontVariant === "small-caps" ? "selected" : ""}>Small Caps</option>
            </select>
        </div>
        <div class="form-group">
            <label>Font Weight</label>
            <select name="flags.${MODULE_ID}.textStyle.fontWeight">
                <option value="normal" ${ts.fontWeight === "normal" || ts.fontWeight == null ? "selected" : ""}>Normal</option>
                <option value="bold" ${ts.fontWeight === "bold" ? "selected" : ""}>Bold</option>
                <option value="bolder" ${ts.fontWeight === "bolder" ? "selected" : ""}>Bolder</option>
                <option value="lighter" ${ts.fontWeight === "lighter" ? "selected" : ""}>Lighter</option>
                <option value="100" ${ts.fontWeight === "100" ? "selected" : ""}>100</option>
                <option value="200" ${ts.fontWeight === "200" ? "selected" : ""}>200</option>
                <option value="300" ${ts.fontWeight === "300" ? "selected" : ""}>300</option>
                <option value="400" ${ts.fontWeight === "400" ? "selected" : ""}>400</option>
                <option value="500" ${ts.fontWeight === "500" ? "selected" : ""}>500</option>
                <option value="600" ${ts.fontWeight === "600" ? "selected" : ""}>600</option>
                <option value="700" ${ts.fontWeight === "700" ? "selected" : ""}>700</option>
                <option value="800" ${ts.fontWeight === "800" ? "selected" : ""}>800</option>
                <option value="900" ${ts.fontWeight === "900" ? "selected" : ""}>900</option>
            </select>
        </div>
    `);

    // Try to find fontSize field - first try input, then range-picker (V13)
    let fontSizeElement = $.find(`input[name="fontSize"]`);
    if (fontSizeElement.length === 0) {
        fontSizeElement = $.find(`range-picker[name="fontSize"]`);
    }
    
    fontSizeElement.closest(".form-group").after(`
        <div class="form-group">
            <label>Leading <span class="units">(Pixels)</span></label>
            <input type="number" name="flags.${MODULE_ID}.textStyle.leading" min="0" step="0.1" placeholder="0" value="${ts.leading ?? "0"}">
        </div>
        <div class="form-group">
            <label>Letter Spacing <span class="units">(Pixels)</span></label>
            <input type="number" name="flags.${MODULE_ID}.textStyle.letterSpacing" min="0" step="0.1" placeholder="0" value="${ts.letterSpacing ?? "0"}">
        </div>
        <div class="form-group">
            <label>Line Height <span class="units">(Pixels)</span></label>
            <input type="number" name="flags.${MODULE_ID}.textStyle.lineHeight" min="0" step="0.1" placeholder="normal" value="${ts.lineHeight ?? "normal"}">
        </div> 
        <div class="form-group">
            <label>Word Wrap Width <span class="units">(Pixels or %)</span></label>
            <input type="text" name="flags.${MODULE_ID}.textStyle.wordWrapWidth" title="Pixels (px) or Percent (%)" pattern="\\s*(\\d*\\.?\\d+)\\s*(px|%)?\\s*" placeholder="100%" value="${stringifyValue(ts.wordWrapWidth) ?? "100%"}">
        </div>
    `);

    $.find(`input[name="textColor"]`).closest(".form-fields").append(`
        &nbsp;
        <input type="number" name="flags.${MODULE_ID}.textStyle.fillGradientStops" min="0" max="1" step="0.001" placeholder="" title="Color Stop" value="${ts?.fillGradientStops?.[0] ?? ""}">
        &nbsp;
        <a title="Add Color" class="${MODULE_ID}--textStyle-fill--add" style="flex: 0;"><i class="fas fa-plus fa-fw" style="margin: 0;"></i></a>
        <a title="Remove Color" class="${MODULE_ID}--textStyle-fill--remove" style="flex: 0;"><i class="fas fa-minus fa-fw" style="margin: 0;"></i></a>
    `);
    
    $.find(`a[class="${MODULE_ID}--textStyle-fill--add"]`).click(event => {
        $.find(`input[name="textColor"]`).closest(".form-group").after(createTextColor(
            $.find(`input[name="textColor"]`).val(),
            $.find(`input[name="flags.${MODULE_ID}.textStyle.fillGradientStops"]`).eq(0).val()
        ));
        app.setPosition(app.position);
    });
    
    $.find(`a[class="${MODULE_ID}--textStyle-fill--remove"]`).click(event => {
        $.find(`input[name="textColor"],input[data-edit="textColor"]`).val(
            $.find(`input[name="flags.${MODULE_ID}.textStyle.fill"]`).eq(0).val() || "#ffffff"
        );
        $.find(`input[name="flags.${MODULE_ID}.textStyle.fillGradientStops"]`).eq(0).val(
            $.find(`input[name="flags.${MODULE_ID}.textStyle.fillGradientStops"]`).eq(1).val() ?? ""
        );
        $.find(`input[name="flags.${MODULE_ID}.textStyle.fill"]`).eq(0).closest(".form-group").remove();
        app.setPosition(app.position);
    });

    const createTextColor = (fill, stop) => {
        const groupHTML = `
            <div class="form-group">
                <label></label>
                <div class="form-fields">
                    <input class="color" type="text" name="flags.${MODULE_ID}.textStyle.fill" value="${fill || "#ffffff"}">
                    <input type="color" data-edit="" value="${fill || "#ffffff"}">
                    &nbsp;
                    <input type="number" name="flags.${MODULE_ID}.textStyle.fillGradientStops" min="0" max="1" step="0.001" placeholder="" title="Color Stop" value="${stop ?? ""}">
                    &nbsp;
                    <a title="Add Color" style="flex: 0;"><i class="fas fa-plus fa-fw" style="margin: 0;"></i></a>
                    <a title="Remove Color" style="flex: 0;"><i class="fas fa-minus fa-fw" style="margin: 0;"></i></a>
                </div>
            </div>
        `;

        // Create element and set up event handlers
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = groupHTML;
        const group = tempDiv.firstElementChild;

        const colorInput = group.querySelector('input[type="color"]');
        const textInput = group.querySelector('input[class="color"]');
        const addButton = group.querySelectorAll('a')[0];
        const removeButton = group.querySelectorAll('a')[1];

        if (colorInput && textInput) {
            colorInput.addEventListener('change', (event) => {
                textInput.value = event.target.value;
            });
        }

        if (addButton) {
            addButton.addEventListener('click', (event) => {
                const currentFill = textInput ? textInput.value : fill;
                const currentStop = group.querySelector(`input[name="flags.${MODULE_ID}.textStyle.fillGradientStops"]`)?.value || stop;
                const newGroup = createTextColor(currentFill, currentStop);
                group.parentNode.insertBefore(newGroup, group.nextSibling);
                app.setPosition(app.position);
            });
        }

        if (removeButton) {
            removeButton.addEventListener('click', (event) => {
                if (group.parentNode) {
                    group.parentNode.removeChild(group);
                }
                app.setPosition(app.position);
            });
        }

        return group;
    }

    if (ts.fill) {
        const fill = Array.isArray(ts.fill) ? ts.fill : [ts.fill];

        for (let i = fill.length - 1; i >= 0; i--) {
            const textColorInput = $.find(`input[name="textColor"]`);
            const formGroup = getDOMHelper(textColorInput).closest(".form-group");
            if (formGroup.length > 0) {
                const newGroup = createTextColor(fill[i], ts?.fillGradientStops?.[i + 1]);
                formGroup.after(newGroup);
            }
        }
    }

    // Try to find textAlpha field - first try input, then range-picker (V13)
    let textAlphaElement = $.find(`input[name="textAlpha"]`);
    if (textAlphaElement.length === 0) {
        textAlphaElement = $.find(`range-picker[name="textAlpha"]`);
    }
    
    textAlphaElement.closest(".form-group").before(`
        <div class="form-group">
            <label>Text Color Gradient</label>
            <select name="flags.${MODULE_ID}.textStyle.fillGradientType" data-dtype="Number">
                <option value="0" ${ts.fillGradientType === 0 || ts.fillGradientType == null ? "selected" : ""}>Vertical</option>
                <option value="1" ${ts.fillGradientType === 1 ? "selected" : ""}>Horizontal</option>
            </select>
        </div>
    `);

    textAlphaElement.closest(".form-group").after(`
        <div class="form-group">
            <label>Text Alignment</label>
            <select name="flags.${MODULE_ID}.textStyle.align">
                <option value="" ${ts.align == null ? "selected" : ""}>Default</option>
                <option value="left" ${ts.align === "left" || ts.align === "justify" ? "selected" : ""}>Left</option>
                <option value="center" ${ts.align === "center" ? "selected" : ""}>Center</option>
                <option value="right" ${ts.align === "right" ? "selected" : ""}>Right</option>
            </select>
        </div>
        <div class="form-group">
            <label>Stroke Color</label>
            <div class="form-fields">
                <color-picker name="flags.${MODULE_ID}.textStyle.stroke" placeholder="" value="${ts.stroke || ""}">
                    <input type="text" placeholder="">
                    <input type="color" style="">
                </color-picker>
            </div>
        </div>
        <div class="form-group">
            <label>Stroke Thickness <span class="units">(Pixels)</span></label>
            <input type="number" name="flags.${MODULE_ID}.textStyle.strokeThickness" min="0" step="0.1" placeholder="Default" value="${ts.strokeThickness ?? ""}">
        </div>
        <div class="form-group">
            <label>Stroke Opacity</label>
            <div class="form-fields">
                <range-picker name="flags.${MODULE_ID}.textStyle.strokeOpacity" value="${ts.strokeOpacity ?? "1"}" min="0" max="1" step="0.1">
                    <input type="range" min="0" max="1" step="0.1" style="">
                    <input type="number" min="0" max="1" step="0.1"}">
                </range-picker>
            </div>
        </div>
        <div class="form-group">
            <label>Drop Shadow</label>
            <input type="checkbox" name="flags.${MODULE_ID}.textStyle.dropShadow" ${(ts.dropShadow ?? true) ? "checked" : ""}>
        </div>
        <div class="form-group">
            <label>Drop Shadow Blur <span class="units">(Pixels)</span></label>
            <input type="number" name="flags.${MODULE_ID}.textStyle.dropShadowBlur" min="0" step="0.1" placeholder="Default" value="${ts.dropShadowBlur ?? ""}">
        </div>
        <div class="form-group">
            <label>Drop Shadow Distance <span class="units">(Pixels)</span></label>
            <input type="number" name="flags.${MODULE_ID}.textStyle.dropShadowDistance" min="0" step="0.1" placeholder="0" value="${ts.dropShadowDistance ?? "0"}">
        </div>
        <div class="form-group">
            <label>Drop Shadow Angle <span class="units">(Degrees)</span></label>
            <input type="number" name="flags.${MODULE_ID}.textStyle.dropShadowAngle" step="0.1" placeholder="0" value="${ts.dropShadowAngle ?? "0"}">
        </div>
        <div class="form-group">
            <label>Drop Shadow Color</label>
            <div class="form-fields">
                <color-picker name="flags.${MODULE_ID}.textStyle.dropShadowColor" placeholder="#000000" value="${ts.dropShadowColor || "#000000"}">
                    <input type="text" placeholder="#000000">
                    <input type="color" style="">
                </color-picker>
            </div>
        </div>
        <div class="form-group">
            <label>Drop Shadow Alpha</label>
            <div class="form-fields">
                <range-picker name="flags.${MODULE_ID}.textStyle.dropShadowAlpha" value="${ts.dropShadowAlpha ?? "1"}" min="0" max="1" step="0.1">
                    <input type="range" min="0" max="1" step="0.1" style="">
                    <input type="number" min="0" max="1" step="0.1"}">
                </range-picker>
            </div>
        </div>
        <div class="form-group">
            <label>Arc <span class="units">(Degrees)</span></label>
            <input type="number" name="flags.${MODULE_ID}.textStyle.arc" step="0.1" min="-360" max="360" placeholder="0" value="${ts.arc ?? "0"}">
        </div>
    `);

    const updateStrokeColorPlaceholder = (event) => {
        let textColor;

        if (event?.target.type === "color") {
            textColor = $.find(`input[data-edit="textColor"]`).val();
        } else {
            textColor = $.find(`input[name="textColor"]`).val();
        }

        const strokeColor = Color.from(textColor || "#ffffff").hsv[2] > 0.6 ? "#000000" : "#ffffff";

        $.find(`input[name="flags.advanced-drawing-tools.textStyle.stroke"]`).attr("placeholder", strokeColor);
        $.find(`input[data-edit="flags.advanced-drawing-tools.textStyle.stroke"]`).val(strokeColor);
    };

    updateStrokeColorPlaceholder();

    $.find(`input[name="textColor"],input[data-edit="textColor"]`).change(event => updateStrokeColorPlaceholder(event));

    const updateStrokeThicknessPlaceholder = () => {
        // Try to get fontSize from input first, then range-picker
        let fontSize = $.find(`input[name="fontSize"]`).val();
        if (!fontSize) {
            const rangePicker = $.find(`range-picker[name="fontSize"]`);
            if (rangePicker.length > 0) {
                fontSize = rangePicker.attr('value') || rangePicker.val();
            }
        }

        $.find(`input[name="flags.advanced-drawing-tools.textStyle.strokeThickness"]`).attr(
            "placeholder",
            Math.max(Math.round(fontSize / 32), 2)
        );
    };

    updateStrokeThicknessPlaceholder();

    // Add change listener for both input and range-picker elements
    $.find(`input[name="fontSize"]`).change(event => updateStrokeThicknessPlaceholder(event));
    $.find(`range-picker[name="fontSize"]`).change(event => updateStrokeThicknessPlaceholder(event));

    const updateDropShadowBlurPlaceholder = () => {
        // Try to get fontSize from input first, then range-picker
        let fontSize = $.find(`input[name="fontSize"]`).val();
        if (!fontSize) {
            const rangePicker = $.find(`range-picker[name="fontSize"]`);
            if (rangePicker.length > 0) {
                fontSize = rangePicker.attr('value') || rangePicker.val();
            }
        }

        $.find(`input[name="flags.advanced-drawing-tools.textStyle.dropShadowBlur"]`).attr(
            "placeholder",
            Math.max(Math.round(fontSize / 16), 2)
        );
    };

    updateDropShadowBlurPlaceholder();

    // Add change listener for both input and range-picker elements
    $.find(`input[name="fontSize"]`).change(event => updateDropShadowBlurPlaceholder(event));
    $.find(`range-picker[name="fontSize"]`).change(event => updateDropShadowBlurPlaceholder(event));

    // Safely set height properties with defensive checks to enable scrolling
    try {
        // Calculate a reasonable max height based on screen size
        const maxHeight = Math.min(window.innerHeight * 0.9, 750);
        
        if (app.options && typeof app.options === 'object') {
            if (Object.isExtensible(app.options)) {
                app.options.height = "auto";
                app.options.maxHeight = maxHeight;
                app.options.resizable = true;
                // V13 specific scrolling options
                if (app.options.scrollY !== undefined) {
                    app.options.scrollY = [".window-content"];
                }
            }
        }
        
        if (app.position && typeof app.position === 'object') {
            if (Object.isExtensible(app.position)) {
                app.position.height = "auto";
                app.position.maxHeight = maxHeight;
            }
        }
        
        // Add a CSS class to identify this as a scrollable config window
        const rootElement = root?.jquery ? root[0] : (root instanceof HTMLElement ? root : null);
        if (rootElement) {
            // Try multiple approaches to find the app element
            let appElement = rootElement.closest('.app') || 
                           rootElement.closest('.application') ||
                           rootElement.querySelector('.app') ||
                           rootElement;
            
            // For V13 and different systems, try to find the drawing config specifically
            if (!appElement.classList.contains('drawing-config')) {
                const drawingConfigElement = rootElement.closest('.drawing-config') ||
                                           rootElement.querySelector('.drawing-config');
                if (drawingConfigElement) {
                    appElement = drawingConfigElement;
                }
            }
            
            if (appElement && appElement.classList) {
                appElement.classList.add(`${MODULE_ID}-scrollable-config`);
                
                // Also add a data attribute for additional targeting if needed
                appElement.setAttribute('data-advanced-drawing-tools-scrollable', 'true');
            }
        }
        
        app.setPosition(app.position);
    } catch (error) {
        console.warn("Advanced Drawing Tools: Could not set auto height for config dialog", error);
        // Fallback: just call setPosition without modifying height
        try {
            app.setPosition();
        } catch (fallbackError) {
            console.warn("Advanced Drawing Tools: Could not resize config dialog", fallbackError);
        }
    }
});
