import test from "node:test";
import assert from "node:assert/strict";
import { createViewport } from "../src/interactive-viewport.js";

test("interactive viewport places world origin at the canvas center", () => {
  const viewport = createViewport({ size: [800, 500], camera: { center: [0, 0], zoom: 1 } }, 640, 360);
  assert.deepEqual(viewport.point(0, 0), [320, 180]);
  assert.deepEqual(viewport.point(400, 250), [608, 0]);
  assert.deepEqual(viewport.point(-400, -250), [32, 360]);
});

test("interactive viewport respects camera center and zoom", () => {
  const viewport = createViewport({ size: [800, 500], camera: { center: [100, -50], zoom: 2 } }, 800, 500);
  assert.deepEqual(viewport.point(100, -50), [400, 250]);
  assert.deepEqual(viewport.point(200, 0), [600, 150]);
});

