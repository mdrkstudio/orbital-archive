import * as THREE from 'three';
import { attachPointDepth } from './point-depth.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// An asymmetric, scalloped membrane. The large and small waves are anatomical:
// they repeat through the lip, radial petals and vessels below instead of
// reading as noise painted over a sphere.
export function bellSurface(q, theta) {
  q = Math.max(.00001, Math.min(1, q));
  const phi = Math.pow(q, .88) * 1.53;
  const edge = Math.pow(q, 3.45);
  const primary = Math.cos(theta * 10 + .2 * Math.sin(theta * 3));
  const secondary = Math.sin(theta * 5 - .45) * Math.cos(theta * 2 + .2);
  const radius = 2.22 * Math.pow(Math.sin(phi), .79) *
    (1 + q * (.055 * Math.sin(theta - .55) + .032 * secondary) + edge * (.072 * primary + .026 * Math.cos(theta * 20)));
  return new THREE.Vector3(
    Math.cos(theta) * radius,
    Math.cos(phi) * 1.16 + (1 - q) * .15 - edge * (.25 + .17 * (.5 + .5 * primary)) + Math.sin(theta + .6) * q * .105,
    Math.sin(theta) * radius * (.79 + .055 * Math.cos(theta - .7))
  );
}

function surfaceNormal(sample, u, v, epsilon = .0008) {
  const du = sample(u + epsilon, v).sub(sample(u - epsilon, v));
  const dv = sample(u, v + epsilon).sub(sample(u, v - epsilon));
  return dv.cross(du).normalize();
}

function oralFrame(arm, t) {
  const phase = arm / 7 * TAU + .22;
  const length = [4.65, 3.15, 4.1, 3.55, 4.85, 3.85, 3.2][arm];
  const lateral = [-.82, .05, .92, 1.28, -.35, .6, -1.25][arm];
  const depth = [.35, -.62, .16, -.4, .7, -.85, -.3][arm];
  const center = new THREE.Vector3(
    lateral * (.32 + Math.sin(t * Math.PI * .72)) + Math.sin(t * 5 + phase) * t * .25 - t * t * .85,
    -.18 - t * length,
    depth + Math.cos(t * 4.1 + phase) * t * .22
  );
  const twist = -.35 + (arm % 3) * .32 + t * (2.3 + arm % 2 * .65);
  const across = new THREE.Vector3(Math.cos(twist), .07 * Math.sin(t * 9 + phase), Math.sin(twist));
  const normal = new THREE.Vector3(-Math.sin(twist), 0, Math.cos(twist));
  const width = (.17 + .43 * Math.pow(Math.sin(Math.PI * Math.max(.001, Math.min(.999, t))), .62)) * (1 - t * .21);
  return { center, across, normal, width, phase };
}

export function oralSurface(arm, t, across) {
  const frame = oralFrame(arm, t);
  const edge = Math.pow(Math.abs(across), 2.4);
  const pleat = Math.sin(t * (34 + arm * 3) + across * 4.7 + frame.phase) * .105 * (.12 + edge);
  return frame.center
    .addScaledVector(frame.across, across * frame.width * (1 + Math.sin(t * 38 + arm) * .12))
    .addScaledVector(frame.normal, pleat + Math.sin(across * Math.PI) * .13)
    .add(new THREE.Vector3(0, Math.cos(t * 36 + across * 3 + arm) * .03 * (.25 + edge), 0));
}

function mantleSurface(lobe, t, across) {
  const phase = lobe / 8 * TAU + .1;
  const twist = phase + t * (1.2 + (lobe % 2) * .65);
  const center = new THREE.Vector3(
    Math.cos(phase) * (.15 + t * .32) + Math.sin(t * 3.8 + phase) * t * .15,
    .5 - t * (1.72 + (lobe % 3) * .13),
    Math.sin(phase) * (.12 + t * .26)
  );
  const span = (.26 + Math.sin(t * Math.PI) * .36) * (1 - t * .16);
  const side = new THREE.Vector3(Math.cos(twist), .08 * Math.sin(t * 7 + phase), Math.sin(twist));
  const normal = new THREE.Vector3(-Math.sin(twist), 0, Math.cos(twist));
  const edge = Math.pow(Math.abs(across), 2.2);
  return center.addScaledVector(side, across * span)
    .addScaledVector(normal, Math.sin(t * 41 + across * 4 + lobe) * (.025 + edge * .105));
}

export function createJellyfish({ mobile = false, pixelRatio = 1, viewportHeight = 940, seed = 91 }) {
  const random = rng(seed);
  const capacity = mobile ? 360000 : 980000;
  const positions = new Float32Array(capacity * 3);
  const normals = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const flow = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  let count = 0;

  function point(p, n, color, size, t, phase, kind) {
    if (count >= capacity) return;
    positions.set([p.x, p.y, p.z], count * 3);
    normals.set([n.x, n.y, n.z], count * 3);
    colors.set(color, count * 3);
    flow.set([t, phase, kind], count * 3);
    sizes[count++] = size * (kind < .5 ? 1.1 : 1.55);
  }

  const membraneCandidates = mobile ? 56000 : 125000;
  // Importance sampling in surface coordinates, not uniform noise in a volume.
  // Dense, overlapping patches form tissue; less dense areas remain translucent.
  for (let sample = 0; sample < membraneCandidates; sample++) {
    // Low-discrepancy candidates avoid the accidental clumps and empty
    // pixels produced by independently random positions at this scale.
    const q = (sample + .5) / membraneCandidates;
    const theta = (sample * 2.399963229728653 + random() * .001) % TAU;
    const p = bellSurface(q, theta);
    const radialFiber = Math.pow(.5 + .5 * Math.cos(theta * 30 + q * 4.2), 18);
    const petal = Math.pow(.5 + .5 * Math.cos(theta * 10 + .2 * Math.sin(theta * 3)), 4);
    const tissue = .5 + .5 * Math.sin(q * 31 + Math.sin(theta * 5) * 1.8);
    const pleats = Math.max(radialFiber * (.18 + q * .82), petal * Math.pow(q, 1.7) * .56);
    const density = .28 + tissue * .24 + petal * .18 + radialFiber * .22;
    if (random() > density) continue;
    const n = surfaceNormal(bellSurface, q, theta);
    const grain = .83 + random() * .25;
    point(p, n, [tissue, pleats, grain], .64 + random() * .24, q, theta, 0);
  }

  // The rolled lip has thickness, folds and branching capillaries, not a ring line.
  const lipCount = mobile ? 5500 : 11500;
  for (let i = 0; i < lipCount; i++) {
    const theta = random() * TAU;
    const t = random();
    const p = bellSurface(.86 + t * .14, theta);
    p.multiply(new THREE.Vector3(.98, 1, .98));
    p.y -= .018 + Math.sin(t * Math.PI) * .05;
    const n = surfaceNormal(bellSurface, .86 + t * .139, theta);
    const lobe = .5 + .5 * Math.cos(theta * 10 + .2 * Math.sin(theta * 3));
    point(p, n, [.015 + lobe * .06, .13 + random() * .08, .9 + lobe * .09], .42 + random() * .19, .94, theta, 1);
  }

  // Radial fibers fan from the core and split before reaching the living lip.
  // This makes the umbrella anatomy legible before the granular surface.
  for (let vessel = 0; vessel < 30; vessel++) {
    const baseAngle = vessel / 30 * TAU;
    const steps = mobile ? 130 : 280;
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      const q = .17 + t * .82;
      const theta = baseAngle + Math.sin(t * 4.2 + vessel) * .027 + Math.sin(t * 17) * .006;
      const p = bellSurface(q, theta);
      p.multiply(new THREE.Vector3(.955, .87, .955));
      p.y -= .08 + t * .09;
      const purple = vessel % 5 === 0 ? .12 : .006;
      point(p, new THREE.Vector3(0, 0, 1), [purple, .13 + t * .13, .93], .28 + random() * .18, q, theta, 2);
      if (step > steps * .48 && step % 3 === 0) {
        for (const side of [-1, 1]) {
          const branchT = (t - .48) / .52;
          const branchAngle = theta + side * branchT * (.035 + (vessel % 3) * .012);
          const bp = bellSurface(q, branchAngle).multiply(new THREE.Vector3(.95, .865, .95));
          bp.y -= .1 + t * .08;
          point(bp, new THREE.Vector3(0, 0, 1), [.018, .14, .94], .24 + random() * .13, q, branchAngle, 2);
        }
      }
    }
  }

  // Fine seams outline the ten overlapping bell plates. They are intentionally
  // ordered curves, not extra surface noise: at normal viewing distance they
  // create the layered, wet anatomical read of the reference.
  for (let petal = 0; petal < 10; petal++) {
    const base = petal / 10 * TAU + .03;
    for (const side of [-1, 1]) {
      const tracks = mobile ? 2 : 3;
      for (let track = 0; track < tracks; track++) {
        const steps = mobile ? 115 : 245;
        for (let step = 0; step < steps; step++) {
          const t = step / (steps - 1);
          const q = .1 + t * .885;
          const span = (.12 + t * .12) * Math.sin(Math.max(.001, t) * Math.PI) ** .35;
          const theta = base + side * span + side * track * .006 + Math.sin(t * 5 + petal) * .012;
          const p = bellSurface(q, theta).multiply(new THREE.Vector3(.966 - track * .006, .91 - track * .008, .966 - track * .006));
          p.y -= .055 + t * .08;
          const violet = petal % 3 === 0 ? .19 : .035;
          point(p, new THREE.Vector3(0, 0, 1), [violet, .16 + t * .15, .98],
            .25 + random() * .12, q, theta, 2);
        }
      }
    }
  }

  // Subtle transverse growth lines bind the radial seams into a membrane
  // instead of letting the dome read as a set of isolated spokes.
  for (const q of [.3, .48, .65, .79, .9]) {
    const steps = mobile ? 420 : 940;
    for (let step = 0; step < steps; step++) {
      const theta = step / steps * TAU;
      const p = bellSurface(q, theta).multiply(new THREE.Vector3(.972, .92, .972));
      p.y -= .055 + q * .065;
      const pulse = Math.pow(.5 + .5 * Math.cos(theta * 10), 9);
      point(p, new THREE.Vector3(0, 0, 1), [.025 + pulse * .11, .1 + pulse * .12, .78 + pulse * .2],
        .22 + random() * .11, q, theta, 2);
    }
  }

  // Short uneven cilia hang from the scalloped lip and make its silhouette
  // tactile. They stop well above the long tentacles, so the hierarchy stays
  // clean even as the edge gains detail.
  const cilia = mobile ? 28 : 46;
  for (let strand = 0; strand < cilia; strand++) {
    const theta = strand / cilia * TAU + Math.sin(strand * 1.7) * .018;
    const root = bellSurface(.995, theta).multiply(new THREE.Vector3(.985, 1, .985));
    const steps = mobile ? 34 : 72;
    const length = .16 + (strand % 5) * .055;
    for (let step = 0; step < steps; step++) {
      const t = step / (steps - 1);
      const p = root.clone();
      p.x += Math.sin(t * 3.7 + strand) * t * .035;
      p.y -= .04 + t * length;
      p.z += Math.cos(t * 3.3 + strand) * t * .025;
      point(p, new THREE.Vector3(0, 0, 1), [strand % 7 === 0 ? .2 : .025, .12 + (1 - t) * .09, .9],
        .23 + (1 - t) * .11, t, theta, 4);
    }
  }

  // Broad inner petals sit under the membrane. They are separated into ten
  // radial plates, so the structure remains readable even without glow.
  const petalRows = mobile ? 65 : 110;
  const petalWidth = mobile ? 8 : 14;
  for (let petal = 0; petal < 10; petal++) {
    const base = petal / 10 * TAU + .03;
    for (let row = 0; row < petalRows; row++) {
      const t = (row + .4) / petalRows;
      const q = .11 + t * .82;
      const span = (.12 + t * .12) * Math.sin(t * Math.PI) ** .35;
      for (let col = 0; col < petalWidth; col++) {
        const across = (col + random()) / petalWidth * 2 - 1;
        const theta = base + across * span + Math.sin(t * 5 + petal) * .012;
        const p = bellSurface(q, theta).multiply(new THREE.Vector3(.91, .82, .91));
        p.y -= .12 + Math.sin(t * Math.PI) * (.3 + (petal % 2) * .065);
        const edge = Math.pow(Math.abs(across), 2.4);
        point(p, new THREE.Vector3(0, 0, 1),
          [.008 + edge * .055 + (petal % 3 === 0 ? .075 : 0), .12 + (1 - edge) * .13, .91 + edge * .08],
          .4 + random() * .18, q, base, 2);
      }
    }
  }

  const coreCount = mobile ? 3400 : 8800;
  for (let i = 0; i < coreCount; i++) {
    const theta = random() * TAU;
    const phi = Math.acos(random() * 2 - 1);
    const radius = .46 * (.68 + random() * .32) * (1 + Math.cos(theta * 6) * .16);
    const p = new THREE.Vector3(Math.sin(phi) * Math.cos(theta) * radius,
      .12 + Math.cos(phi) * radius * .88, Math.sin(phi) * Math.sin(theta) * radius * .84);
    point(p, p.clone().normalize(), [.012 + Math.cos(theta * 3) ** 2 * .055, .15, .96], .38 + random() * .23, 0, theta, 2);
  }

  // The mantle bridges the dome and the hanging anatomy with eight overlapping
  // folded sheets. This removes the abrupt "helmet plus thin bones" transition.
  const mantleRows = mobile ? 65 : 115;
  const mantleWidth = mobile ? 12 : 19;
  for (let lobe = 0; lobe < 8; lobe++) {
    const sample = (t, v) => mantleSurface(lobe, t, v);
    for (let row = 0; row < mantleRows; row++) {
      for (let col = 0; col < mantleWidth; col++) {
        const t = (row + random() * .7) / mantleRows;
        const across = (col + random()) / mantleWidth * 2 - 1;
        const p = sample(t, across);
        const n = surfaceNormal(sample, t, across);
        const edge = Math.pow(Math.abs(across), 2.2);
        point(p, n, [.008 + edge * .055 + (lobe % 3 === 0 ? .08 : 0), .12 + t * .12, .91 + edge * .08],
          .29 + random() * .17, t, lobe / 8 * TAU, 3);
      }
    }
  }

  const armSteps = mobile ? 155 : 245;
  const armWidth = mobile ? 16 : 25;
  for (let arm = 0; arm < 7; arm++) {
    const sample = (t, v) => oralSurface(arm, t, v);
    for (let row = 0; row < armSteps; row++) {
      for (let col = 0; col < armWidth; col++) {
        const t = (row + random() * .8) / armSteps;
        const across = (col + random()) / armWidth * 2 - 1;
        const p = sample(t, across);
        const n = surfaceNormal(sample, t, across);
        const edge = Math.pow(Math.abs(across), 3);
        const accentArm = arm % 3 === 0;
        const magenta = (accentArm ? .14 : .006) + edge * .065;
        point(p, n, [magenta, (accentArm ? .11 : .22) + edge * .14, .9 + edge * .09],
          .47 + random() * .2, t, arm / 7 * TAU, 3);
      }
    }

    // Individually attached pinnules make each oral arm a feathery volume.
    const featherRoots = mobile ? 40 : 72;
    const featherSteps = mobile ? 8 : 12;
    for (let root = 0; root < featherRoots; root++) {
      const t = .05 + root / featherRoots * .91;
      const frame = oralFrame(arm, t);
      for (const side of [-1, 1]) {
        const anchor = oralSurface(arm, t, side);
        const length = (.09 + random() * .2) * (.52 + Math.sin(t * Math.PI));
        for (let step = 0; step < featherSteps; step++) {
          const s = step / (featherSteps - 1);
          const p = anchor.clone().addScaledVector(frame.across, side * s * length)
            .addScaledVector(frame.normal, Math.sin(s * 2.6 + root * .34) * s * .055);
          p.y -= s * .055 + Math.sin(s * Math.PI) * .018;
          point(p, frame.normal, [.012 + s * .035 + (arm % 3 === 0 ? .12 : 0), (arm % 3 === 0 ? .08 : .16) + s * .1, .92 + s * .07],
            .43 + random() * .16, t, arm / 7 * TAU, 3);
        }
      }
    }

    // One clear edge and sparse cross-veins retain the broad sheet silhouette
    // without the closely spaced parallel lines that produced moving moiré.
    for (const side of [-1, 1]) {
      for (const inset of [1]) {
        const edgeSteps = mobile ? 140 : 260;
        for (let step = 0; step < edgeSteps; step++) {
          const t = step / (edgeSteps - 1);
          const p = oralSurface(arm, t, side * inset);
          const frame = oralFrame(arm, t);
          const accent = arm % 3 === 0;
          point(p, frame.normal, [accent ? .24 : .035, accent ? .08 : .19, .99],
            .27 + (1 - t) * .08, t, arm / 7 * TAU, 5);
        }
      }
    }
    const veinRows = mobile ? 10 : 18;
    const veinSteps = mobile ? 10 : 16;
    for (let vein = 1; vein < veinRows; vein++) {
      const t = vein / veinRows;
      for (let step = 0; step < veinSteps; step++) {
        const across = step / (veinSteps - 1) * 1.76 - .88;
        const p = oralSurface(arm, t, across);
        const frame = oralFrame(arm, t);
        const edge = Math.pow(Math.abs(across), 2.4);
        point(p, frame.normal, [.025 + edge * .11, .13 + edge * .12, .88 + edge * .11],
          .24 + random() * .08, t, arm / 7 * TAU, 5);
      }
    }

    // Each heavy oral arm forks into thinner secondary ribbons. They remain
    // tied to the same frame, so the branching reads as anatomy, not garnish.
    for (let branch = 0; branch < 1; branch++) {
      const rootT = .24 + branch * .19 + (arm % 2) * .025;
      const root = oralFrame(arm, rootT);
      const direction = branch % 2 ? 1 : -1;
      const branchSteps = mobile ? 105 : 210;
      const branchWidth = mobile ? 3 : 5;
      for (let step = 0; step < branchSteps; step++) {
        const t = step / (branchSteps - 1);
        for (let col = 0; col < branchWidth; col++) {
          const across = (col / Math.max(1, branchWidth - 1) - .5) * (1 - t) * .12;
          const p = root.center.clone()
            .addScaledVector(root.across, direction * t * (.5 + branch * .16) + across)
            .addScaledVector(root.normal, Math.sin(t * 7 + arm + branch) * t * .16);
          p.y -= t * (.82 + branch * .34) + Math.sin(t * Math.PI) * .13;
          point(p, root.normal, [branch === 2 ? .19 : .012, branch === 2 ? .045 : .13 + branch * .025, .94], .26 + random() * .13,
            rootT + t * .2, arm + branch * .41, 3);
        }
      }
    }
  }

  const strandCount = 26;
  const strandSteps = mobile ? 170 : 300;
  for (let strand = 0; strand < strandCount; strand++) {
    const angle = strand / strandCount * TAU + .12;
    const root = bellSurface(.99, angle);
    const phase = strand * 1.83;
    const length = 4.3 + strand % 7 * .44;
    for (let step = 0; step < strandSteps; step++) {
      const t = step / strandSteps;
      const p = root.clone();
      p.x += Math.sin(t * (4.2 + strand % 3) + phase) * t * (.48 + strand % 4 * .12) + t * t * (((strand % 3) - 1) * .24 - .8);
      p.y -= t * length;
      p.z += Math.cos(t * (4.7 + strand % 4 * .45) + phase) * t * (.35 + strand % 3 * .1);
      const accentStrand = strand % 6 === 0;
      const purple = accentStrand ? .17 : .006 + strand % 3 * .008;
      point(p, new THREE.Vector3(0, 0, 1), [purple, (accentStrand ? .045 : .12) + strand % 4 * .025, .82 + (1 - t) * .17],
        .23 + (1 - t) * .18 + (strand % 5 === 0 ? .08 : 0), t, phase, 4);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, count * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(0, count * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors.slice(0, count * 3), 3));
  geometry.setAttribute('aFlow', new THREE.BufferAttribute(flow.slice(0, count * 3), 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes.slice(0, count), 1));
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += .3;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 1 }, uEnergy: { value: 1 },
      uPixelRatio: { value: pixelRatio },
      uViewportHeight: { value: viewportHeight },
    },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aFlow;
      uniform float uTime, uOpacity, uPixelRatio, uEnergy, uViewportHeight;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = aFlow.x;
        float kind = aFlow.z;
        if (kind < 2.5) {
          float breath = sin(uTime * .9) * .032;
          p.xz *= 1.0 + breath * (.25 + t * .75);
          p.y += breath * (.5 - t) * .7;
        } else {
          p.x += sin(uTime * .64 - t * 5.0 + aFlow.y) * t * t * .17;
          p.z += cos(uTime * .5 - t * 4.0 + aFlow.y) * t * .12;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec3 view = normalize(-mv.xyz);
        float facing = dot(n, view);
        vec3 light = normalize(vec3(-.65, .8, .65));
        float diffuse = kind > 2.5 ? abs(dot(n, light)) : max(0.0, dot(n, light));
        float rim = pow(1.0 - abs(facing), 2.8);
        float highlight = pow(max(0.0, dot(reflect(-light, n), view)), 38.0);
        float opticalDepth = 1.0 - abs(facing);
        float spatialViolet = smoothstep(-.42, .72, n.x - n.z * .34 + position.x * .08);
        float structuralViolet = kind < .5 ? color.g : color.r;
        float violet = clamp(spatialViolet * .12 + structuralViolet * .82 + opticalDepth * .04, 0.0, 1.0);
        vec3 pigment = mix(vec3(.001, .065, 1.0), vec3(.22, .006, .8), violet);
        float cyan = pow(diffuse, 5.0) * pow(max(.0, 1.0 - opticalDepth), 2.0);
        pigment = mix(pigment, vec3(.015, .5, 1.0), cyan * .68);
        vColor = pigment * (.27 + diffuse * .34 + rim * .15);
        float tissueEnergy = 1.0;
        if (kind < .5) {
          // Energy follows radial fibers and petals; the quieter membrane falls
          // back to deep blue instead of becoming one uniformly glowing shell.
          float fiber = smoothstep(.28, .82, color.g);
          tissueEnergy = (.72 + color.r * .15 + fiber * .52) * color.b;
          float transmitted = pow(max(0.0, dot(n, normalize(vec3(-.5, .32, .8)))), 16.0);
          vColor += pigment * fiber * .21;
          vColor += vec3(.01, .15, .38) * transmitted * (.18 + fiber * .42);
          vColor += vec3(.1, .32, .62) * highlight * .12;
        } else {
          vColor = mix(color, pigment, .28) * (.58 + diffuse * .4) + pigment * rim * .16;
        }
        if (kind > 2.5) {
          float layers = mix(.16, 1.0, smoothstep(-.5, .5, position.z));
          vColor *= layers;
          if (kind > 4.5) vColor = mix(vColor, color, .62) * 1.18;
        }
        float back = kind < 1.5 ? mix(.13, 1.0, smoothstep(-.2, .34, facing)) : 1.0;
        float depth = max(0.0, -mv.z - 15.0);
        float attenuation = exp(-depth * .027);
        float diameter = aSize * uPixelRatio * 72.0 * (uViewportHeight / 940.0) / max(2.0, -mv.z);
        // Hardware rasterizes a minimum of one pixel. Preserve subpixel energy
        // instead of enlarging every distant speck into an equally bright dot.
        float filteredSize = clamp(diameter, 2.0, 4.2 * uPixelRatio);
        float coverage = min(1.0, diameter * diameter / (filteredSize * filteredSize));
        float strength = kind < .5 ? .36 : kind < 1.5 ? .61 : kind < 2.5 ? .5 : kind > 4.5 ? .72 : kind > 3.5 ? .54 - t * .15 : .54;
        vAlpha = uOpacity * back * attenuation * coverage * strength * tissueEnergy;
        // Compensate for absorptive compositing with saturated emitted colour,
        // not extra overlapping particles or a broad white bloom.
        vColor *= 1.3 + uEnergy * .035;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = filteredSize;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float radius = length(gl_PointCoord - .5);
        if (radius > .5) discard;
        // A readable grain with a solid centre and antialiased edge, not a
        // broad Gaussian veil. MSAA handles the boundary without whole-frame blur.
        float aa = max(fwidth(radius) * .65, .035);
        float disc = (1.0 - smoothstep(.42 - aa, .42 + aa, radius)) * (1.0 - radius * .35);
        vec3 energy = clamp(vColor, 0.0, 1.0) * disc * vAlpha;
        gl_FragColor = vec4(energy, disc * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    // Absorptive premultiplied transparency preserves the colour of the front
    // membrane instead of bleaching every overlapping ribbon toward white.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  material.userData.baseOpacity = 1;
  const points = new THREE.Points(geometry, material);
  points.name = 'Jellyfish / continuous point anatomy';
  attachPointDepth(points, { threshold: .22, radius: .25, depthBias: .000002 });
  points.userData.pointCount = count;
  return points;
}
