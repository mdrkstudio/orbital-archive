import { createKelpSurface } from './kelp-surface.js';
import * as THREE from 'three';

// Three discontinuous banks frame an open channel. Width grows with camera
// distance, so far vegetation cannot accidentally close the projected corridor.
export function createGardenDepth({ mobile = false } = {}) {
  let seed = 70193;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const positions = [], colors = [];
  const layers = [
    { z: -13, count: mobile ? 8 : 16, span: 13, tint: [0.0015, 0.016, 0.015] },
    { z: -26, count: mobile ? 10 : 22, span: 21, tint: [0.001, 0.012, 0.015] },
    { z: -43, count: mobile ? 12 : 28, span: 29, tint: [0.001, 0.009, 0.012] }
  ];
  const vertex = (p, tint) => { positions.push(...p); colors.push(...tint); };
  function ribbon(path, width, tint, tapered = true) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const inv = 1 / Math.max(.001, Math.hypot(dx, dy));
      const wa = width * (tapered ? Math.pow(Math.sin(Math.PI * (i + .2) / path.length), .65) : 1);
      const wb = width * (tapered ? Math.pow(Math.sin(Math.PI * (i + 1) / path.length), .65) : 1);
      const aa = [a[0] - dy * inv * wa, a[1] + dx * inv * wa, a[2]];
      const ab = [a[0] + dy * inv * wa, a[1] - dx * inv * wa, a[2]];
      const ba = [b[0] - dy * inv * wb, b[1] + dx * inv * wb, b[2]];
      const bb = [b[0] + dy * inv * wb, b[1] - dx * inv * wb, b[2]];
      for (const p of [aa, ab, ba, ab, bb, ba]) vertex(p, tint);
    }
  }
  const plants = [];
  layers.forEach((layer, layerIndex) => {
    for (let n = 0; n < layer.count; n++) {
      const side = n % 2 ? 1 : -1;
      const z = layer.z - random() * 7;
      const gap = (20 - z) * .052;
      // Uneven groups and varied heights avoid an evenly spaced picket fence.
      const x = side * (gap + Math.pow(random(), 1.65) * layer.span);
      const base = -18 - random() * 8;
      const height = 22 + random() * 24;
      const phase = random() * 6.28;
      const lean = (random() - .5) * 2.8;
      const scale = .65 + random() * .85;
      const tint = layer.tint.map(c => c * (.65 + random() * .5));
      plants.push({ x, z, height, layer: layerIndex, gap });
      const at = t => [
        side * Math.max(gap, Math.abs(x + Math.sin(t * 9 + phase) * scale + lean * t)),
        base + height * t,
        z + Math.sin(t * 7 + phase) * .7
      ];
      const trunk = Array.from({ length: 55 }, (_, i) => at(i / 54));
      ribbon(trunk, .028 * scale, tint, false);
      const nodes = mobile ? 28 : 45;
      for (let i = 0; i < nodes; i++) {
        const t = .04 + random() * .91;
        const root = at(t);
        const direction = random() > .5 ? 1 : -1;
        const reach = (.5 + random() * 1.8) * scale;
        const rise = (random() - .25) * 2;
        const path = [];
        for (let j = 0; j <= 15; j++) {
          const u = j / 15;
          const px = root[0] + direction * reach * Math.sin(u * 2.2);
          path.push([side * Math.max(gap - .35, side * px), root[1] + rise * u - u * u * .8,
            root[2] + Math.sin(u * 3 + phase) * u * .4]);
        }
        ribbon(path, (.035 + random() * .095) * scale, tint);
        // Fine alternating leaflets make the middle distance read as thickets.
        for (let j = 3; j < 14; j += 2) {
          const rootlet = path[j];
          const flip = j % 4 === 1 ? 1 : -1;
          const length = (.18 + random() * .4) * scale;
          const sprig = Array.from({ length: 7 }, (_, k) => {
            const u = k / 6;
            return [rootlet[0] + direction * u * length * .65,
              rootlet[1] + flip * Math.sin(u * 2.1) * length,
              rootlet[2] + u * .12];
          });
          ribbon(sprig, .025 * scale, tint);
        }
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const scaffold=new THREE.Mesh(geometry);
  const points=createKelpSurface(scaffold,{
    uTime:{value:0},uOpacity:{value:1},uPixelRatio:{value:1}
  },mobile,true);
  geometry.dispose();scaffold.material.dispose();
  points.material.userData.baseOpacity=1;
  points.name='Point-only distant vegetation';
  points.userData.layers=layers.length;
  points.userData.plants=plants;
  return points;
}
