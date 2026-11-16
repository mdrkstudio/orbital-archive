import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gardenAtmosphereGLSL } from './garden-atmosphere.js';

export function capsulePoint(item, x, y, z) {
  const radius=(item.hero?.25:.2)*item.scale;
  const taper=1.+y*.22;
  const bx=(x*.8*item.width*taper+.13*y*y)*radius;
  const by=y*item.length*radius;
  const bz=z*.75*taper*radius;
  return [item.centre.x+bx*Math.cos(item.tilt)-by*Math.sin(item.tilt),
    item.centre.y+bx*Math.sin(item.tilt)+by*Math.cos(item.tilt),item.centre.z+bz];
}

// A continuous membrane carries the form; surface points only supply highlights.
export function createGardenCapsules(items, mobile) {
  const shells = items.map(item => {
    const geometry = new THREE.SphereGeometry(1, mobile ? 24 : 40, mobile ? 16 : 24);
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++) p.setXYZ(i,...capsulePoint(item,p.getX(i),p.getY(i),p.getZ(i)));
    geometry.computeVertexNormals();
    return geometry;
  });
  const geometry = mergeGeometries(shells);
  shells.forEach(shell => shell.dispose());
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uEnergy: { value: 1.1 } },
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    vertexShader: `
      uniform float uTime, uEnergy;
      varying vec2 vUv;
      varying vec3 vNormal, vView;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.x += sin(uTime*.46+p.y*.82+p.z*1.7)*.11*(.45+uEnergy*.55);
        p.z += cos(uTime*.38+p.y*.58+p.x*1.2)*.11*.76;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        vNormal = normalize(normalMatrix*normal);
        vView = -mv.xyz;
        vDepth = -mv.z;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormal, vView;
      varying float vDepth;
      ${gardenAtmosphereGLSL}
      void main() {
        float rim = pow(clamp(1.-abs(dot(normalize(vNormal),normalize(vView))),0.,1.),2.2);
        float ribWave = abs(sin(vUv.x*31.4159265));
        float aa = max(fwidth(ribWave),.025);
        float ribs = 1.-smoothstep(.065-aa,.065+aa,ribWave);
        ribs *= smoothstep(0.,.14,vUv.y)*smoothstep(0.,.14,1.-vUv.y);
        float transmission = gardenTransmission(vDepth);
        vec3 amber = mix(vec3(.22,.06,.001),vec3(3.2,1.65,.06),rim*.2+ribs*.8);
        float alpha = (.035+rim*.12+ribs*.38)*uOpacity*transmission;
        gl_FragColor = vec4(amber*(.8+ribs*.75)*transmission,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 4;
  return mesh;
}
