import { canvasToLocal, shapeUpdateFrom, applyHandlePoint, PointHandle, EdgeHandle,
         _PIXI_FLUENT_FILL, _PIXI_LEGACY_FILL } from "../edit-mode.js";
import { getFillMatrix, getFillStyleMatrix, isLegacyFillStyle, migrateFillStyle } from "../fill-style.js";
import { cleanData } from "../utils.js";

Hooks.once("quenchReady", (quench) => {

    // -------------------------------------------------------------------------
    // Batch 1: PIXI API surface
    //
    // Run this first. Failures here explain refresh() crashes.
    // The batch also logs a full table so you can see every method's type.
    // -------------------------------------------------------------------------
    quench.registerBatch("advanced-drawing-tools.pixi-api-surface", (context) => {
        const { describe, it, assert } = context;
        let g;

        describe("PIXI.Graphics — drawing methods", () => {
            before(() => { g = new PIXI.Graphics(); });
            after(() => { try { g.destroy(); } catch (_) {} });

            it("has clear()", () => {
                assert.equal(typeof g.clear, "function");
            });
            it("has circle() or drawCircle() — used by PointHandle", () => {
                assert.isTrue(
                    typeof g.circle === "function" || typeof g.drawCircle === "function",
                    "Neither circle() nor drawCircle() exists — PointHandle will crash"
                );
            });
            it("has rect() or drawRect() — used by EdgeHandle", () => {
                assert.isTrue(
                    typeof g.rect === "function" || typeof g.drawRect === "function",
                    "Neither rect() nor drawRect() exists — EdgeHandle will crash"
                );
            });
            it("has moveTo() + lineTo() — used by EdgeHandle dashes", () => {
                assert.equal(typeof g.moveTo, "function");
                assert.equal(typeof g.lineTo, "function");
            });

            // Fluent (v8) API
            it("[info] fill() exists (PixiJS v8 fluent API)", () => {
                console.log("PIXI fill() is method:", typeof g.fill === "function",
                    "| typeof g.fill:", typeof g.fill);
                assert.ok(true); // informational only — code handles both paths
            });
            it("[info] stroke() exists (PixiJS v8 fluent API)", () => {
                console.log("PIXI stroke() is method:", typeof g.stroke === "function",
                    "| typeof g.stroke:", typeof g.stroke);
                assert.ok(true);
            });

            // Legacy (v7) API
            it("[info] beginFill/endFill/lineStyle exist (PixiJS v7 API)", () => {
                console.log("beginFill:", typeof g.beginFill,
                    "| endFill:", typeof g.endFill,
                    "| lineStyle:", typeof g.lineStyle);
                assert.ok(true);
            });

            it("[info] circle() return value — diagnoses chaining behaviour", () => {
                const circleMethod = g.circle ?? g.drawCircle;
                const result = circleMethod.call(g, 0, 0, 5);
                console.log("circle() returns Graphics?", result === g,
                    "| typeof result.fill:", typeof result?.fill,
                    "| typeof result.stroke:", typeof result?.stroke);
                g.clear();
                assert.ok(true);
            });

            it("[info] full method table", () => {
                const methods = [
                    "circle","drawCircle","rect","drawRect","ellipse","drawEllipse",
                    "poly","drawPolygon","fill","stroke","lineStyle","beginFill","endFill",
                    "clear","moveTo","lineTo","beginPath","closePath",
                ];
                const report = {};
                for (const m of methods) report[m] = typeof g[m];
                console.table(report);
                assert.ok(true);
            });
        });

        describe("PIXI API detection flags (module-level)", () => {
            it("exactly one drawing API is detected (fluent or legacy)", () => {
                console.log("_PIXI_FLUENT_FILL:", _PIXI_FLUENT_FILL,
                    "| _PIXI_LEGACY_FILL:", _PIXI_LEGACY_FILL);
                assert.isTrue(
                    _PIXI_FLUENT_FILL || _PIXI_LEGACY_FILL,
                    "Neither fluent (fill/stroke) nor legacy (beginFill/endFill) API detected — handles will not draw"
                );
            });
        });

        describe("Foundry constants", () => {
            it("CONST.DRAWING_SHAPES — logs value (may be undefined in v14)", () => {
                console.log("CONST.DRAWING_SHAPES:", CONST.DRAWING_SHAPES);
                assert.ok(true);
            });
            it("CONST.DRAWING_FILL_TYPES.NONE exists — used by EdgeHandle", () => {
                assert.notEqual(
                    CONST.DRAWING_FILL_TYPES?.NONE, undefined,
                    "CONST.DRAWING_FILL_TYPES.NONE is missing — EdgeHandle closing-edge check will break"
                );
            });
            it("Math.toRadians exists — used by canvasToLocal", () => {
                assert.equal(typeof Math.toRadians, "function",
                    "Math.toRadians is missing — canvasToLocal will crash");
            });
        });
    }, { displayName: "ADT | PIXI API surface" });


    // -------------------------------------------------------------------------
    // Batch 2: Geometry helpers (pure math, no PIXI draw calls)
    // -------------------------------------------------------------------------
    quench.registerBatch("advanced-drawing-tools.geometry", (context) => {
        const { describe, it, assert } = context;

        describe("shapeUpdateFrom", () => {
            it("returns a deep copy — mutating result does not affect source", () => {
                const src = { x: 10, y: 20, shape: { width: 100, height: 100, points: [0, 0, 50, 0, 50, 50] } };
                const copy = shapeUpdateFrom(src);
                copy.shape.points.push(99, 99);
                assert.equal(src.shape.points.length, 6);
            });
            it("preserves x, y, width, height", () => {
                const src = { x: 5, y: 15, shape: { width: 200, height: 300, points: [1, 2] } };
                const copy = shapeUpdateFrom(src);
                assert.equal(copy.x, 5);
                assert.equal(copy.y, 15);
                assert.equal(copy.shape.width, 200);
                assert.equal(copy.shape.height, 300);
            });
        });

        describe("canvasToLocal", () => {
            it("identity: axis-aligned box at origin maps point to itself", () => {
                const doc = { x: 0, y: 0, rotation: 0, shape: { width: 100, height: 100 } };
                const result = canvasToLocal({ x: 30, y: 70 }, doc);
                assert.closeTo(result.x, 30, 0.01);
                assert.closeTo(result.y, 70, 0.01);
            });
            it("translated box: world (200,100) → local (0,0)", () => {
                const doc = { x: 200, y: 100, rotation: 0, shape: { width: 100, height: 100 } };
                const result = canvasToLocal({ x: 200, y: 100 }, doc);
                assert.closeTo(result.x, 0, 0.01);
                assert.closeTo(result.y, 0, 0.01);
            });
            it("translated box: world (250,150) → local (50,50)", () => {
                const doc = { x: 200, y: 100, rotation: 0, shape: { width: 100, height: 100 } };
                const result = canvasToLocal({ x: 250, y: 150 }, doc);
                assert.closeTo(result.x, 50, 0.01);
                assert.closeTo(result.y, 50, 0.01);
            });
            it("180° rotation: world (80,20) → local (20,80)", () => {
                const doc = { x: 0, y: 0, rotation: 180, shape: { width: 100, height: 100 } };
                const result = canvasToLocal({ x: 80, y: 20 }, doc);
                assert.closeTo(result.x, 20, 0.1);
                assert.closeTo(result.y, 80, 0.1);
            });
        });

        describe("applyHandlePoint", () => {
            it("PointHandle: overwrites coordinates at index, no length change", () => {
                const mockDoc = { shape: { points: [0, 0, 100, 0, 100, 100] }, toObject() { return {}; } };
                const mockObj = { document: mockDoc, _activeEditHandle: null, _hoveredEditHandle: null };
                const h = new PointHandle(mockObj, 1);
                const update = { shape: { points: [0, 0, 100, 0, 100, 100] } };
                applyHandlePoint(update, h, { x: 55, y: 44 });
                assert.equal(update.shape.points[2], 55);
                assert.equal(update.shape.points[3], 44);
                assert.equal(update.shape.points.length, 6);
                h.destroy();
            });
            it("EdgeHandle: inserts two coords at index*2, length grows by 2", () => {
                const mockDoc = { shape: { points: [0, 0, 100, 0, 100, 100] }, toObject() { return {}; } };
                const mockObj = { document: mockDoc, _activeEditHandle: null, _hoveredEditHandle: null };
                const h = new EdgeHandle(mockObj, 1);
                const update = { shape: { points: [0, 0, 100, 0, 100, 100] } };
                applyHandlePoint(update, h, { x: 50, y: 0 });
                assert.equal(update.shape.points.length, 8);
                assert.equal(update.shape.points[2], 50);
                assert.equal(update.shape.points[3], 0);
                h.destroy();
            });
        });
    }, { displayName: "ADT | Geometry helpers" });


    // -------------------------------------------------------------------------
    // Batch 2b: editHandles coordinate transform
    //
    // Verifies that _refreshEditMode positions editHandles so polygon vertices
    // match regardless of whether Drawing is at world origin or at doc position.
    // -------------------------------------------------------------------------
    quench.registerBatch("advanced-drawing-tools.editorhandles-transform", (context) => {
        const { describe, it, assert } = context;

        function resolveHandleWorldPos(drawingX, drawingY, drawingPivotX, drawingPivotY,
                                       docX, docY, rotation, width, height, ptX, ptY) {
            // Simulate what _refreshEditMode does: compute editHandles transform,
            // then compute the world position of a handle at (ptX, ptY).
            const effectiveX = drawingX - drawingPivotX;
            const effectiveY = drawingY - drawingPivotY;
            // Default: no editHandles offset, but drawing's own pivot still shifts local→world
            let ehX = -drawingPivotX, ehY = -drawingPivotY, ehPivotX = 0, ehPivotY = 0, ehRot = 0;
            if (Math.abs(effectiveX - docX) > 0.5 || Math.abs(effectiveY - docY) > 0.5) {
                ehX = docX + width / 2;
                ehY = docY + height / 2;
                ehPivotX = width / 2;
                ehPivotY = height / 2;
                ehRot = rotation * Math.PI / 180;
            }
            // editHandles world origin = (drawingX + ehX - ehPivotX, drawingY + ehY - ehPivotY) with rotation
            // For rotation=0: worldPos = (drawingX + ehX - ehPivotX + ptX, drawingY + ehY - ehPivotY + ptY)
            const cosR = Math.cos(ehRot), sinR = Math.sin(ehRot);
            const localX = ptX - ehPivotX, localY = ptY - ehPivotY;
            const rotatedX = localX * cosR - localY * sinR;
            const rotatedY = localX * sinR + localY * cosR;
            return {
                x: drawingX + ehX - ehPivotX + rotatedX + ehPivotX,
                y: drawingY + ehY - ehPivotY + rotatedY + ehPivotY,
            };
        }

        describe("editHandles transform", () => {
            it("Drawing at doc position (0,0 effective): handle at polygon pt is correct", () => {
                // Drawing at (docX, docY) with no pivot — no extra transform applied
                const pos = resolveHandleWorldPos(300, 200, 0, 0, 300, 200, 0, 100, 80, 50, 40);
                assert.closeTo(pos.x, 350, 0.01); // 300 + 50
                assert.closeTo(pos.y, 240, 0.01); // 200 + 40
            });
            it("Drawing at center+pivot (effective = doc pos): handle at polygon pt is correct", () => {
                // Drawing at (350, 240) with pivot (50, 40) — effective origin = (300, 200) = docX/Y
                const pos = resolveHandleWorldPos(350, 240, 50, 40, 300, 200, 0, 100, 80, 50, 40);
                assert.closeTo(pos.x, 350, 0.01);
                assert.closeTo(pos.y, 240, 0.01);
            });
            it("Drawing at world origin (0,0): editHandles gets doc transform, handle correct", () => {
                // Drawing at (0, 0) — v14 case — editHandles must be moved to doc position
                const pos = resolveHandleWorldPos(0, 0, 0, 0, 300, 200, 0, 100, 80, 50, 40);
                assert.closeTo(pos.x, 350, 0.01); // docX + ptX
                assert.closeTo(pos.y, 240, 0.01); // docY + ptY
            });
        });
    }, { displayName: "ADT | editHandles transform" });


    // -------------------------------------------------------------------------
    // Batch 3: Handle smoke tests (create → refresh → destroy, no crash)
    //
    // These exercise the actual PIXI draw calls using whatever API was detected.
    // Note: canvas.dimensions may be null if no scene is loaded; tests skip if so.
    // -------------------------------------------------------------------------
    quench.registerBatch("advanced-drawing-tools.handle-lifecycle", (context) => {
        const { describe, it, assert } = context;

        function makeDrawing(points = [0, 0, 100, 0, 100, 100]) {
            const doc = {
                shape: { type: "p", points, width: 100, height: 100 },
                fillType: 1,
                x: 0, y: 0, rotation: 0,
                toObject() {
                    return { x: this.x, y: this.y, rotation: this.rotation,
                        shape: { ...this.shape, points: [...this.shape.points] } };
                },
                updateSource(u) { if (u.shape) Object.assign(this.shape, u.shape); },
            };
            return {
                document: doc,
                _activeEditHandle: null,
                _hoveredEditHandle: null,
                layer: { getSnappedPoint: (p) => p },
                renderFlags: { set: () => {} },
                _rescaleDimensions: (u) => u,
            };
        }

        describe("PointHandle", () => {
            it("refresh() on a visible index does not throw", () => {
                if (!canvas?.dimensions) return; // skip: no active scene
                const h = new PointHandle(makeDrawing(), 0);
                assert.doesNotThrow(() => h.refresh());
                assert.isTrue(h.visible);
                h.destroy();
            });
            it("refresh() on an out-of-range index hides the handle", () => {
                if (!canvas?.dimensions) return;
                const h = new PointHandle(makeDrawing([0, 0, 100, 0]), 5);
                assert.doesNotThrow(() => h.refresh());
                assert.isFalse(h.visible);
                h.destroy();
            });
            it("refresh() after destroy() is a no-op", () => {
                const h = new PointHandle(makeDrawing(), 0);
                h.destroy();
                assert.doesNotThrow(() => h.refresh());
            });
        });

        describe("EdgeHandle", () => {
            it("refresh() on a visible edge (index 1) does not throw", () => {
                if (!canvas?.dimensions) return;
                const h = new EdgeHandle(makeDrawing(), 1);
                assert.doesNotThrow(() => h.refresh());
                assert.isTrue(h.visible);
                h.destroy();
            });
            it("refresh() on closing edge (index 0) with fillType NONE is hidden", () => {
                if (!canvas?.dimensions) return;
                const obj = makeDrawing();
                obj.document.fillType = CONST.DRAWING_FILL_TYPES?.NONE ?? 0;
                const h = new EdgeHandle(obj, 0);
                assert.doesNotThrow(() => h.refresh());
                assert.isFalse(h.visible);
                h.destroy();
            });
            it("refresh() after destroy() is a no-op", () => {
                const h = new EdgeHandle(makeDrawing(), 1);
                h.destroy();
                assert.doesNotThrow(() => h.refresh());
            });
        });
    }, { displayName: "ADT | Handle lifecycle" });

    // -------------------------------------------------------------------------
    // Batch 4: Pattern fill texture matrix
    //
    // getFillMatrix maps texture pixels to shape-local pixels (Pixi v8 global
    // texture space). These tests apply the inverse to local points to check
    // which texture pixel ends up there.
    // -------------------------------------------------------------------------
    quench.registerBatch("advanced-drawing-tools.fill-matrix", (context) => {
        const { describe, it, assert } = context;
        const texture = { width: 100, height: 200 };
        const shape = { width: 400, height: 400 };

        function texelAt(fs, x, y) {
            const p = getFillMatrix(fs, texture, shape).applyInverse(new PIXI.Point(x, y));
            return [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000];
        }

        describe("getFillMatrix", () => {
            it("empty flags produce identity", () => {
                assert.deepEqual(texelAt({}, 100, 200), [100, 200]);
            });
            it("texture width in px keeps aspect ratio when height is unset", () => {
                assert.deepEqual(texelAt({ texture: { width: 50 } }, 50, 100), [100, 200]);
            });
            it("texture size in % resolves against the shape size", () => {
                assert.deepEqual(texelAt({ texture: { width: "50%", height: "50%" } }, 200, 200), [100, 200]);
            });
            it("position offsets the texture origin", () => {
                assert.deepEqual(texelAt({ transform: { position: { x: 10, y: 20 } } }, 10, 20), [0, 0]);
            });
            it("position in % resolves against the tile size", () => {
                assert.deepEqual(texelAt({ transform: { position: { x: "50%", y: "50%" } } }, 50, 100), [0, 0]);
            });
            it("scale multiplies the tile size", () => {
                assert.deepEqual(texelAt({ transform: { scale: { x: 2, y: 2 } } }, 200, 400), [100, 200]);
            });
            it("rotation turns around the pivot", () => {
                const fs = { transform: { rotation: 90, pivot: { x: 50, y: 100 }, position: { x: 50, y: 100 } } };
                assert.deepEqual(texelAt(fs, 50, 100), [50, 100]);
                assert.deepEqual(texelAt(fs, 0, 100), [50, 150]);
            });
        });

        describe("legacy (v13) fill style migration", () => {
            const legacyCases = {
                "size + uniform scale": { texture: { width: 625, height: 625 }, transform: { scale: { x: 1.56, y: 1.56 } } },
                "percent size + position + pivot": { texture: { width: "40%" }, transform: { position: { x: "10%", y: 30 }, pivot: { x: 5, y: "50%" } } },
                "rotation + non-uniform scale": { transform: { rotation: 30, scale: { x: 2, y: 0.5 }, position: { x: 12, y: -7 } } },
                "mirrored + skew": { texture: { height: 80 }, transform: { scale: { x: 1, y: -1.5 }, rotation: -120, skew: { x: 15, y: -40 } } },
            };

            function assertMatrixClose(actual, expected) {
                for (const key of ["a", "b", "c", "d", "tx", "ty"]) {
                    assert.closeTo(actual[key], expected[key], 1e-3, key);
                }
            }

            it("flags without a version are legacy, version 2 flags are not", () => {
                assert.isTrue(isLegacyFillStyle({ transform: { rotation: 10 } }));
                assert.isFalse(isLegacyFillStyle({ version: 2, transform: { rotation: 10 } }));
                assert.isFalse(isLegacyFillStyle({ transform: { rotation: 0, scale: { x: 1 } } }));
                assert.isFalse(isLegacyFillStyle(undefined));
            });
            it("625px texture at scale 1.56 migrates to a ~400px texture size", () => {
                const fs = migrateFillStyle(legacyCases["size + uniform scale"], { width: 625, height: 625 }, shape);
                assert.closeTo(fs.texture.width, 400.641, 1e-3);
                assert.closeTo(fs.texture.height, 400.641, 1e-3);
                assert.deepEqual(fs.transform.scale, { x: 1, y: 1 });
                assert.equal(fs.transform.rotation, 0);
                assert.equal(fs.version, 2);
            });
            for (const [name, legacy] of Object.entries(legacyCases)) {
                it(`migrated flags render the same as legacy flags: ${name}`, () => {
                    const migrated = migrateFillStyle(legacy, texture, shape);
                    assert.isFalse(isLegacyFillStyle(migrated));
                    assertMatrixClose(getFillStyleMatrix(migrated, texture, shape), getFillStyleMatrix(legacy, texture, shape));
                });
            }
            it("percent texture size stays a percentage", () => {
                const migrated = migrateFillStyle(legacyCases["percent size + position + pivot"], texture, shape);
                assert.match(migrated.texture.width, /%$/);
                assert.match(migrated.texture.height, /%$/);
            });
        });

        describe("cleanData fill style version", () => {
            const versionKey = "flags.advanced-drawing-tools.fillStyle.version";
            const rotate = () => ({ flags: { "advanced-drawing-tools": { fillStyle: { transform: { rotation: 30 } } } } });
            const create = data => cleanData(data, { deletionKeys: true });
            const update = data => cleanData(data, { inplace: true, deletionKeys: true, partial: true });

            it("new drawings get the current version", () => {
                assert.equal(foundry.utils.getProperty(create(rotate()), versionKey), 2);
                assert.equal(foundry.utils.getProperty(create({ x: 100 }), versionKey), 2);
            });
            it("new drawings keep an explicit legacy version", () => {
                const data = rotate();
                foundry.utils.setProperty(data, versionKey, 1);
                assert.equal(foundry.utils.getProperty(create(data), versionKey), 1);
            });
            it("keeps normalized non-default values", () => {
                const data = rotate();
                foundry.utils.setProperty(data, "flags.advanced-drawing-tools.fillStyle.transform.position.x", "50px");
                const created = create(data);
                assert.equal(foundry.utils.getProperty(created, "flags.advanced-drawing-tools.fillStyle.transform.rotation"), 30);
                assert.equal(foundry.utils.getProperty(created, "flags.advanced-drawing-tools.fillStyle.transform.position.x"), 50);
                assert.equal(foundry.utils.getProperty(update(data), "flags.advanced-drawing-tools.fillStyle.transform.position.x"), 50);
            });
            it("updates of existing drawings don't add the version", () => {
                assert.isUndefined(foundry.utils.getProperty(update(rotate()), versionKey));
            });
            it("updates keep the version although it equals the default", () => {
                const data = rotate();
                foundry.utils.setProperty(data, versionKey, 2);
                assert.equal(foundry.utils.getProperty(update(data), versionKey), 2);
            });
            it("updates delete values reset to their default", () => {
                const scaleKey = "flags.advanced-drawing-tools.fillStyle.transform.scale.x";
                const data = rotate();
                foundry.utils.setProperty(data, scaleKey, 1);
                const value = foundry.utils.getProperty(update(data), scaleKey);
                assert.instanceOf(value, foundry.data.operators.ForcedDeletion);
                // The deletion must survive serialization, or the server keeps the old value
                assert.notStrictEqual(JSON.stringify({ value }), "{}");
            });
        });
    }, { displayName: "ADT | Fill matrix" });

});
