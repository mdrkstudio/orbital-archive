import { createContinuousHabitat } from './scenes/continuous-habitat.js';
import { applyTravelDepth } from './scenes/travel-depth.js';
import { FLIGHT, PANEL_STOPS, SCENE_STOPS, clampProgress, flightFov, flightState, wheelTravel, panelPresentation } from './flight-path.js';
import { createCoveScene } from './scenes/cove-scene.js';
import { gardenSwimGLSL } from './scenes/garden-motion.js';
import { gardenAtmosphereGLSL } from './scenes/garden-atmosphere.js';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createJellyfish } from './scenes/jellyfish.js';
import { createHeroEnvironment } from './scenes/hero-environment.js';
import './style.css';
import { createKelpForest } from './scenes/kelp-forest.js';
import { createGardenDepth } from './scenes/garden-depth.js';
import { createGardenRelief } from './scenes/garden-relief.js';
import { createGardenCages } from './scenes/garden-cages.js';
import { createGardenMembranes, capPoint, gardenOralPoint } from './scenes/garden-membranes.js';
import { createGardenCapsules, capsulePoint } from './scenes/garden-capsules.js';

const PROJECTS = [
  { client: 'AURORA / FINTECH', title: 'NEON EQUITY', number: '01', colors: ['#092f2b', '#c7dc8d', '#9bc4c8'] },
  { client: 'SFERA / CULTURE', title: 'SOUND MATTER', number: '02', colors: ['#121f35', '#7399d4', '#557a72'] },
  { client: 'KINETIC / AI LAB', title: 'SYNTH GARDEN', number: '03', colors: ['#102c24', '#76aa45', '#58a7a4'] },
  { client: 'POLAR / CLIMATE', title: 'ZERO HORIZON', number: '04', colors: ['#132331', '#9ab8c9', '#d3b788'] }
];

let viewportWidth = innerWidth;
let viewportHeight = innerHeight;
const isMobile = viewportWidth < 760;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// The water field supports several habitat layers. It stays subordinate to the
// hero organism, but must remain visible enough to establish real depth.
const particleCount = isMobile ? 7200 : 18800;
const canvas = document.querySelector('#webgl');

// Scene edges are multisampled in sceneTarget. The final canvas receives one
// fullscreen image, so a second MSAA framebuffer adds cost without edge detail.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setSize(viewportWidth, viewportHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1 : 1.3));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .92;

const scene = new THREE.Scene();
const deepSeaColor = new THREE.Color(0x061d29);
const introSeaColor = new THREE.Color(0x092c40);
const gardenSeaColor = new THREE.Color(0x032c34);
const treeSeaColor = new THREE.Color(0x091d35);
const deepFogColor = new THREE.Color(0x083441);
const gardenFogColor = new THREE.Color(0x07606c);
scene.background = deepSeaColor.clone();
scene.fog = new THREE.FogExp2(0x083441, .017);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;

const camera = new THREE.PerspectiveCamera(flightFov(viewportWidth/viewportHeight,isMobile), viewportWidth / viewportHeight, .1, 120);
camera.position.set(0, 0, isMobile ? 23 : 21);
scene.add(camera);

// Smooth point coverage and depth edges before bloom, not only the final image.
const heroSamples = Math.min(isMobile ? 2 : 4, renderer.capabilities.maxSamples);
const sceneTarget = new THREE.WebGLRenderTarget(viewportWidth, viewportHeight, {
  type: THREE.HalfFloatType, samples: heroSamples, resolveDepthBuffer: false,
});
const composer = new EffectComposer(renderer, sceneTarget);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(viewportWidth, viewportHeight);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(viewportWidth, viewportHeight),
  isMobile ? .48 : .62,
  .72,
  .48
);
composer.addPass(bloomPass);
bloomPass.blendMaterial.depthTest=false;
bloomPass.blendMaterial.depthWrite=false;
// Convert accumulated light without a whole-frame softening pass. Individual
// grains have antialiased edges and the scene target is already multisampled.
const heroOutput = new OutputPass();
heroOutput.material.depthTest=false;
heroOutput.material.depthWrite=false;
composer.addPass(heroOutput);
// Garden-only finishing: no frame history or temporal blur.
const gardenGrade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 }, uEncode: { value: true } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount; uniform bool uEncode; varying vec2 vUv;
    void main(){
      vec4 source=texture2D(tDiffuse,vUv);
      vec3 c=source.rgb;
      float luma=dot(c,vec3(.2126,.7152,.0722));
      float shadow=1.-smoothstep(.03,.42,luma);
      c*=mix(vec3(1.02,1.,.97),vec3(.83,1.015,1.045),shadow);
      c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,1.06);
      c=max(vec3(0.),c*1.035-.0015);
      vec2 edge=(vUv-.5)*vec2(1.,.8);
      c*=1.-smoothstep(.22,.64,length(edge))*.17;
      gl_FragColor=vec4(mix(source.rgb,c,uAmount),source.a);
      if(uEncode){ gl_FragColor=linearToOutputTexel(gl_FragColor); }
    }`
});
composer.addPass(gardenGrade);

scene.add(new THREE.HemisphereLight(0x7396ad, 0x061910, 1.08));
const cameraLight = new THREE.PointLight(0xc7efff, 31, 44, 1.8);
cameraLight.position.set(3, 5, 8);
camera.add(cameraLight);
const violetLight = new THREE.PointLight(0x7048ff, 42, 38, 1.8);
violetLight.position.set(-7, 2, 4);
scene.add(violetLight);
const mossLight = new THREE.PointLight(0x65e88f, 28, 34, 1.9);
mossLight.position.set(7, -5, 1);
scene.add(mossLight);
const jellyCoreLight = new THREE.PointLight(0x7547ff, 52, 30, 2);
jellyCoreLight.position.set(.9, 1.4, .2);
scene.add(jellyCoreLight);

const world = new THREE.Group();
scene.add(world);
const clock = new THREE.Clock();

function seeded(seed) {
  let value = seed;
  return () => {
    value = Math.sin(value * 91.731 + 18.413) * 43758.5453;
    return value - Math.floor(value);
  };
}

function spriteTexture() {
  const bitmap = document.createElement('canvas');
  bitmap.width = bitmap.height = 128;
  const ctx = bitmap.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.16, 'rgba(255,255,255,.95)');
  gradient.addColorStop(.48, 'rgba(255,255,255,.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(bitmap);
}

const particleMap = spriteTexture();

function sampleEllipsoid(random, centre, radius, shell = false) {
  const phi = random() * Math.PI * 2;
  const cosTheta = random() * 2 - 1;
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const r = shell ? .72 + random() * .32 : Math.pow(random(), .42);
  return [
    centre[0] + Math.cos(phi) * sinTheta * radius[0] * r,
    centre[1] + cosTheta * radius[1] * r,
    centre[2] + Math.sin(phi) * sinTheta * radius[2] * r
  ];
}

function createIntroField(count) {
  const random = seeded(4.2);
  const positions = new Float32Array(count * 3);
  const reefClusters = isMobile ? [
    [[-4.2, 1.1, -1.6], [2.7, 4.1, 2.2]], [[4.2, .8, -1.8], [2.8, 4.4, 2.3]],
    [[0, -4.5, .2], [5.8, 2.0, 2.5]]
  ] : [
    [[-10.2, 2.1, -2.4], [3.8, 5.5, 2.6]], [[-8.2, -2.1, -.3], [4.2, 3.4, 2.8]],
    [[-4.8, -4.5, .6], [4.8, 2.2, 2.5]], [[0, -5.2, -.2], [5.5, 2.0, 2.7]],
    [[4.9, -4.2, .5], [4.7, 2.4, 2.5]], [[8.5, -1.5, -1.0], [4.1, 3.7, 2.7]],
    [[10.2, 2.5, -2.5], [3.5, 5.0, 2.5]], [[-4.8, 4.4, -3], [3.2, 2.2, 2.0]],
    [[4.5, 4.5, -3.1], [3.1, 2.0, 2.1]]
  ];
  const vineCount = isMobile ? 13 : 27;
  for (let i = 0; i < count; i++) {
    const choice = random();
    let x, y, z;
    if (choice < .72) {
      const cluster = reefClusters[Math.floor(random() * reefClusters.length)];
      const point = sampleEllipsoid(random, cluster[0], cluster[1], random() > .18);
      x = point[0] + Math.sin(point[1] * 1.7 + i * .019) * .28;
      y = point[1];
      z = point[2] + Math.cos(point[0] * .8) * .34;
    } else if (choice < .94) {
      const blade = Math.floor(random() * vineCount);
      const t = random();
      const baseX = THREE.MathUtils.lerp(isMobile ? -5.5 : -11, isMobile ? 5.5 : 11, blade / Math.max(1, vineCount - 1));
      const height = 3.5 + blade % 8 * .68;
      const thickness = (random() - .5) * (.08 + Math.sin(t * Math.PI) * .32);
      x = baseX + Math.sin(t * 6.2 + blade * .79) * (.12 + t * .5) + thickness;
      y = -5.7 + t * height;
      z = -3.2 + blade % 6 * .8 + Math.cos(t * 5.1 + blade) * .2 + (random() - .5) * .18;
    } else {
      x = (random() - .5) * (isMobile ? 12 : 24);
      y = (random() - .5) * 12;
      z = -7 + random() * 10;
    }
    positions.set([x, y, z], i * 3);
  }
  return positions;
}

function createGardenField(count) {
  const random = seeded(11.7);
  const positions = new Float32Array(count * 3);
  const clusters = isMobile ? [
    [[-3.5, .3, -1], [3.2, 4.6, 2.4]], [[2.9, 1.5, 0], [3.1, 3.8, 2.5]],
    [[0, -3.2, 1], [4.8, 2.2, 2.2]]
  ] : [
    [[-9.2, .2, -2], [3.9, 5.8, 2.7]], [[-5.1, -2.3, 1], [5.4, 3.0, 2.6]],
    [[-1.8, 2.8, -1], [3.3, 4.9, 2.4]], [[2.4, -1.7, 1], [5.3, 3.3, 2.8]],
    [[6.3, 2.5, -2], [3.5, 5.1, 2.4]], [[9.5, -.8, 0], [3.7, 4.0, 2.8]]
  ];
  for (let i = 0; i < count; i++) {
    const cluster = clusters[Math.floor(random() * clusters.length)];
    const point = sampleEllipsoid(random, cluster[0], cluster[1], random() > .28);
    point[0] += Math.sin(point[1] * 1.4 + i * .013) * .34;
    point[2] += Math.cos(point[0] * .72) * .42;
    positions.set(point, i * 3);
  }
  return positions;
}

function createArchiveField(count) {
  const random = seeded(18.3);
  const positions = new Float32Array(count * 3);
  const clusters = [];
  for (let row = 0; row < 7; row++) {
    const y = 4 - row * 3.25;
    clusters.push([
      [Math.sin(row * 1.7) * 3.3, y, Math.cos(row * 1.4) * 1.5],
      [3.2 + (row % 3) * .8, 2.0 + (row % 2) * .8, 2.2]
    ]);
  }
  for (let i = 0; i < count; i++) {
    const cluster = clusters[Math.floor(random() * clusters.length)];
    const point = sampleEllipsoid(random, cluster[0], cluster[1], random() > .46);
    const angle = point[1] * .23;
    point[0] += Math.sin(angle) * 1.2;
    point[2] += Math.cos(angle) * .8;
    positions.set(point, i * 3);
  }
  return positions;
}

function createReleaseField(count) {
  const random = seeded(28.1);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const arm = Math.floor(random() * 17);
    const t = Math.pow(random(), .7);
    const angle = arm / 17 * Math.PI * 2 + t * 1.8;
    const radius = .3 + t * (7 + arm % 5 * .42);
    positions[i * 3] = Math.cos(angle) * radius + 1.2;
    positions[i * 3 + 1] = -2.4 + Math.sin(t * Math.PI) * 3.4 + (random() - .5) * .34;
    positions[i * 3 + 2] = Math.sin(angle) * radius * .62 + (random() - .5) * .52;
  }
  return positions;
}

const introPositions = createIntroField(particleCount);
const gardenPositions = createGardenField(particleCount);
const archivePositions = createArchiveField(particleCount);
const releasePositions = createReleaseField(particleCount);
const seeds = new Float32Array(particleCount);
const seedRandom = seeded(41.9);
for (let i = 0; i < particleCount; i++) seeds[i] = seedRandom();

const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute('position', new THREE.BufferAttribute(introPositions, 3));
particleGeometry.setAttribute('aGarden', new THREE.BufferAttribute(gardenPositions, 3));
particleGeometry.setAttribute('aArchive', new THREE.BufferAttribute(archivePositions, 3));
particleGeometry.setAttribute('aRelease', new THREE.BufferAttribute(releasePositions, 3));
particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

const particleMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uStage: { value: 0 }, uOpacity: { value: 1 },
    uPixelRatio: { value: renderer.getPixelRatio() }, uTexture: { value: particleMap }
  },
  vertexShader: `
    attribute vec3 aGarden; attribute vec3 aArchive; attribute vec3 aRelease; attribute float aSeed;
    varying vec3 vColor; varying float vAlpha;
    uniform float uTime; uniform float uStage; uniform float uOpacity; uniform float uPixelRatio;
    float ease(float t){ return t*t*(3.0-2.0*t); }
    vec3 introColor(float s){
      if(s < .34) return vec3(.12,.38,.16);
      if(s < .62) return vec3(.35,.55,.14);
      if(s < .86) return vec3(.60,.54,.18);
      return vec3(.30,.48,.42);
    }
    vec3 gardenColor(float s){
      if(s < .28) return vec3(.025,.14,.10);
      if(s < .55) return vec3(.045,.21,.14);
      if(s < .82) return vec3(.035,.18,.18);
      return vec3(.045,.24,.29);
    }
    vec3 archiveColor(float s){
      if(s < .30) return vec3(.20,.48,.38);
      if(s < .57) return vec3(.65,.53,.24);
      if(s < .82) return vec3(.24,.52,.60);
      return vec3(.28,.42,.72);
    }
    void main(){
      float stage = clamp(uStage, 0.0, 3.0); vec3 p; float m;
      if(stage < 1.0){ m=ease(stage); p=mix(position,aGarden,m); vColor=mix(introColor(aSeed),gardenColor(aSeed),m); }
      else if(stage < 2.0){ m=ease(stage-1.0); p=mix(aGarden,aArchive,m); vColor=mix(gardenColor(aSeed),archiveColor(aSeed),m); }
      else { m=ease(stage-2.0); p=mix(aArchive,aRelease,m); vColor=mix(archiveColor(aSeed),vec3(.56,.62,.66),m); }
      float living = 1.0-smoothstep(2.9,3.2,stage);
      float drift = uTime*(.07 + aSeed*.12);
      p.x += sin(drift+p.y*.58+aSeed*13.0)*.2*living;
      p.y += cos(drift*.73+p.x*.37+aSeed*9.0)*.11*living;
      p.z += sin(drift*.61+p.x*.22+p.y*.18)*.08;
      vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
      float sizeBand = .28 + pow(aSeed,4.4)*2.35;
      gl_PointSize=sizeBand*uPixelRatio*(38.0/max(2.0,-mv.z));
      vAlpha=mix(.16,.62,pow(aSeed,.9))*uOpacity;
    }
  `,
  fragmentShader: `
    uniform sampler2D uTexture; varying vec3 vColor; varying float vAlpha;
    void main(){
      vec4 sprite=texture2D(uTexture,gl_PointCoord);
      gl_FragColor=vec4(vColor*1.34,sprite.a*vAlpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending
});
const particles = new THREE.Points(particleGeometry, particleMaterial);
world.add(particles);

// A second, coarse layer creates foreground bokeh and makes the particle terrain volumetric.
const bokehCount = isMobile ? 70 : 180;
const bokehPositions = new Float32Array(bokehCount * 3);
const bokehColors = new Float32Array(bokehCount * 3);
const bokehRandom = seeded(53.7);
const bokehPalette = [0x70815a, 0x536f98, 0x9d8b55, 0x426a6d, 0x426f8f];
for (let i = 0; i < bokehCount; i++) {
  const radius = 7 + bokehRandom() * 15;
  const angle = bokehRandom() * Math.PI * 2;
  bokehPositions[i * 3] = Math.cos(angle) * radius;
  bokehPositions[i * 3 + 1] = (bokehRandom() - .5) * 18;
  bokehPositions[i * 3 + 2] = -8 + (bokehRandom() - .5) * 12;
  const color = new THREE.Color(bokehPalette[Math.floor(bokehRandom() * bokehPalette.length)]).multiplyScalar(.3 + bokehRandom() * .45);
  bokehColors.set([color.r, color.g, color.b], i * 3);
}
const bokehGeometry = new THREE.BufferGeometry();
bokehGeometry.setAttribute('position', new THREE.BufferAttribute(bokehPositions, 3));
bokehGeometry.setAttribute('color', new THREE.BufferAttribute(bokehColors, 3));
const bokeh = new THREE.Points(bokehGeometry, new THREE.PointsMaterial({
  map: particleMap, size: .16, vertexColors: true, transparent: true, opacity: .07,
  depthWrite: false, blending: THREE.AdditiveBlending
}));
scene.add(bokeh);

function lightBeamTexture() {
  const bitmap = document.createElement('canvas');
  bitmap.width = 128; bitmap.height = 512;
  const ctx = bitmap.getContext('2d');
  const horizontal = ctx.createLinearGradient(0, 0, 128, 0);
  horizontal.addColorStop(0, 'rgba(180,220,255,0)');
  horizontal.addColorStop(.5, 'rgba(185,224,255,.72)');
  horizontal.addColorStop(1, 'rgba(180,220,255,0)');
  ctx.fillStyle = horizontal; ctx.fillRect(0, 0, 128, 512);
  ctx.globalCompositeOperation = 'destination-in';
  const vertical = ctx.createLinearGradient(0, 0, 0, 512);
  vertical.addColorStop(0, 'rgba(255,255,255,0)');
  vertical.addColorStop(.22, 'rgba(255,255,255,.82)');
  vertical.addColorStop(.72, 'rgba(255,255,255,.42)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vertical; ctx.fillRect(0, 0, 128, 512);
  const texture = new THREE.CanvasTexture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const lightBeams = new THREE.Group();
const lightBeamMaterials = [];
const beamMap = lightBeamTexture();
for (let i = 0; i < (isMobile ? 3 : 6); i++) {
  const material = new THREE.MeshBasicMaterial({
    map: beamMap, color: i % 3 === 0 ? 0x16e8d4 : 0x079b9c,
    transparent: true, opacity: .16 + i % 2 * .045, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  material.userData.baseOpacity = material.opacity;
  lightBeamMaterials.push(material);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.5 + i % 3 * .9, 15 + i % 2 * 3), material);
  beam.position.set((i - 2.5) * 3.1, .4 + i % 2, -5.5 - i * .4);
  beam.rotation.z = -.42 + i * .15;
  beam.rotation.y = (i % 2 ? -.14 : .12);
  lightBeams.add(beam);
}
world.add(lightBeams);

// The organisms are point-cloud sculptures: no solid mesh is used for their bodies.
function pointSculptureMaterial(opacity = 1, sway = .03, brightness = 1, pulse = 0) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: opacity }, uSway: { value: sway },
      uPixelRatio: { value: renderer.getPixelRatio() }, uTexture: { value: particleMap },
      uEnergy: { value: 1 }, uBrightness: { value: brightness }, uPulse: { value: pulse }
    },
    vertexShader: `
      attribute float aSize; varying vec3 vColor; varying float vAlpha;
      uniform float uTime; uniform float uOpacity; uniform float uSway; uniform float uPixelRatio; uniform float uEnergy; uniform float uPulse;
      void main(){
        vec3 p=position;
        float current = sin(uTime*.46+p.y*.82+p.z*1.7);
        p.x += current*uSway*(.45+uEnergy*.55);
        p.z += cos(uTime*.38+p.y*.58+p.x*1.2)*uSway*.76;
        float bellMask=smoothstep(-.35,1.45,p.y);
        float breathing=sin(uTime*.74)*uPulse;
        p.xz*=1.0+breathing*bellMask;
        p.y+=breathing*(.18+bellMask*.5);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=aSize*uPixelRatio*(46.0/max(2.0,-mv.z));
        vColor=color; vAlpha=uOpacity;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture; uniform float uBrightness; varying vec3 vColor; varying float vAlpha;
      void main(){
        vec4 sprite=texture2D(uTexture,gl_PointCoord);
        gl_FragColor=vec4(vColor*uBrightness,sprite.a*vAlpha*.82);
      }
    `,
    transparent: true, depthWrite: false, vertexColors: true, blending: THREE.NormalBlending
  });
  material.userData.baseOpacity = opacity;
  return material;
}

const heroJellyfish = createJellyfish({ mobile: isMobile, pixelRatio: renderer.getPixelRatio(), viewportHeight: viewportHeight });
const jellyfishSchool = [heroJellyfish];
const jellyMaterials = [heroJellyfish.material];
heroJellyfish.userData.phase = 0;
world.add(heroJellyfish);
const heroEnvironment = createHeroEnvironment({ mobile: isMobile, pixelRatio: renderer.getPixelRatio(), viewportHeight: viewportHeight });
world.add(heroEnvironment);
for (const root of [heroJellyfish, heroEnvironment]) {
  root.traverse(object => {
    if (object.material?.uniforms?.uDepthSamples) object.material.uniforms.uDepthSamples.value = heroSamples > 1 ? 1 : 0;
  });
}

function layoutHeroJellyfish() {
  const aspect = viewportWidth / viewportHeight;
  const viewWidth = 2 * 21 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * .5) * aspect;
  const wide = THREE.MathUtils.clamp((aspect - .7) / 1.1, 0, 1);
  const scale = THREE.MathUtils.clamp(viewWidth * .67 / 4.8, 1.15, 1.78);
  heroJellyfish.userData.baseScale = scale;
  heroJellyfish.scale.setScalar(scale);
  heroJellyfish.position.set(viewWidth * (.015 + wide * .12), 2.95, 0);
  heroJellyfish.userData.basePosition = heroJellyfish.position.clone();
  heroEnvironment.userData.layout(viewWidth);
}
layoutHeroJellyfish();

function gardenMaterial(opacity, sway, brightness) {
  const material = pointSculptureMaterial(opacity, sway, brightness);
  material.vertexShader = material.vertexShader.replace('varying vec3 vColor;', 'varying float vPointEnergy; varying vec4 vClip; varying float vDepth; varying vec3 vColor;')
    .replace('gl_Position=projectionMatrix*mv;', 'vDepth=-mv.z; gl_Position=projectionMatrix*mv; vClip=gl_Position;')
    .replace('gl_PointSize=aSize*uPixelRatio*(46.0/max(2.0,-mv.z));', `
      float projected=aSize*uPixelRatio*(34.0/max(2.0,-mv.z));
      float minimum=2.2;
      gl_PointSize=clamp(projected,minimum,8.0*uPixelRatio);
      vPointEnergy=min(1.,pow(projected/gl_PointSize,2.));
    `);
  material.fragmentShader = `
    uniform float uBrightness; uniform float uTime; varying vec3 vColor; varying float vAlpha; varying float vDepth; varying vec4 vClip; varying float vPointEnergy;
    ${gardenAtmosphereGLSL}
    void main(){
      float r=length(gl_PointCoord-.5)*2.;
      float aa=max(fwidth(r),.09);
      float coverage=exp(-r*r*3.2)*(1.-smoothstep(1.-aa,1.,r));
      float depthFade=gardenTransmission(vDepth);
      vec3 c=vColor*uBrightness*depthFade;
      gl_FragColor=vec4(c,vAlpha*coverage*vPointEnergy*mix(.35,1.,depthFade));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  material.depthTest = true;
  return material;
}

// An illuminated water volume behind the geometry fades with the garden chapter.
const gardenWater = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,.9999,1.);}`,
  fragmentShader: `varying vec2 vUv; uniform float uOpacity; uniform float uTime;
    ${gardenAtmosphereGLSL}
    void main(){gl_FragColor=vec4(gardenWaterColor(vUv,uTime),uOpacity);}
  `, transparent:true, depthWrite:false, depthTest:false
}));
gardenWater.frustumCulled=false;
gardenWater.renderOrder=-10;
scene.add(gardenWater);

const treeWater=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
  uniforms:{uOpacity:{value:0},uTime:{value:0}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.9999,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform float uOpacity;uniform float uTime;
    void main(){
      vec2 uv=vUv;
      float pool=exp(-dot((uv-vec2(.43,.51))*vec2(2.4,1.3),(uv-vec2(.43,.51))*vec2(2.4,1.3)));
      float shaft=pow(.5+.5*sin((uv.x+(1.-uv.y)*.13)*31.+sin(uv.x*17.)+uTime*.013),8.);
      float heart=exp(-dot((uv-vec2(.62,.72))*vec2(9.,7.),(uv-vec2(.62,.72))*vec2(9.,7.)));
      vec3 water=vec3(.001,.005,.012)+vec3(.002,.025,.045)*pool;
      water+=vec3(.001,.024,.038)*shaft*pool*uv.y;
      water+=vec3(.04,.004,.065)*heart;
      gl_FragColor=vec4(water,uOpacity);
    }`,transparent:true,depthWrite:false,depthTest:false
}));
treeWater.frustumCulled=false;treeWater.renderOrder=-9;scene.add(treeWater);

const seaweed = createKelpForest({mobile: isMobile, pixelRatio: renderer.getPixelRatio()});
const gardenDepth = createGardenDepth({ mobile: isMobile });
seaweed.add(gardenDepth);
seaweed.add(createGardenRelief(gardenDepth.material,isMobile));
const seaweedMaterials = [seaweed.material, gardenDepth.material];
const seaweedLeaves = [];
world.add(seaweed);

// Glowing seed sacs turn the garden into a navigable, high-contrast ecosystem.
const bulbRandom = seeded(388.2);
const bulbData = [];
const clusterLayout = isMobile ? [[0,1.4,9],[1,1.8,18],[2,-2,6],[3,-3.4,7]]
  : [[0,2.15,10],[1,1.45,25],[2,-2.3,8],[3,-3.5,9],[4,3.7,5]];
clusterLayout.forEach(([columnIndex, y, count]) => {
  const column = seaweed.userData.columns[columnIndex];
  const root = seaweed.userData.centre(column,y);
  for (let i=0;i<count;i++) {
    const angle=i*2.399+bulbRandom()*.6;
    const spread=.25+Math.sqrt(bulbRandom())*(columnIndex===1?1.3:.7);
    const offset=new THREE.Vector3(Math.cos(angle)*spread,(bulbRandom()-.5)*(columnIndex===1?3.0:1.4),.75+bulbRandom()*.45);
    bulbData.push({ centre:root.clone().add(offset), root,
      scale:(columnIndex===1?.75:.48)+bulbRandom()*.45,
      hero:column.hero,phase:angle,tilt:(bulbRandom()-.5)*2.5,width:.72+bulbRandom()*.65,length:1.25+bulbRandom()*.95 });
  }
});

const bulbShells = createGardenCapsules(bulbData, isMobile);
seaweed.add(bulbShells);

const bulbPointRandom = seeded(477.8);
const pointsPerBulb = isMobile ? 750 : 2600;
const bulbPointPositions = new Float32Array(bulbData.length * pointsPerBulb * 3);
const bulbPointColors = new Float32Array(bulbData.length * pointsPerBulb * 3);
const bulbPointSizes = new Float32Array(bulbData.length * pointsPerBulb);
const bulbLime = new THREE.Color(0xffa900);
const bulbGold = new THREE.Color(0xffd72c);
bulbData.forEach((item, bulbIndex) => {
  for (let pointIndex = 0; pointIndex < pointsPerBulb; pointIndex++) {
    const index = bulbIndex * pointsPerBulb + pointIndex;
    const theta = bulbPointRandom() * Math.PI * 2;
    const phi = Math.acos(bulbPointRandom() * 2 - 1);
    const shell=.94+bulbPointRandom()*.06;
    if(pointIndex<140){
      const t=pointIndex/139;
      const p=item.root.clone().lerp(item.centre,t);
      p.y-=Math.sin(t*Math.PI)*.16;
      p.x+=Math.cos(theta)*.018;p.z+=Math.sin(theta)*.018;
      bulbPointPositions.set([p.x,p.y,p.z],index*3);
      bulbPointColors.set([.025+t*t*.16,.055+t*t*.09,.005],index*3);
      bulbPointSizes[index]=.75+bulbPointRandom()*.4;
      continue;
    }
    bulbPointPositions.set(capsulePoint(item,Math.sin(phi)*Math.cos(theta)*shell,
      Math.cos(phi)*shell,Math.sin(phi)*Math.sin(theta)*shell),index*3);
    const rib = Math.pow(Math.abs(Math.cos(theta * 5)),24);
    const color = bulbLime.clone().lerp(bulbGold, .2 + rib * .8);
    color.multiplyScalar(.22 + rib * 2.5 + bulbPointRandom() * .2);
    bulbPointColors.set([color.r, color.g, color.b], index * 3);
    const sizeBand=bulbPointRandom();
    bulbPointSizes[index] = sizeBand<.70 ? .55+bulbPointRandom()*.35
      : sizeBand<.96 ? 1.05+bulbPointRandom()*.6 : 1.9+bulbPointRandom()*.8;
  }
});
const bulbPointGeometry = new THREE.BufferGeometry();
bulbPointGeometry.setAttribute('position', new THREE.BufferAttribute(bulbPointPositions, 3));
bulbPointGeometry.setAttribute('color', new THREE.BufferAttribute(bulbPointColors, 3));
bulbPointGeometry.setAttribute('aSize', new THREE.BufferAttribute(bulbPointSizes, 1));
const bulbPointMaterial = gardenMaterial(.96, .11, 1.55);
const bulbPoints = new THREE.Points(bulbPointGeometry, bulbPointMaterial);
bulbPoints.renderOrder = 5;
seaweed.add(bulbPoints);

function updateBulbField(time, visibility) {
  bulbPointMaterial.uniforms.uTime.value = time * 1.18;
  bulbPointMaterial.uniforms.uOpacity.value = visibility * (.65 + Math.sin(time * 1.2) * .045);
  bulbPointMaterial.uniforms.uEnergy.value = 1.1 + Math.sin(time * 1.35) * .18;
  bulbPoints.rotation.y = Math.sin(time * .16) * .008;
  bulbShells.rotation.y = bulbPoints.rotation.y;
  bulbShells.material.uniforms.uTime.value = bulbPointMaterial.uniforms.uTime.value;
  bulbShells.material.uniforms.uEnergy.value = bulbPointMaterial.uniforms.uEnergy.value;
  bulbShells.material.uniforms.uOpacity.value = visibility;
}

// Midground LOD: lightweight point cages and membrane caps. The silhouettes are real
// geometry, but intentionally much cheaper than the foreground kelp.
function createGardenDetails() {
  const random = seeded(533.8);
  const positions = [];
  const colors = [];
  const sizes = [];
  const cyan = new THREE.Color(0x45ddff);
  const cyanDark = new THREE.Color(0x0b6574);
  const violet = new THREE.Color(0x4424f2);
  const pink = new THREE.Color(0x734dff);
  const orbLayout = isMobile
    ? [[-2., 3.5, -8., .55], [2.1, 1.2, -10., .6], [.5, 4.8, -12, .45]]
    : [[-10., 1.2, -5.2, .65], [-6.1, 4.8, -4.6, .48], [.7, 5.5, -6.4, .8], [-1.3, 2.3, -5.4, .35], [8.5, 5., -6.2, .6], [9.2, .4, -4.8, .32], [.3, -4.1, -9., .4]];
  orbLayout.forEach(([cx, cy, cz, radius], orbIndex) => {
    const surfaceCount = isMobile ? 1100 : 2900;
    for (let i = 0; i < surfaceCount; i++) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(random() * 2 - 1);
      const shell = radius * (.97 + random() * .03);
      positions.push(cx + Math.sin(phi) * Math.cos(theta) * shell, cy + Math.cos(phi) * shell, cz + Math.sin(phi) * Math.sin(theta) * shell);
      const color = cyanDark.clone().lerp(cyan, .06 + random() * .13);
      colors.push(color.r, color.g, color.b); sizes.push(.65 + Math.pow(random(), 2.7) * 1.45);
    }
    for (let filament = 0; filament < 14; filament++) {
      for (let step = 0; step < 110; step++) {
        const t = step / 109;
        const angle = filament / 14 * Math.PI * 2 + orbIndex;
        positions.push(cx + Math.cos(angle) * radius * .42 + Math.sin(t * 7 + filament) * t * .08, cy - radius - t * (3.2 + orbIndex % 3 * .7), cz + Math.sin(angle) * radius * .42);
        colors.push(cyan.r*.18, cyan.g*.30, cyan.b*.30); sizes.push(.8 + random() * .6);
      }
    }
  });

  const capLayout = isMobile
    ? [[-1.45, -1.5, -.8, .75], [1.8, .0, -7, .5], [.3, -4., -8, .4]]
    : [[-7.2, -3.5, 3.7, 1.35], [-3.1, -.45, 2.3, 1.12], [-3.8, -4.4, -2.9, .48], [3.2, -.9, -3.6, .65], [2.4, -3.6, -6, .48], [.2, -3.1, -11, .5]];
  const organisms=new Array(positions.length/3*4).fill(0);
  capLayout.forEach(([cx, cy, cz, radius], capIndex) => {
    const firstPoint=positions.length/3;
    const count=isMobile?6500:24000;
    for(let i=0;i<count;i++){
      const r=(i+.5)/count,a=i*2.3999632297;
      const rib=Math.pow(.5+.5*Math.cos(a*30+r*4.2),18);
      const petal=Math.pow(.5+.5*Math.cos(a*10),4);
      const tissue=.5+.5*Math.sin(r*31+Math.sin(a*5)*1.8);
      if(random()>.3+tissue*.25+petal*.2+rib*.2)continue;
      positions.push(...capPoint(cx,cy,cz,radius,r,a,capIndex));
      colors.push(.09+rib*.4+petal*.10,.022+rib*.18,.42+rib*.7);
      sizes.push(.55+random()*.5+rib*.35);
    }
    // A rolled, scalloped lip has a surface rather than a single wire ring.
    for(let i=0;i<(isMobile?2200:7000);i++){
      const a=i*2.3999632297,r=.91+random()*.09;
      positions.push(...capPoint(cx,cy,cz,radius,r,a,capIndex));
      colors.push(.13,.13,.58);sizes.push(.65+random()*.45);
    }
    for(let arm=0;arm<7;arm++){
      const samples=isMobile?1800:6500;
      for(let i=0;i<samples;i++){
        const t=(i+.5)/samples, across=random()*2-1;
        const crease=Math.pow(.5+.5*Math.sin(t*(34+arm*3)+across*4.7),4);
        positions.push(...gardenOralPoint(cx,cy,cz,radius,arm,t,across));
        colors.push(.005+crease*.026,.025+crease*.16,.18+crease*.44);
        sizes.push(.52+random()*.55);
      }
    }
    for(let i=firstPoint;i<positions.length/3;i++)organisms.push(cx,cy,cz,radius);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aOrganism',new THREE.Float32BufferAttribute(organisms,4));
  const material = gardenMaterial(.9, .035, 2.15);
  material.vertexShader=gardenSwimGLSL+material.vertexShader.replace('vec3 p=position;', 'vec3 p=gardenSwim(position,uTime);');
  const points = new THREE.Points(geometry, material);
  points.userData.material = material;
  const membranes=createGardenMembranes(capLayout,isMobile);
  points.add(membranes);
  points.userData.membranes=membranes.material;
  const cages=createGardenCages(orbLayout,isMobile);
  points.add(cages);points.userData.cages=cages.material;
  return points;
}

const gardenDetails = createGardenDetails();
gardenDetails.visible = false;
world.add(gardenDetails);

const coveTree=createCoveScene({mobile:isMobile,pixelRatio:renderer.getPixelRatio(),viewportHeight:viewportHeight,samples:heroSamples});
coveTree.visible=false;
if(isMobile)coveTree.scale.set(.72,1.45,1);
world.add(coveTree);
const continuousHabitat=createContinuousHabitat({mobile:isMobile,pixelRatio:renderer.getPixelRatio(),samples:heroSamples});
world.add(continuousHabitat);
const travelRoots=[heroJellyfish,heroEnvironment,seaweed,gardenDetails,coveTree,continuousHabitat];
for(const root of travelRoots)applyTravelDepth(root,{width:viewportWidth,height:viewportHeight});

function cloudTexture(project, index) {
  const bitmap = document.createElement('canvas');
  bitmap.width = 1200; bitmap.height = 720;
  const ctx = bitmap.getContext('2d');
  const random = seeded(71 + index * 9.7);
  const base = ctx.createLinearGradient(0, 0, 1200, 720);
  base.addColorStop(0, project.colors[0]);
  base.addColorStop(.48, project.colors[2]);
  base.addColorStop(.74, '#152126');
  base.addColorStop(1, project.colors[0]);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 1200, 720);
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 95; i++) {
    const x = random() * 1400 - 100;
    const y = 110 + random() * 540;
    const radius = 55 + random() * 230;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const color = random() > .5 ? project.colors[1] : project.colors[2];
    glow.addColorStop(0, `${color}bb`);
    glow.addColorStop(.38, `${color}58`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(2,7,9,.34)'; ctx.fillRect(0, 0, 1200, 720);
  const veil = ctx.createLinearGradient(0, 0, 0, 720);
  veil.addColorStop(0, 'rgba(0,0,0,.04)'); veil.addColorStop(.65, 'rgba(0,0,0,.05)'); veil.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = veil; ctx.fillRect(0, 0, 1200, 720);
  ctx.strokeStyle = 'rgba(232,242,242,.34)'; ctx.lineWidth = 2;
  ctx.roundRect(18, 18, 1164, 684, 42); ctx.stroke();
  ctx.fillStyle = 'rgba(240,244,239,.62)'; ctx.font = '500 19px monospace';
  ctx.fillText(`${project.client}  /  ${project.number}`, 58, 66);
  ctx.fillStyle = '#eef2ef'; ctx.font = '300 78px Arial'; ctx.fillText(project.title, 58, 628);
  ctx.font = '500 16px monospace'; ctx.fillStyle = project.colors[1]; ctx.fillText('ENTER EXPERIENCE  ↗', 930, 664);
  const texture = new THREE.CanvasTexture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const cards = new THREE.Group();
world.add(cards);
const cardGroups = [];
const hitMeshes = [];
const cardGap = isMobile ? 4.25 : 4.5;
const cardAngle = 1.42;
const cardRadius = isMobile ? 4.25 : 5.3;
PROJECTS.forEach((project, index) => {
  const angle = .3 + index * cardAngle;
  const group = new THREE.Group();
  const base = new THREE.Vector3(Math.sin(angle) * cardRadius, -index * cardGap, Math.cos(angle) * cardRadius);
  group.position.copy(base);
  const width = isMobile ? 5.2 : 7.15;
  const height = isMobile ? 3.15 : 4.28;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(width, height, .15), new THREE.MeshPhysicalMaterial({
    color: project.colors[0], metalness: .12, roughness: .16, transmission: .45, thickness: .85,
    transparent: true, opacity: 0, depthWrite: false, clearcoat: 1, clearcoatRoughness: .08,
    emissive: new THREE.Color(project.colors[1]).multiplyScalar(.08), emissiveIntensity: .25
  }));
  glass.renderOrder = 3;
  group.add(glass);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width - .16, height - .16), new THREE.MeshBasicMaterial({
    map: cloudTexture(project, index), transparent: true, opacity: 0, depthWrite: false
  }));
  face.position.z = .086; face.renderOrder = 6; face.userData.cardIndex = index; group.add(face); hitMeshes.push(face);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({
    color: project.colors[1], transparent: true, opacity: 0
  }));
  group.add(frame);
  group.userData = { index, base, glass, face, frame, hover: 0, focus: 0 };
  cards.add(group); cardGroups.push(group);
});

// A dark field of separated octagonal mirrors, kept behind the content plane.
const columns = isMobile ? 19 : 35;
const rows = isMobile ? 15 : 23;
const cellCount = columns * rows;
const hex = new THREE.CylinderGeometry(.145, .145, .038, 8, 1, false);
hex.rotateX(Math.PI * .5);
const cellMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x11171b, metalness: 1, roughness: .12, clearcoat: 1,
  clearcoatRoughness: .06, envMapIntensity: 2.6, transparent: true, opacity: 1
});
const metalSkin = new THREE.InstancedMesh(hex, cellMaterial, cellCount);
metalSkin.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
metalSkin.visible = false; world.add(metalSkin);
const metalData = [];
const metalDummy = new THREE.Object3D();
let metalFrame = 0;
for (let row = 0; row < rows; row++) {
  for (let column = 0; column < columns; column++) {
    const index = row * columns + column;
    const x = (column - (columns - 1) / 2) * .53 + (row % 2) * .265;
    const y = (row - (rows - 1) / 2) * .47;
    metalData.push({ x, y, phase: index * .17 + row * .37 });
    metalSkin.setColorAt(index, new THREE.Color().setHSL(.57, .045, .035 + (index % 7) * .009));
  }
}
metalSkin.instanceColor.needsUpdate = true;

const stagePanels = [...document.querySelectorAll('[data-stage]')];
const railChapter = document.querySelector('.rail__chapter');
const railProgress = document.querySelector('.rail__track i');
const pointer = new THREE.Vector2(9, 9);
const smoothPointer = new THREE.Vector2();
const motionPointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let targetStage = 0, currentStage = 0;
let targetGallery = 0, currentGallery = 0;
let targetGalleryReveal = 0, galleryReveal = 0;
let pointerSpeed = 0, lastPointerX = 0, lastPointerY = 0;
let hoveredCard = -1, focusedCard = -1;
let dragging = false, dragStartX = 0, dragRotation = 0, targetDragRotation = 0;
let scrollEnergy = 0;
const destinations={intro:0,work:.36,cove:.88,contact:1};
let targetFlight=destinations[location.hash.slice(1)]??0;
let currentFlight=targetFlight;
let lastFrameTime=0;
let touchY=null;
const sceneButtons=[...document.querySelectorAll('[data-flight-scene]')];
function navigateFlight(progress){
  targetFlight=clampProgress(progress);
}
function updateScroll(){
  // Kept as the resize hook: layout no longer determines the camera route.
  targetFlight=clampProgress(targetFlight);
}
function updateFlightPresentation(){
  stagePanels.forEach((panel,index)=>{
    const {opacity,depth}=panelPresentation(currentFlight,index,reduceMotion);
    panel.style.opacity=opacity.toFixed(3);
    panel.style.transform=`translateZ(${depth.toFixed(1)}px)`;
    const visible=opacity>.03;
    panel.style.visibility=visible?'visible':'hidden';
    panel.inert=!visible;
    panel.setAttribute('aria-hidden',String(!visible));
  });
  const state=flightState(currentFlight);
  railChapter.textContent=String(state.scene+1).padStart(2,'0');
  railProgress.style.height=`${currentFlight*100}%`;
  sceneButtons.forEach((button,index)=>button.setAttribute('aria-current',index===state.scene?'step':'false'));
}
addEventListener('wheel',event=>{
  if(event.ctrlKey)return;
  event.preventDefault();
  const amount=wheelTravel(event.deltaY,event.deltaMode,viewportHeight);
  navigateFlight(targetFlight+amount);
  scrollEnergy=Math.min(2.5,scrollEnergy+Math.abs(amount)*15);
},{passive:false});
addEventListener('touchstart',event=>{if(event.touches.length===1)touchY=event.touches[0].clientY;},{passive:true});
addEventListener('touchmove',event=>{
  if(touchY===null||event.touches.length!==1)return;
  event.preventDefault();
  const y=event.touches[0].clientY;
  navigateFlight(targetFlight+(touchY-y)/2400);touchY=y;
},{passive:false});
addEventListener('touchend',()=>{touchY=null;});
addEventListener('touchcancel',()=>{touchY=null;});
addEventListener('keydown',event=>{
  if(event.target.closest('input,textarea,select,[contenteditable="true"]')||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.code==='Space'&&event.target.closest('a,button'))return;
  const step={ArrowDown:.025,ArrowUp:-.025,PageDown:.12,PageUp:-.12,Space:event.shiftKey?-.12:.12}[event.code];
  if(step!==undefined){event.preventDefault();navigateFlight(targetFlight+step);}
  if(event.code==='Home'||event.code==='End'){event.preventDefault();navigateFlight(event.code==='Home'?0:1);}
});
document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',event=>{
  const hash=link.getAttribute('href').slice(1);
  if(destinations[hash]===undefined)return;
  event.preventDefault();navigateFlight(destinations[hash]);
  if(location.hash!==`#${hash}`)history.pushState(null,'',`#${hash}`);
}));
addEventListener('hashchange',()=>navigateFlight(destinations[location.hash.slice(1)]??0));
sceneButtons.forEach((button,index)=>button.addEventListener('click',()=>{
  const hash=['intro','work','cove'][index];
  navigateFlight(SCENE_STOPS[index]);
  if(location.hash!==`#${hash}`)history.pushState(null,'',`#${hash}`);
}));
updateFlightPresentation();

addEventListener('pointermove', event => {
  pointer.set(event.clientX / viewportWidth * 2 - 1, -(event.clientY / viewportHeight * 2 - 1));
  motionPointer.copy(pointer).clampScalar(-1,1);
  const dx = event.clientX - lastPointerX, dy = event.clientY - lastPointerY;
  pointerSpeed = Math.min(2.5, Math.hypot(dx, dy) * .035);
  lastPointerX = event.clientX; lastPointerY = event.clientY;
  if (dragging) targetDragRotation += dx * .0045;
  const cursor = document.querySelector('.cursor');
  cursor.style.left = `${event.clientX}px`; cursor.style.top = `${event.clientY}px`;
}, { passive: true });
addEventListener('pointerdown', event => {
  if(event.pointerType==='touch'||event.target.closest('a,button'))return;
  dragStartX = event.clientX;
  if (hoveredCard >= 0) focusedCard = focusedCard === hoveredCard ? -1 : hoveredCard;
  else dragging = true;
});
addEventListener('pointerup', event => {
  dragging = false;
});
addEventListener('pointerleave', () => { dragging = false; motionPointer.set(0,0); });

document.querySelectorAll('.magnetic').forEach(element => {
  element.addEventListener('pointerenter', () => document.querySelector('.cursor').classList.add('is-active'));
  element.addEventListener('pointerleave', () => { document.querySelector('.cursor').classList.remove('is-active'); element.style.transform = ''; });
  element.addEventListener('pointermove', event => {
    const rect = element.getBoundingClientRect();
    element.style.transform = `translate(${(event.clientX - rect.left - rect.width / 2) * .12}px, ${(event.clientY - rect.top - rect.height / 2) * .12}px)`;
  });
});

function animateMetal(time, visibility) {
  metalSkin.visible = visibility > .015;
  if (!metalSkin.visible) return;
  metalFrame += 1;
  if (metalFrame % 2 === 0) { cellMaterial.opacity = visibility; return; }
  const mouseX = smoothPointer.x * 8.2, mouseY = smoothPointer.y * 4.8;
  metalData.forEach((item, index) => {
    const distance = Math.hypot(item.x - mouseX, item.y - mouseY);
    const reaction = Math.exp(-distance * distance * .56) * (1 + pointerSpeed * .3);
    const wave = Math.sin(time * .55 + item.phase) * .008;
    metalDummy.position.set(item.x, item.y, -3.15 + wave + Math.sin(item.x * .4 + time) * scrollEnergy * .006);
    metalDummy.rotation.set(-reaction * .13, (mouseX - item.x) * reaction * .018, index % 2 ? .018 : -.018);
    metalDummy.scale.setScalar(visibility * (.88 + reaction * .025));
    metalDummy.updateMatrix(); metalSkin.setMatrixAt(index, metalDummy.matrix);
  });
  metalSkin.instanceMatrix.needsUpdate = true; cellMaterial.opacity = visibility;
}

function animate() {
  const time = clock.getElapsedTime();
  const dt=Math.min(.05,time-lastFrameTime);lastFrameTime=time;
  const flightStep=(targetFlight-currentFlight)*(1-Math.exp(-dt*5.5));
  currentFlight=reduceMotion?targetFlight:currentFlight+THREE.MathUtils.clamp(flightStep,-dt*.26,dt*.26);
  const flight=flightState(currentFlight);
  targetStage=flight.stage;
  targetGallery=clampProgress((currentFlight-.28)/.4)*3;
  targetGalleryReveal=flight.gardenMood;
  updateFlightPresentation();
  currentStage += (targetStage - currentStage) * (reduceMotion ? 1 : .052);
  currentGallery += (targetGallery - currentGallery) * (reduceMotion ? 1 : .065);
  galleryReveal += (targetGalleryReveal - galleryReveal) * .07;
  smoothPointer.lerp(motionPointer, .052);
  dragRotation += (targetDragRotation - dragRotation) * .075;
  pointerSpeed *= .9; scrollEnergy *= .91;

  particleMaterial.uniforms.uTime.value = time;
  particleMaterial.uniforms.uStage.value = currentStage;
  const galleryFieldOpacity = THREE.MathUtils.lerp(.105, .042, THREE.MathUtils.smoothstep(currentStage, .45, 1.15));
  particleMaterial.uniforms.uOpacity.value = galleryFieldOpacity;

  const lateral=reduceMotion?0:smoothPointer.x*.6;
  const vertical=reduceMotion?0:smoothPointer.y*.22;
  camera.position.set(lateral,vertical,flight.z);
  camera.lookAt(lateral*.15+Math.sin(dragRotation)*1.8,vertical*.15-.18,flight.z-24);

  const jellyVisibility = flight.hero;
  const jellyTime = reduceMotion ? 0 : time;
  heroEnvironment.visible = jellyVisibility > .012;
  heroEnvironment.userData.update(jellyTime);
  heroEnvironment.userData.material.uniforms.uOpacity.value = jellyVisibility;
  jellyfishSchool.forEach(jelly => {
    const base = jelly.userData.basePosition;
    const phase = jelly.userData.phase;
    const baseScale = jelly.userData.baseScale;
    jelly.visible = jellyVisibility > .012;
    jelly.position.set(
      base.x + Math.sin(jellyTime * .22 + phase) * .08,
      base.y + Math.sin(jellyTime * .42 + phase) * .16,
      base.z
    );
    jelly.rotation.x = .17 + smoothPointer.y * .045 + Math.sin(jellyTime * .24 + phase) * .018;
    jelly.rotation.y = .12 + Math.sin(jellyTime * .2 + phase) * .055 + dragRotation * .12;
    jelly.rotation.z = .25 + Math.sin(jellyTime * .3 + phase) * .022;
    jelly.scale.setScalar(baseScale);
  });
  jellyMaterials.forEach(material => {
    material.uniforms.uTime.value = reduceMotion ? 0 : time;
    material.uniforms.uEnergy.value = 1 + Math.sin(jellyTime * .72) * .16;
    material.uniforms.uOpacity.value = material.userData.baseOpacity * jellyVisibility;
  });
  const heroJelly = jellyfishSchool[0];
  if (heroJelly) jellyCoreLight.position.copy(heroJelly.position).add(new THREE.Vector3(0, .2, .3));
  jellyCoreLight.intensity = jellyVisibility * (30 + Math.sin(time * .82) * 5);

  const seaweedVisibility = flight.garden;
  gardenWater.material.uniforms.uOpacity.value = .4;
  gardenWater.material.uniforms.uTime.value = time;
  gardenWater.visible = true;
  seaweed.visible = seaweedVisibility > .012;
  seaweed.position.set(0,0,FLIGHT.gardenZ);
  seaweed.scale.setScalar(1);
  seaweed.rotation.y = 0;
  seaweed.rotation.z = 0;
  seaweedMaterials.forEach(material => {
    material.uniforms.uTime.value = jellyTime;
    material.uniforms.uOpacity.value = material.userData.baseOpacity * seaweedVisibility;
  });
  updateBulbField(jellyTime, seaweedVisibility);
  const gardenDetailVisibility = seaweedVisibility;
  gardenDetails.visible = gardenDetailVisibility > .012;
  gardenDetails.position.set(0,0,FLIGHT.gardenZ);
  gardenDetails.rotation.y = Math.sin(jellyTime * .055) * .025;
  gardenDetails.userData.material.uniforms.uTime.value = jellyTime * .72;
  gardenDetails.userData.material.uniforms.uOpacity.value = seaweedVisibility * .84;
  gardenDetails.userData.membranes.uniforms.uTime.value = jellyTime*.72;
  gardenDetails.userData.membranes.uniforms.uOpacity.value = seaweedVisibility;
  gardenDetails.userData.cages.uniforms.uTime.value = jellyTime*.72;
  gardenDetails.userData.cages.uniforms.uOpacity.value = gardenDetailVisibility;
  seaweedLeaves.forEach(leaf => {
    const base = leaf.userData.baseRotation;
    leaf.rotation.set(base.x, base.y + Math.sin(time * .28 + leaf.userData.phase) * .035, base.z + Math.sin(time * .36 + leaf.userData.phase) * .045);
  });

  const treeVisibility = flight.tree;
  scene.background.set(0x031923);
  scene.fog.color.set(0x062b38);
  scene.fog.density=.016;
  continuousHabitat.material.uniforms.uTime.value=jellyTime;
  coveTree.visible = treeVisibility > .012;
  treeWater.material.uniforms.uOpacity.value=0;
  treeWater.visible=false;
  treeWater.material.uniforms.uTime.value=time;
  const coveOffset=isMobile?-.9:0;
  coveTree.position.set(coveOffset,0,FLIGHT.treeZ);
  coveTree.rotation.y=.12;
  coveTree.userData.update(jellyTime,treeVisibility);

  particles.position.y = 0;
  bokeh.position.y = particles.position.y * .72;
  bokeh.rotation.y = time * .007 + dragRotation * .18;
  lightBeams.visible = seaweedVisibility > .08;
  lightBeams.position.set(0,1.4,FLIGHT.gardenZ);
  lightBeamMaterials.forEach((material, index) => {
    material.opacity = material.userData.baseOpacity * seaweedVisibility * (.36 + Math.sin(time * .16 + index) * .07);
  });

  const cardVisibility = 0;
  cards.visible = false;
  hoveredCard = -1;
  if (cardVisibility > .2) {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    if (hits.length) hoveredCard = hits[0].object.userData.cardIndex;
  }
  document.querySelector('.cursor').classList.toggle('is-active', hoveredCard >= 0);
  cardGroups.forEach((group, index) => {
    group.userData.hover += ((hoveredCard === index ? 1 : 0) - group.userData.hover) * .12;
    group.userData.focus += ((focusedCard === index ? 1 : 0) - group.userData.focus) * .09;
    const emphasis = Math.max(group.userData.hover, group.userData.focus);
    const base = group.userData.base, outward = 1 + emphasis * .1;
    group.position.set(base.x * outward, base.y + Math.sin(time * .55 + index) * .09, base.z * outward);
    group.lookAt(camera.position);
    group.scale.setScalar((.9 + cardVisibility * .1) * (1 + emphasis * .1));
    group.userData.glass.material.opacity = cardVisibility * (.12 + emphasis * .14);
    group.userData.glass.material.emissiveIntensity = .2 + emphasis * .65;
    group.userData.face.material.opacity = Math.min(1, cardVisibility * 1.55);
    group.userData.frame.material.opacity = cardVisibility * (.35 + emphasis * .55);
  });

  metalSkin.visible = false;
  particles.visible = false;
  bokeh.visible = false;
  // A single optical pipeline for the entire dive; local materials carry color.
  bloomPass.strength=.27;
  bloomPass.threshold=.76;
  bloomPass.radius=.4;
  gardenGrade.enabled=false;
  heroOutput.enabled=true;
  composer.render();
  requestAnimationFrame(animate);
}
animate();

function resize() {
  viewportWidth=innerWidth;viewportHeight=innerHeight;
  const mobileNow = viewportWidth < 760;
  camera.aspect = viewportWidth / viewportHeight;
  camera.fov = flightFov(camera.aspect,mobileNow);
  camera.updateProjectionMatrix();
  layoutHeroJellyfish();
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobileNow ? 1 : 1.3));
  renderer.setSize(viewportWidth, viewportHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(viewportWidth, viewportHeight);
  particleMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  jellyMaterials.forEach(material => {
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    material.uniforms.uViewportHeight.value = viewportHeight;
  });
  heroEnvironment.userData.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  heroEnvironment.userData.material.uniforms.uViewportHeight.value = viewportHeight;
  seaweedMaterials.forEach(material => { material.uniforms.uPixelRatio.value = renderer.getPixelRatio(); });
  bulbPointMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  gardenDetails.userData.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  coveTree.userData.resize(renderer.getPixelRatio(),viewportHeight);
  continuousHabitat.material.uniforms.uPixelRatio.value=renderer.getPixelRatio();
  for(const root of travelRoots)applyTravelDepth(root,{width:viewportWidth,height:viewportHeight});
  updateScroll();
}
addEventListener('resize', resize);

const loader = document.querySelector('.loader');
const loaderCount = document.querySelector('.loader__count');
const loadStart = performance.now();
function updateLoader(now) {
  const value = Math.min(100, Math.round((now - loadStart) / 11));
  loaderCount.textContent = String(value).padStart(2, '0');
  if (value >= 100) loader.classList.add('is-hidden');
  else requestAnimationFrame(updateLoader);
}
requestAnimationFrame(updateLoader);
