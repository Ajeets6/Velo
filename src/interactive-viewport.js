const DEFAULT_SCENE_SIZE = [800, 500];

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function createViewport(scene = {}, pixelWidth, pixelHeight) {
  const requestedSize = Array.isArray(scene.size) ? scene.size : DEFAULT_SCENE_SIZE;
  const worldWidth = Math.max(1, finiteNumber(requestedSize[0], DEFAULT_SCENE_SIZE[0]));
  const worldHeight = Math.max(1, finiteNumber(requestedSize[1], DEFAULT_SCENE_SIZE[1]));
  const camera = scene.camera || {};
  const requestedCenter = Array.isArray(camera.center) ? camera.center : [0, 0];
  const centerX = finiteNumber(requestedCenter[0], 0);
  const centerY = finiteNumber(requestedCenter[1], 0);
  const zoom = Math.max(0.1, finiteNumber(camera.zoom, 1));
  const width = Math.max(1, finiteNumber(pixelWidth, 1));
  const height = Math.max(1, finiteNumber(pixelHeight, 1));
  const scale = Math.min(width / worldWidth, height / worldHeight) * zoom;

  return {
    scale,
    point(x, y) {
      return [
        width / 2 + (finiteNumber(x, centerX) - centerX) * scale,
        height / 2 - (finiteNumber(y, centerY) - centerY) * scale,
      ];
    },
  };
}

