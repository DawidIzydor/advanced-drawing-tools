## Foundry VTT v14 Support

This release brings compatibility with Foundry VTT v14 (PixiJS v8).

### What's new

- **Full v14 compatibility** — migrated all rendering code from PixiJS v7 to v8. The `PIXI.Graphics` API was completely rewritten (`lineStyle`/`beginFill`/`endFill` replaced with `fill`/`stroke`), dialog API updated (`Dialog` → `DialogV2`), and all v7-specific internals removed.
- **Edit mode rewrite** — handle drag/hover events (`_onHandleHoverIn/Out`, `_onHandleDragStart/Move/Drop`) were removed in v14. Replaced with self-contained pointer event handlers on each `PointHandle` and `EdgeHandle` instance, covering drag, right-click vertex deletion, and Escape to cancel.
- **Grid snapping** — `DrawingsLayer.gridPrecision` removed in v14; replaced with a `getSnappedPoint` MIXED wrapper.
- **Texture compatibility** — `PIXI.Texture(baseTexture)` → `new PIXI.Texture({ source })`, `PIXI.MeshMaterial` → `PIXI.MeshSimpleMaterial ?? PIXI.MeshMaterial`, gradient constant `PIXI.TEXT_GRADIENT.LINEAR_VERTICAL` → `0`.

### Known regressions

- **Dashed stroke lines** — the dashed line UI has been temporarily hidden. The previous implementation relied on `PIXI.smooth.DashLineShader`, which is v7-only and does not exist in PixiJS v8. A replacement using manual `moveTo`/`lineTo` loops was implemented but produces rendering artefacts; the control is hidden until this is resolved.
- **Pattern fill transform** — the texture transform controls (size, position, pivot, scale, rotation) have been temporarily hidden. The v7 implementation used `drawing.shape.geometry.graphicsData` and `tileTransform.setFromMatrix`, both removed in v8. The current v8 path drives `tileScale`/`tilePosition`/`tileRotation` on the TilingSprite but the pivot approximation is incorrect; the controls are hidden until the pivot math is fixed.
