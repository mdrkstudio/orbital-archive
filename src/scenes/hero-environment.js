import * as THREE from 'three';
import { attachPointDepth } from './point-depth.js';

const TAU = Math.PI * 2;

// The entry scene owns these organisms. Later chapters retain their own garden.
export function createHeroEnvironment({ mobile = false, pixelRatio = 1, viewportHeight = 940 } = {}) {
  let seed = 78301;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const group = new THREE.Group();
  group.name = 'Scene 01 / layered underwater habitat';
  const anchors = [];
  const swimmers = [];
  const positions = [], colors = [], motion = [], sizes = [];
  // Independent sampling stream: thinning must not alter organism placement,
  // animation phases or procedural silhouettes, and is never redone per frame.
  let grainSeed = 42191;
  const add = (x, y, z, color, size, amplitude = 0, phase = 0, kind = 0) => {
    if (kind < 4.5) {
      grainSeed = (Math.imul(grainSeed, 1664525) + 1013904223) >>> 0;
      if (grainSeed / 4294967296 > .52) return;
    }
    positions.push(x, y, z);
    colors.push(...color);
    sizes.push(size * (kind < 4.5 ? 1.38 : 1));
    motion.push(amplitude, phase, kind);
  };
  const flush = (name, x, y, z, scale = 1) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aMotion', new THREE.Float32BufferAttribute(motion, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += .65;
    const object = new THREE.Points(geometry, material);
    object.name = name;
    object.scale.setScalar(scale);
    object.position.set(x, y, z);
    object.userData.anchorX = x;
    object.userData.restY = y;
    object.userData.restZ = z;
    anchors.push(object);
    group.add(object);
    if (z > -16 && !name.includes('water light') && !name.includes('plankton')) {
      attachPointDepth(object);
    }
    positions.length = colors.length = motion.length = sizes.length = 0;
    return object;
  };

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 1 },
      uPixelRatio: { value: pixelRatio }, uViewportHeight: { value: viewportHeight },
    },
    vertexShader: `
      attribute vec3 aMotion;
      attribute float aSize;
      uniform float uTime, uOpacity, uPixelRatio, uViewportHeight;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHaze;
      void main() {
        vec3 p = position;
        vHaze = step(4.5, aMotion.z);
        p.x += sin(uTime * .25 + position.y * .34 + aMotion.y) * aMotion.x;
        p.z += cos(uTime * .2 + position.y * .27 + aMotion.y) * aMotion.x * .35;
        if (aMotion.z > 1.5 && aMotion.z < 2.5) {
          p.y += sin(uTime * .55 + aMotion.y) * .09;
          p.xz *= 1.0 + sin(uTime * .8 + aMotion.y) * .025;
        }
        if (aMotion.z > 2.5 && aMotion.z < 3.5) p.y += sin(uTime * .8 + abs(position.x) * 1.5 + aMotion.y) * abs(position.x) * .17;
        if (aMotion.z > 3.5 && aMotion.z < 4.5) {
          p.y += sin(uTime * 1.15 + aMotion.y) * .065;
          p.z += sin(uTime * 1.7 + aMotion.y) * .035;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = max(0.0, -mv.z - 12.0);
        float fog = exp(-depth * .028);
        float distanceBand = smoothstep(23.0, 52.0, -mv.z);
        float diameter = aSize * uPixelRatio * 50.0 * (uViewportHeight / 940.0) / max(2.0, -mv.z);
        // Distance changes hue, contrast, opacity and grain size together.
        // Far plants remain legible in blue water instead of fading to black.
        float filteredSize = clamp(diameter, 2.0, 3.8 * uPixelRatio);
        float coverage = min(1.0, diameter * diameter / (filteredSize * filteredSize));
        vAlpha = uOpacity * fog * coverage * .82;
        vColor = color * mix(1.8, 2.65, fog);
        vColor = mix(vColor, vColor * vec3(.36, .7, 1.38), distanceBand * .82);
        gl_PointSize = filteredSize;
        // Slow local bioluminescence, with different phases for each colony.
        float pulse = .97 + .03 * sin(uTime * .38 + aMotion.y + position.y * .55);
        vColor *= pulse;
        if (aMotion.z < .5) {
          float colorPocket = .5 + .5 * sin(position.y * 1.3 + position.x * .9 + aMotion.y);
          vColor *= mix(vec3(.22, 1.22, .62), vec3(.32, .78, 1.72), colorPocket);
          // Broken illumination across each crown, not a uniform cyan outline.
          float litCrown = .5 + .5 * sin(position.y * .82 + position.z * 1.4 + aMotion.y);
          vColor *= .78 + .28 * litCrown;
          // Model-view relative depth follows the camera, unlike an arbitrary
          // world-space colour gradient. Rear leaves absorb more light while
          // the near half of a frond catches the local bioluminescence.
          float nearSurface = smoothstep(-.38, .48, mv.z - modelViewMatrix[3].z);
          vColor *= mix(.72, 1.08, nearSurface);
          vAlpha *= mix(.7, 1.0, nearSurface);
        }
        if (aMotion.z > 4.5) {
          gl_PointSize = clamp(diameter, 6.0, 100.0 * uPixelRatio);
          vAlpha = uOpacity * .062 * fog * smoothstep(25.0, 47.0, -mv.z);
        }
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHaze;
      void main() {
        float r = length(gl_PointCoord - .5);
        if (r > .5) discard;
        float aa = max(fwidth(r) * .65, .035);
        float grain = (1.0 - smoothstep(.42 - aa, .42 + aa, r)) * (1.0 - r * .35);
        float haze = exp(-r * r * 9.0) * (1.0 - smoothstep(.4, .5, r));
        float disc = mix(grain, haze, vHaze);
        gl_FragColor = vec4(vColor * vAlpha * disc, vAlpha * disc);
      }
    `,
    transparent: true, depthWrite: false, vertexColors: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor,
    // Premultiplied alpha: front colour absorbs rear colour instead of screen
    // blending everything into the same pale cyan at crossings.
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });

  // Low-opacity, broad point sprites merge into suspended water and shafts.
  // They occupy actual depth planes, so moving creatures pass through the haze.
  for (const [x, y, z, width, height, hue] of [
    [-.48, 1.2, -26, 7.2, 12, 0], [.27, 2.3, -32, 9, 14, 1],
    [.81, -2.7, -18, 5, 7, 0], [-.15, -5.0, -13, 8, 2.7, 1],
  ]) {
    const samples = mobile ? 430 : 1100;
    const phase = random() * TAU;
    for (let i = 0; i < samples; i++) {
      const py = (random() - .5) * height;
      const px = (random() - .5) * width + py * .24;
      const pocket = .55 + .45 * Math.sin(px * .7 + py * .35 + phase);
      add(px, py, (random() - .5) * 3,
        hue ? [.005, .045 * pocket, .17 * pocket] : [.002, .09 * pocket, .14 * pocket],
        24 + random() * 30, .055, phase, 5);
    }
    const haze = flush('Habitat / suspended water light', x, y, z);
    haze.geometry.boundingSphere.radius += 3;
  }

  // Three depth bands and three genuinely different plant families. Repeating
  // one frond generator at different coordinates made the habitat read as a
  // procedural wallpaper rather than an ecosystem.
  const fronds = [
    [-1.03, -7.55, -2, 13.4, 0], [-.77, -7.05, -5, 9.8, 0], [-.48, -7.28, -4, 10.8, 0],
    [.55, -7.0, -5, 9.4, 2], [.99, -7.75, -3, 14.5, 2],
    [-.91, -9.1, -11, 18.4, 0], [-.55, -8.55, -13, 11.8, 2], [.75, -8.75, -10, 13.2, 1], [.43, -9.15, -15, 10.4, 0],
    [-1.07, -11.2, -24, 24.5, 2], [-.67, -12.1, -27, 23.5, 1], [-.2, -11.4, -30, 17.2, 0], [.94, -11.7, -26, 22.8, 1], [.31, -11.1, -25, 15.5, 2],
    [-.61, -7.7, -9, 10.4, 0], [-.3, -7.8, -14, 8.6, 0], [.82, -8.1, -8, 12.7, 0],
    [-.96, -8.5, -14, 16.3, 0], [.61, -8.5, -13, 10.2, 0],
    [-.35, -8.4, -12, 14.2, 0], [-.13, -9.3, -18, 16.8, 1],
    [-.74, -10.2, -19, 21.0, 0], [-.43, -11.0, -24, 23.5, 0],
    [.17, -9.2, -17, 14.5, 0], [.67, -9.0, -16, 18.5, 0],
    [.88, -10.8, -23, 23.2, 2], [-.94, -7.8, -8, 13.0, 1],
    // Cropped near-edge fronds sit in front of the hero's depth plane. Their
    // larger grains and occluding leaf centres establish a real near layer.
    [-1.08, -7.2, 3.0, 10.0, 0], [.98, -7.4, 2.8, 8.7, 0],
  ];
  for (let plant = 0; plant < fronds.length; plant++) {
    const [x, y, z, height, species] = fronds[plant];
    const clarity = z > -8 ? 2.12 : z > -18 ? 1.85 : 1.35;
    const phase = random() * TAU;
    const lean = (random() - .5) * 1.4;
    const center = t => [Math.sin(t * 4 + phase) * t * .5 + lean * t, t * height, Math.sin(t * 5 + phase) * .25];
    if (species === 0) {
      const stemCount = mobile ? 430 : 940;
      for (let i = 0; i < stemCount; i++) {
        const t = random();
        const [cx, cy, cz] = center(t);
        const angle = random() * TAU;
        add(cx + Math.cos(angle) * .035, cy, cz + Math.sin(angle) * .035,
          [.004, .095 * clarity, .105 * clarity], .5, t * t * .3, phase);
      }
      const leaves = 72 + plant % 4 * 12;
      for (let leaf = 0; leaf < leaves; leaf++) {
        const t = .055 + leaf / leaves * .9;
        const [cx, cy, cz] = center(t);
        const angle = leaf * 2.399 + phase;
        const length = (.55 + random() * 1.0) * Math.pow(Math.sin(t * Math.PI), .42);
        const leafCount = mobile ? 62 : 130;
        for (let i = 0; i < leafCount; i++) {
          const u = random();
          const v = (random() * 2 - 1) * .24 * Math.pow(Math.sin(u * Math.PI), .72);
          const light = .35 + .65 * Math.pow(.5 + .5 * Math.sin(angle + u * 3), 2);
          add(cx + Math.cos(angle) * u * length - Math.sin(angle) * v,
            cy + Math.sin(u * 2.8) * length * .22 - u * u * .28,
            cz + Math.sin(angle) * u * length + Math.cos(angle) * v,
            [.004, (.12 + u * .09) * light * clarity, (.12 + u * .14) * light * clarity],
            .58 + random() * .23, t * t * .3 + u * .035, phase);
        }
      }
    } else if (species === 1) {
      // Broad ribbon kelp: fewer forms, larger negative spaces and a heavy
      // cropped silhouette near the edges.
      const blades = 5 + plant % 3;
      const bladeSamples = mobile ? 900 : 2200;
      for (let blade = 0; blade < blades; blade++) {
        const bladePhase = phase + blade * .83;
        const bladeHeight = height * (.56 + random() * .43);
        const bladeWidth = .25 + random() * .34;
        for (let i = 0; i < bladeSamples; i++) {
          const t = random();
          const across = (random() * 2 - 1) * bladeWidth * Math.pow(Math.sin(Math.PI * Math.min(.999, t)), .42);
          const wave = Math.sin(t * (5.2 + blade * .35) + bladePhase) * (.09 + t * .48);
          const edge = Math.pow(Math.abs(across) / bladeWidth, 3);
          add((blade - (blades - 1) * .5) * .16 + wave + across,
            t * bladeHeight - edge * .18,
            Math.cos(t * 4.6 + bladePhase) * t * .28 + across * .15,
            [.004 + edge * .004, (.075 + t * .08 + edge * .035) * clarity, (.07 + t * .12) * clarity],
            .55 + random() * .24, t * t * .42, bladePhase);
        }
      }
    } else {
      // Branching sea fans use open linework rather than leaves. Tips carry a
      // restrained cyan signal and dissolve first in the far layer.
      const trunks = 3 + plant % 2;
      for (let trunk = 0; trunk < trunks; trunk++) {
        const trunkPhase = phase + trunk * 1.7;
        const segments = mobile ? 420 : 980;
        for (let i = 0; i < segments; i++) {
          const t = random();
          const side = (random() * 2 - 1) * .045;
          add((trunk - (trunks - 1) * .5) * .28 + Math.sin(t * 3.2 + trunkPhase) * t * .38 + side,
            t * height * (.72 + trunk * .08), Math.cos(t * 4 + trunkPhase) * t * .24,
            [.004, (.07 + t * .075) * clarity, (.085 + t * .11) * clarity], .48 + random() * .18, t * t * .22, trunkPhase);
        }
        const branches = 12 + plant % 5;
        for (let branch = 0; branch < branches; branch++) {
          const rootT = .12 + branch / branches * .78;
          const direction = branch % 2 ? 1 : -1;
          const cx = (trunk - (trunks - 1) * .5) * .28 + Math.sin(rootT * 3.2 + trunkPhase) * rootT * .38;
          const cy = rootT * height * (.72 + trunk * .08);
          const cz = Math.cos(rootT * 4 + trunkPhase) * rootT * .24;
          const branchLength = (.45 + random() * .7) * Math.sin(rootT * Math.PI) ** .42;
          const steps = mobile ? 95 : 210;
          for (let step = 0; step < steps; step++) {
            const t = step / (steps - 1);
            const fork = Math.sin(t * 3.1 + branch) * t * .12;
            const blade = (random() - .5) * .24 * Math.sin(t * Math.PI);
            add(cx + direction * t * branchLength + fork, cy + t * branchLength * .55 + blade,
              cz + Math.sin(t * 2.7 + trunkPhase) * t * .19,
              [.003, (.055 + t * .065) * clarity, (.085 + t * .11) * clarity], .62 + random() * .17, t * .1, trunkPhase + branch);
          }
        }
      }
    }
    flush(`Habitat / ${species === 0 ? 'feather stem' : species === 1 ? 'ribbon kelp' : 'sea fan'} ${plant + 1}`, x, y, z);
  }

  // A final forest layer consists of thin, broken silhouettes rather than
  // detailed plants. It is deliberately irregular and nearly lost in haze.
  const distantColumns = [-.98, -.82, -.64, -.39, -.08, .17, .38, .59, .79, .96];
  for (let column = 0; column < distantColumns.length; column++) {
    const x = distantColumns[column] + (random() - .5) * .055;
    const z = -19 - (column % 4) * 3.1;
    const y = -10.7 - (column % 3) * .7;
    const height = 17 + (column % 5) * 1.9;
    const phase = random() * TAU;
    const stemSamples = mobile ? 380 : 920;
    for (let i = 0; i < stemSamples; i++) {
      const t = random();
      const width = .025 + random() * .035;
      add(Math.sin(t * 3.1 + phase) * t * .34 + (random() - .5) * width,
        t * height, Math.cos(t * 2.6 + phase) * t * .17,
        [.002, .05 + t * .025, .082 + t * .05], .42 + random() * .16, t * t * .18, phase);
    }
    const forks = 9 + column % 5;
    for (let fork = 0; fork < forks; fork++) {
      const root = .18 + fork / forks * .7;
      const direction = fork % 2 ? 1 : -1;
      const steps = mobile ? 45 : 105;
      for (let step = 0; step < steps; step++) {
        const t = step / (steps - 1);
        const reach = Math.pow(t, .78) * (.3 + root * .38);
        const bx = Math.sin(root * 3.1 + phase) * root * .34 + direction * reach;
        const by = root * height + t * (.34 + root * .52) + Math.sin(t * Math.PI) * (.22 + root * .31);
        const bz = Math.cos(root * 2.6 + phase) * root * .17 + Math.sin(t * 2.4 + phase) * .08;
        add(bx, by, bz,
          [.002, .052 + t * .025, .088 + t * .055], .4 + random() * .14, t * .05, phase + fork);
      }

      // Sparse secondary needles dissolve the mechanical ladder silhouette of
      // the far trunks without spending foreground-level geometry.
      const sprays = mobile ? 3 : 6;
      const spraySteps = mobile ? 10 : 22;
      for (let spray = 1; spray <= sprays; spray++) {
        const t = spray / (sprays + 1);
        const reach = Math.pow(t, .78) * (.3 + root * .38);
        const bx = Math.sin(root * 3.1 + phase) * root * .34 + direction * reach;
        const by = root * height + t * (.34 + root * .52) + Math.sin(t * Math.PI) * (.22 + root * .31);
        const bz = Math.cos(root * 2.6 + phase) * root * .17 + Math.sin(t * 2.4 + phase) * .08;
        for (const side of [-1, 1]) {
          for (let step = 0; step < spraySteps; step++) {
            const u = step / (spraySteps - 1);
            const needle = (.055 + root * .055) * Math.sin(u * Math.PI) ** .45;
            add(bx + direction * u * .055 + side * needle, by + u * (.09 + root * .08), bz + side * u * .035,
              [.002, .052 + u * .03, .09 + u * .055], .38 + random() * .12, u * .03, phase + fork + spray);
          }
        }
      }
    }
    flush(`Habitat / distant column ${column + 1}`, x, y, z);
  }

  // A continuous but irregular seabed closes the bottom of the frame. Each
  // mound is a separate LOD object, so the near layer can stay rich while the
  // distant silhouettes remain cheap and fog-softened.
  const seabed = [
    [-.94, -6.35, -2, 2.8, 2.25], [-.58, -6.05, -5, 2.45, 1.5], [-.17, -6.55, -8, 2.8, 2.3],
    [.25, -6.18, -7, 2.65, 1.7], [.63, -6.6, -4, 2.9, 2.55], [.98, -6.15, -3, 2.5, 1.65],
    [-.72, -6.3, -17, 4.2, 2.1], [0, -6.25, -21, 4.8, 1.7], [.76, -6.2, -16, 4.1, 2.15],
  ];
  for (let patch = 0; patch < seabed.length; patch++) {
    const [x, y, z, width, height] = seabed[patch];
    const phase = random() * TAU;
    const bedPoints = mobile ? 2500 : 6200;
    for (let i = 0; i < bedPoints; i++) {
      const px = (random() * 2 - 1) * width;
      const falloff = Math.pow(Math.max(0, 1 - Math.abs(px) / width), .48);
      const py = random() * height * falloff;
      const pz = (random() * 2 - 1) * width * .28;
      const mottled = .55 + .45 * Math.sin(px * 2.7 + pz * 4.1 + phase);
      add(px, py, pz, [.005, (.075 + mottled * .07), (.1 + mottled * .145)],
        .52 + random() * .28, py * .025, phase);
    }
    const tufts = mobile ? 12 : 24;
    const leafSteps = mobile ? 44 : 86;
    for (let tuft = 0; tuft < tufts; tuft++) {
      const rootX = (random() * 2 - 1) * width * .94;
      const rootZ = (random() * 2 - 1) * width * .2;
      const length = height * (.22 + random() * .62);
      const angle = -1.55 + random() * 3.1;
      const baseY = random() * height * .28;
      for (let step = 0; step < leafSteps; step++) {
        const t = step / (leafSteps - 1);
        const curl = Math.sin(t * 3.6 + phase + tuft) * t * .13;
        add(rootX + Math.sin(angle) * t * length * .25 + curl,
          baseY + Math.sin(t * Math.PI) * length * (.4 + random() * .18) - t * t * length * .08,
          rootZ + Math.cos(angle) * t * length * .13,
          [.004, .1 + t * .09, .14 + t * .13], .56 + random() * .2,
          t * t * .14, phase + tuft * .37);
      }
    }
    flush(`Habitat / seabed ${patch + 1}`, x, y, z);
  }

  // Dense rounded colonies bridge the low seabed and the tall ferns. Their
  // uneven crowns create the missing middle silhouette instead of a flat band.
  const colonies = [
    [-.82, -5.62, -3, 1.55, 1.1], [-.5, -5.42, -6, 1.36, 1.34],
    [-.16, -5.74, -10, 1.72, 1.02], [.28, -5.58, -8, 1.5, 1.25],
    [.59, -5.48, -4, 1.65, 1.34], [.9, -5.66, -6, 1.32, 1.06],
  ];
  for (let colony = 0; colony < colonies.length; colony++) {
    const [x, y, z, width, height] = colonies[colony];
    const phase = random() * TAU;
    const lobes = 5 + colony % 3;
    const samples = mobile ? 3400 : 8200;
    for (let i = 0; i < samples; i++) {
      const lobe = Math.floor(random() * lobes);
      const angle = (lobe / lobes) * TAU + phase;
      const crownX = Math.cos(angle) * width * (.16 + random() * .42);
      const crownY = height * (.25 + random() * .55);
      const theta = random() * TAU;
      const r = Math.pow(random(), .58);
      const rx = width * (.16 + lobe % 2 * .035);
      const ry = height * (.23 + (lobe + 1) % 2 * .055);
      const px = crownX + Math.cos(theta) * rx * r;
      const py = Math.max(0, crownY + Math.sin(theta) * ry * r);
      const pz = (random() * 2 - 1) * width * .22;
      const crest = Math.pow(Math.max(0, py / height), 1.35);
      const sparkle = .55 + .45 * Math.sin(theta * 4 + lobe + phase);
      add(px, py, pz,
        [.005 + crest * .007, .095 + crest * .16, .16 + crest * .27 * sparkle],
        .55 + random() * .32, .025 + crest * .055, phase + lobe * .61);
    }
    flush(`Habitat / moss colony ${colony + 1}`, x, y, z);
  }

  // Compact coral plumes break the smooth moss band into asymmetric crowns.
  // Their curved branches and luminous buds are deliberately clustered rather
  // than tiled, giving the eye clear near/midground landmarks.
  const coralPlumes = [
    [-.73, -5.7, -2.6, 1.45, 2.75, .25], [-.36, -5.72, -7, 1.15, 2.15, 1.7],
    [.34, -5.68, -6, 1.28, 2.45, 3.1], [.74, -5.78, -3.4, 1.52, 2.9, 4.65],
  ];
  for (let plume = 0; plume < coralPlumes.length; plume++) {
    const [x, y, z, width, height, phase] = coralPlumes[plume];
    const branches = 15 + plume * 2;
    for (let branch = 0; branch < branches; branch++) {
      const spread = branch / Math.max(1, branches - 1) * 2 - 1;
      const branchHeight = height * (.48 + random() * .5) * (1 - Math.abs(spread) * .16);
      const branchWidth = width * spread * (.52 + random() * .38);
      const bend = (random() - .5) * width * .36;
      const steps = mobile ? 78 : 180;
      for (let step = 0; step < steps; step++) {
        const t = step / (steps - 1);
        const waviness = Math.sin(t * (4.2 + plume * .4) + phase + branch) * t * .055;
        const px = branchWidth * Math.pow(t, .82) + bend * t * t + waviness;
        const py = branchHeight * t + Math.sin(t * Math.PI) * height * (.08 + Math.abs(spread) * .035);
        const pz = Math.sin(spread * 2.6 + t * 2.1 + phase) * width * .12 * t;
        const tip = Math.pow(t, 4.5);
        add(px, py, pz, [.004 + tip * .012, .12 + tip * .22, .16 + tip * .34],
          .5 + random() * .18, t * t * .11, phase + branch * .37);
      }

      const budSamples = mobile ? 92 : 230;
      for (let i = 0; i < budSamples; i++) {
        const a = random() * TAU;
        const r = Math.pow(random(), .7) * (.07 + random() * .055);
        const px = branchWidth + bend + Math.cos(a) * r;
        const py = branchHeight + Math.sin(a) * r * .7;
        const pz = Math.sin(spread * 2.6 + 2.1 + phase) * width * .12 + (random() - .5) * r;
        const hot = Math.pow(random(), 3);
        add(px, py, pz, [.008 + hot * .022, .2 + hot * .19, .3 + hot * .31],
          .52 + random() * .2, .07, phase + branch * .37);
      }
    }
    flush(`Habitat / coral plume ${plume + 1}`, x, y, z);
  }

  // Layered reef fans provide the second scale of detail missing from the
  // earlier blockout: every crown contains trunks, curved branches and paired
  // leaf sprays. Their placements intentionally overlap the dark moss band.
  const reefFans = [
    [-.9, -6.05, -1.8, 1.7, 4.9, .4], [-.46, -5.95, -4.8, 1.55, 4.15, 2.1],
    [.43, -6.08, -5.8, 1.45, 4.45, 3.7], [.83, -6.0, -2.4, 1.75, 5.15, 5.2],
  ];
  for (let fan = 0; fan < reefFans.length; fan++) {
    const [x, y, z, width, height, phase] = reefFans[fan];
    const trunks = 2 + fan % 2;
    for (let trunk = 0; trunk < trunks; trunk++) {
      const trunkLean = (trunk - (trunks - 1) * .5) * width * .18 + (random() - .5) * .16;
      const trunkHeight = height * (.78 + random() * .21);
      const trunkSteps = mobile ? 190 : 430;
      for (let step = 0; step < trunkSteps; step++) {
        const t = step / (trunkSteps - 1);
        add(trunkLean * Math.pow(t, .82) + Math.sin(t * 4.1 + phase + trunk) * t * .1,
          t * trunkHeight, Math.cos(t * 3.4 + phase + trunk) * t * .08,
          [.004, .1 + t * .08, .14 + t * .12], .46 + random() * .16, t * t * .16, phase + trunk);
      }

      const branchCount = 10 + fan * 2;
      for (let branch = 0; branch < branchCount; branch++) {
        const root = .16 + branch / branchCount * .72;
        const side = branch % 2 ? 1 : -1;
        const reach = width * (.24 + random() * .42) * Math.sin(root * Math.PI) ** .38;
        const lift = height * (.08 + random() * .09);
        const branchSteps = mobile ? 64 : 138;
        for (let step = 0; step < branchSteps; step++) {
          const t = step / (branchSteps - 1);
          const bx = trunkLean * root + side * reach * Math.pow(t, .76) + Math.sin(t * 4.5 + branch) * t * .035;
          const by = root * trunkHeight + lift * t + Math.sin(t * Math.PI) * height * .035;
          const bz = Math.sin(root * 4 + phase) * .08 + Math.sin(t * 3 + phase + branch) * t * .07;
          add(bx, by, bz, [.004, .13 + t * .11, .19 + t * .18], .43 + random() * .15,
            t * .075, phase + branch * .43);
        }

        const leafPairs = mobile ? 4 : 8;
        const leafSteps = mobile ? 12 : 25;
        for (let leaf = 1; leaf <= leafPairs; leaf++) {
          const t = leaf / (leafPairs + 1);
          const bx = trunkLean * root + side * reach * Math.pow(t, .76) + Math.sin(t * 4.5 + branch) * t * .035;
          const by = root * trunkHeight + lift * t + Math.sin(t * Math.PI) * height * .035;
          const bz = Math.sin(root * 4 + phase) * .08 + Math.sin(t * 3 + phase + branch) * t * .07;
          const leafLength = (.055 + Math.sin(t * Math.PI) * .105) * (1 + fan * .05);
          for (const leafSide of [-1, 1]) {
            for (let step = 0; step < leafSteps; step++) {
              const u = step / (leafSteps - 1);
              const curl = Math.sin(u * Math.PI) * leafLength * .22;
              add(bx + side * u * leafLength * .35 + leafSide * u * leafLength,
                by + u * leafLength * .45 + curl, bz + leafSide * u * leafLength * .24,
                [.006, .17 + u * .11, .24 + u * .2], .41 + random() * .14,
                u * .06, phase + branch + leaf * .17);
            }
          }
        }
      }
    }
    flush(`Habitat / layered reef fan ${fan + 1}`, x, y, z);
  }

  // Small benthic rosettes turn the seabed into a habitat when viewed between
  // the larger silhouettes. Each has its own petal count, broken rings and
  // brightness, avoiding the repeated-dot carpet of the earlier version.
  const rosettes = [
    [-.94, -5.82, -4, .42, 11], [-.79, -5.9, -7, .31, 14], [-.63, -5.68, -5, .38, 9],
    [-.42, -5.86, -9, .29, 13], [-.24, -5.7, -6, .46, 12], [-.05, -5.93, -11, .34, 15],
    [.16, -5.76, -7, .41, 10], [.34, -5.92, -10, .3, 14], [.54, -5.72, -5, .44, 11],
    [.72, -5.9, -8, .33, 16], [.89, -5.74, -4, .4, 12],
  ];
  for (let rosette = 0; rosette < rosettes.length; rosette++) {
    const [x, y, z, radius, petals] = rosettes[rosette];
    const phase = random() * TAU;
    const samples = mobile ? 820 : 1900;
    for (let i = 0; i < samples; i++) {
      const theta = random() * TAU;
      const radial = Math.pow(random(), .62);
      const petal = Math.pow(.5 + .5 * Math.cos(theta * petals + phase), 4);
      const brokenRing = Math.pow(.5 + .5 * Math.sin(radial * 31 + phase), 8);
      const r = radius * radial * (1 + petal * .16);
      const px = Math.cos(theta) * r;
      const py = Math.sin(radial * Math.PI) * radius * (.12 + petal * .18);
      const pz = Math.sin(theta) * r * .62;
      const glow = Math.max(petal * .72, brokenRing * .45) * (1 - radial * .38);
      add(px, py, pz, [.012 + glow * .028, .11 + glow * .22, .2 + glow * .35],
        .43 + random() * .17, .025, phase, 1);
    }
    flush(`Habitat / benthic rosette ${rosette + 1}`, x, y, z);
  }

  // Cropped rock shelves anchor the foreground. They stay darker than the
  // organisms, but their layered contours stop the lower edge feeling flat.
  for (const [x, y, z, width, height, phase] of [
    [-1.04, -6.05, .8, 3.6, 1.65, .4], [.98, -6.18, .5, 4.05, 1.82, 2.1],
  ]) {
    const samples = mobile ? 5200 : 13800;
    for (let i = 0; i < samples; i++) {
      const angle = random() * Math.PI;
      const layer = random();
      const radius = .45 + layer * .55;
      const px = Math.cos(angle) * width * radius;
      const py = Math.sin(angle) * height * radius + Math.sin(px * 2.2 + phase) * .12;
      const pz = (random() * 2 - 1) * width * .24 - layer * .3;
      const stratum = Math.pow(.5 + .5 * Math.sin(py * 8.5 + px * 1.4 + phase), 7);
      add(px, py, pz, [.018 + stratum * .055, .035 + stratum * .045, .11 + stratum * .19],
        .5 + random() * .24, .012, phase);
    }
    flush('Habitat / foreground rock shelf', x, y, z);
  }

  // Loose particulate curtains occupy the gaps between silhouettes. Each band
  // lives at a different depth and contrast, turning black voids into water.
  const particulateBands = [
    [-.58, -1.1, -9, 3.2, 6.8], [.18, .4, -15, 4.1, 7.6],
    [.72, -1.8, -20, 3.7, 6.3], [-.12, 1.6, -28, 5.4, 8.8],
  ];
  for (let band = 0; band < particulateBands.length; band++) {
    const [x, y, z, width, height] = particulateBands[band];
    const phase = random() * TAU;
    const samples = mobile ? 1800 : 5200;
    for (let i = 0; i < samples; i++) {
      const px = (random() * 2 - 1) * width;
      const py = (random() * 2 - 1) * height;
      const lane = Math.pow(.5 + .5 * Math.sin(px * 1.7 + py * .46 + phase), 5);
      if (random() > .18 + lane * .58) continue;
      const pz = (random() * 2 - 1) * 2.2;
      add(px, py, pz, [.003, .039 + lane * .052, .072 + lane * .078],
        .32 + random() * .38, .018 + lane * .016, phase);
    }
    flush(`Habitat / particulate veil ${band + 1}`, x, y, z);
  }

  // Small bioluminescent vesicles stay attached to their tendrils.
  for (const [x, y, z, radius] of [[-.68, 3.05, -9, .62], [-.38, -.15, -12, .48], [.76, -.65, -8, .61], [-.86, -1.8, -4, .45]]) {
    const phase = random() * TAU;
    const samples = mobile ? 1700 : 4200;
    for (let i = 0; i < samples; i++) {
      const theta = random() * TAU, phi = Math.acos(random() * 2 - 1);
      const ribs = Math.pow(.5 + .5 * Math.cos(theta * 9 + phi * 1.7), 8);
      const glow = .18 + ribs * .82;
      add(Math.sin(phi) * Math.cos(theta) * radius, Math.cos(phi) * radius * 1.15,
        Math.sin(phi) * Math.sin(theta) * radius, [.008, .4 * glow, .57 * glow], .66, .07, phase, 1);
    }
    for (let strand = 0; strand < 4; strand++) {
      for (let i = 0; i < 220; i++) {
        const t = i / 220;
        add(Math.sin(strand * 2 + t * 3) * (.08 + t * .2), -radius - t * 4.5, Math.cos(strand * 2) * .1,
          [.003, .06, .072], .48, .07 + t * .1, phase, 1);
      }
    }
    // Raised ribs and interrupted cross-rings give the vesicles an organic
    // cage, keeping the shell much darker than its cyan seams.
    for (let rib = 0; rib < 9; rib++) {
      const theta = rib / 9 * TAU;
      const steps = mobile ? 75 : 155;
      for (let step = 0; step < steps; step++) {
        const phi = .06 + step / (steps - 1) * (Math.PI - .12);
        const twist = theta + Math.sin(phi * 2.1 + phase) * .1;
        add(Math.sin(phi) * Math.cos(twist) * radius * 1.02,
          Math.cos(phi) * radius * 1.15, Math.sin(phi) * Math.sin(twist) * radius * 1.02,
          [.008, .33, .7], .82, .07, phase, 1);
      }
    }
    flush('Habitat / cyan vesicle', x, y, z);
  }

  // Attached seed clusters provide small pools of green/cyan light between
  // the large blue organisms. Uneven spacing avoids a row of floating bulbs.
  for (const [x, y, z, scale] of [
    [-.52, -.2, -5, 1], [-.81, -2.2, -6, .72], [.72, -1.65, -7, .9],
    [-.36, -3.35, -11, .7], [.92, .4, -12, .8], [.5, -3.9, -4, .8],
  ]) {
    const phase = random() * TAU;
    const pods = 7 + Math.floor(random() * 6);
    for (let pod = 0; pod < pods; pod++) {
      const angle = pod * 2.399;
      const cx = Math.cos(angle) * (.11 + random() * .2);
      const cy = pod / pods * .8;
      const cz = Math.sin(angle) * .23;
      const radius = .065 + random() * .05;
      const samples = mobile ? 90 : 210;
      for (let i = 0; i < samples; i++) {
        const theta = random() * TAU;
        const phi = Math.acos(random() * 2 - 1);
        const edge = .45 + .55 * Math.sin(phi);
        add(cx + Math.sin(phi) * Math.cos(theta) * radius, cy + Math.cos(phi) * radius * 1.4,
          cz + Math.sin(phi) * Math.sin(theta) * radius,
          [.016 * edge, .3 * edge, (.21 + pod % 3 * .09) * edge], .66, .06, phase, 1);
      }
      for (let i = 0; i < 40; i++) {
        const t = i / 39;
        add(cx * t, cy - (1 - t) * .22, cz * t, [.003, .1, .09], .55, .06, phase, 1);
      }
    }
    flush('Habitat / luminous seed cluster', x, y, z, scale);
  }

  // Low-detail bell silhouettes at different distances, not smaller copies
  // paying the full million-point hero cost.
  for (const [x, y, z, scale, variant] of [
    [-.84, -3.63, .4, 1.65, 0], [.88, -3.77, .2, 1.95, 2],
    [-.16, -5.15, -11, 1.08, 1], [.56, 2.6, -24, .7, 3],
    [-.55, 2.15, -19, .48, 4], [.18, -1.1, -28, .38, 1],
  ]) {
    const phase = random() * TAU;
    const near = z > -2;
    const samples = mobile ? 3800 : 9800;
    for (let i = 0; i < samples; i++) {
      const lobes = 8 + variant * 2;
      const theta = random() * TAU;
      if (near) {
        // Foreground organisms are broad radial cups with a dark central
        // opening, not enlarged copies of the swimming bells behind them.
        const radial = .25 + Math.sqrt(random()) * .75;
        const r = radial * (1 + Math.cos(theta * lobes) * .055);
        const crown = Math.sin((radial - .25) / .75 * Math.PI);
        const y = .04 + crown * .29 - Math.pow(radial, 3) * .13;
        const vein = Math.pow(.5 + .5 * Math.cos(theta * (18 + variant * 3)), 18);
        add(Math.cos(theta) * r, y, Math.sin(theta) * r * (.7 + variant * .02),
          [.065 + vein * .19, .025 + vein * .13, .4 + vein * .68],
          .62 + random() * .14, .025, phase, 2);
      } else {
        const q = random();
        const phi = Math.acos(1 - q * 1.2);
        const r = Math.sin(phi) * (1 + Math.cos(theta * lobes) * (.015 + variant * .006));
        const edge = Math.pow(q, 5);
        const vein = Math.pow(.5 + .5 * Math.cos(theta * 28 + q), 22) * q;
        add(Math.cos(theta) * r, Math.cos(phi) * (.36 + variant * .028) - edge * (.08 + variant * .012), Math.sin(theta) * r * (.68 + variant * .025),
          [.055 + edge * .07 + variant * .008, .07 + vein * .2, .34 + vein * .43],
          .56 + variant * .035, .035, phase, 2);
      }
    }
    const ribCount = 16 + variant * 2;
    for (let rib = 0; rib < ribCount; rib++) {
      const theta = rib / ribCount * TAU;
      const steps = mobile ? 55 : 120;
      for (let step = 0; step < steps; step++) {
        const q = step / (steps - 1);
        if (near) {
          const radial = .25 + q * .75;
          const r = radial * (1 + Math.cos(theta * (8 + variant * 2)) * .055);
          const crown = Math.sin(q * Math.PI);
          add(Math.cos(theta) * r, .04 + crown * .29 - Math.pow(radial, 3) * .13,
            Math.sin(theta) * r * (.7 + variant * .02),
            [.16 + (rib % 5 === 0 ? .14 : 0), .055 + q * .06, .88 + q * .24], .7, .018, phase, 2);
        } else {
          const phi = Math.acos(1 - q * 1.2);
          const r = Math.sin(phi) * (1 + Math.cos(theta * (8 + variant * 2)) * .025);
          add(Math.cos(theta) * r, Math.cos(phi) * (.36 + variant * .028) - Math.pow(q, 5) * .1,
            Math.sin(theta) * r * (.68 + variant * .025),
            [.12 + (rib % 5 === 0 ? .12 : 0), .06, .62 + q * .25], .42, .025, phase, 2);
        }
      }
    }
    if (near) {
      // Bright inner rim makes the cup opening readable at a glance.
      const rimSteps = mobile ? 620 : 1500;
      for (let i = 0; i < rimSteps; i++) {
        const theta = i / rimSteps * TAU;
        const jitter = (random() - .5) * .026;
        const radial = .245 + jitter;
        add(Math.cos(theta) * radial, .035 + Math.sin(theta * 4) * .01,
          Math.sin(theta) * radial * (.7 + variant * .02), [.32, .055, .92], .62, .018, phase, 2);
      }
    }
    const tendrils = 12 + variant * 3;
    for (let s = 0; s < tendrils; s++) {
      const theta = s / tendrils * TAU;
      for (let i = 0; i < 90; i++) {
        const t = i / 90;
        add(Math.cos(theta) * (.9 - t * .4) + Math.sin(t * 4 + theta) * t * .2,
          -.17 - t * (.9 + variant * .11 + s % 3 * .24), Math.sin(theta) * .65,
          [.035, .12, .31], .5, t * .06, phase, 2);
      }
    }
    const organism = flush('Habitat / distant jellyfish', x, y, z, scale);
    if (near) organism.rotation.x = .3;
    else swimmers.push({ object: organism, phase, speed: .12, travel: .35, rise: .3, bank: 0 });
  }

  const raySurface = (across, u) => {
    const w = Math.abs(across);
    const front = .48 * Math.exp(-w * w * 12) * (1 - w) + .38 * Math.sin(w * Math.PI);
    const back = -.6 * Math.pow(1 - w, .6) + .46 * Math.sin(w * Math.PI);
    return [across * 1.32, THREE.MathUtils.lerp(front, back, u),
      Math.sin(w * Math.PI) * .16 + Math.pow(w, 3) * .27 + Math.sin(u * Math.PI) * (1 - w) * .1];
  };
  for (const [x, y, z, scale] of [
    [-.75, 1.8, -5, 1.1], [-.47, -2.0, -8, 1.3], [.87, 1.5, -19, 1.02],
    [-.19, -.1, -22, .62], [.76, 4.7, -27, .8], [.13, -3.5, -18, .48],
  ]) {
    const phase = random() * TAU;
    const samples = mobile ? 2800 : 6500;
    for (let i = 0; i < samples; i++) {
      const across = random() * 2 - 1, u = random();
      const w = Math.abs(across);
      const p = raySurface(across, u);
      const vein = Math.pow(.5 + .5 * Math.cos(w * 38 + u * 5), 12);
      add(...p, [.025, .15 + vein * .16, .43 + vein * .25], .69, .025, phase, 3);
    }
    for (let i = 0; i < 280; i++) {
      const t = i / 280;
      add(Math.sin(t * 4.7) * t * .56, -.59 - t * 1.7, .03 + Math.sin(t * 3) * .12,
        [.018, .18, .54], .56, .025, phase, 3);
    }
    const outlineSteps = mobile ? 160 : 360;
    for (let i = 0; i < outlineSteps; i++) {
      const across = i / (outlineSteps - 1) * 2 - 1;
      const w = Math.abs(across);
      for (const side of [-1, 1]) {
        const p = raySurface(across, side < 0 ? 0 : 1);
        add(...p,
          [.025, .28 + (1 - w) * .12, .66], .48, .02, phase, 3);
      }
    }
    const ray = flush('Habitat / distant ray', x, y, z, scale);
    ray.rotation.set(.35, -.08 + phase * .025, x < -.6 ? -.3 : .12);
    swimmers.push({ object: ray, phase, speed: .11 + scale * .025, travel: .7 + scale * .3, rise: .32, bank: ray.rotation.z });
  }

  // Small shoals occupy the water between the plants. Each fish has a tapered
  // body, forked tail and a dim flank; the shoal moves as one loose formation.
  for (const [x, y, z, scale, phase] of [
    [-.29, 2.15, -15, .9, .2], [.64, -.5, -17, .8, 2.5],
    [-.62, -3.25, -6, 1, 4.3], [.1, .2, -30, .78, 1.3],
  ]) {
    const fishCount = mobile ? 13 : 24;
    for (let fish = 0; fish < fishCount; fish++) {
      const cx = (random() - .5) * 3.4;
      const cy = Math.sin(cx * .8 + phase) * .45 + (random() - .5) * .8;
      const cz = (random() - .5) * 1.7;
      const length = .07 + random() * .09;
      const fishPhase = phase + fish * .43;
      const samples = mobile ? 65 : 140;
      for (let i = 0; i < samples; i++) {
        const t = random() * 2 - 1;
        const angle = random() * TAU;
        const girth = Math.sqrt(Math.max(0, 1 - t * t)) * length * .19;
        const flank = Math.pow(Math.max(0, Math.cos(angle)), 4);
        add(cx + t * length, cy + Math.cos(angle) * girth, cz + Math.sin(angle) * girth * .55,
          [.014 + flank * .02, .12 + flank * .18, .25 + flank * .23], .58 + flank * .15, .025, fishPhase, 4);
      }
      for (let i = 0; i < 35; i++) {
        const t = random();
        add(cx - length - t * length * .48, cy + (random() - .5) * t * length * .7, cz,
          [.013, .17, .34], .54, .025, fishPhase, 4);
      }
    }
    const shoal = flush('Habitat / drifting shoal', x, y, z, scale);
    swimmers.push({ object: shoal, phase, speed: .075, travel: 1.4, rise: .24, bank: 0 });
  }

  const planktonCount = mobile ? 550 : 1300;
  for (let i = 0; i < planktonCount; i++) {
    const phase = random() * TAU;
    const luminous = random() > .94;
    add((random() - .5) * 23, (random() - .5) * 15, -4 - random() * 18,
      luminous ? [.07, .35, .49] : [.008, .065, .13], luminous ? 1.1 : .55,
      .06 + random() * .12, phase, 4);
  }
  const plankton = flush('Habitat / living plankton', 0, 0, 0);
  plankton.geometry.boundingSphere.radius += 1;

  group.userData.material = material;
  group.userData.pointCount = group.children.reduce((total, object) => total + object.geometry.attributes.position.count, 0);
  group.userData.layout = viewWidth => {
    for (const object of anchors) {
      object.position.x = object.userData.anchorX * viewWidth * .5 * (1 - object.position.z / 21);
      object.userData.restX = object.position.x;
    }
  };
  group.userData.update = time => {
    material.uniforms.uTime.value = time;
    for (const { object, phase, speed, travel, rise, bank } of swimmers) {
      const cycle = time * speed + phase;
      object.position.x = object.userData.restX + (Math.sin(cycle) - Math.sin(phase)) * travel;
      object.position.y = object.userData.restY + (Math.cos(cycle * .79) - Math.cos(phase * .79)) * rise;
      object.rotation.z = bank + Math.sin(cycle) * .09;
    }
  };
  return group;
}
