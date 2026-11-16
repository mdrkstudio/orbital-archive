import { gardenSwimGLSL } from './garden-motion.js';
import * as THREE from 'three';
import { bellSurface, oralSurface } from './jellyfish.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gardenAtmosphereGLSL } from './garden-atmosphere.js';

export function capPoint(cx, cy, cz, radius, radial, angle, phase = 0) {
  const p=bellSurface(radial,angle+phase*.11).multiplyScalar(radius/2.22);
  const tilt=.12+Math.sin(cx*.7+cz)*.17;
  const y=p.y*Math.cos(tilt)-p.x*Math.sin(tilt);
  return [cx+p.x*Math.cos(tilt)+p.y*Math.sin(tilt),cy+y,cz+p.z+p.y*.16];
}

export function gardenOralPoint(cx,cy,cz,radius,arm,t,across){
  const p=oralSurface(arm,t,across).multiplyScalar(radius/2.22);
  p.x=p.x*.64-radius*Math.sin(t*2.4)*t*.88;
  p.z*=.82;
  p.y*=1.18;
  return [cx+p.x,cy+p.y,cz+p.z];
}

export function createGardenMembranes(layout, mobile) {
  const surfaces = layout.flatMap(([cx,cy,cz,radius],phase) => [1,.76].map(layer => {
    const positions=[], uvs=[], indices=[];
    const rings=mobile?24:44, segments=mobile?80:160;
    for(let i=0;i<=rings;i++) for(let j=0;j<=segments;j++) {
      const r=i/rings, a=j/segments*Math.PI*2;
      positions.push(...capPoint(cx,cy-radius*(1-layer)*.45,cz,radius*layer,r,a,phase));
      uvs.push(j/segments,r);
      if(i<rings&&j<segments){ const k=i*(segments+1)+j;
        indices.push(k,k+segments+1,k+1,k+1,k+segments+1,k+segments+2); }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    const organisms=[];for(let i=0;i<positions.length/3;i++)organisms.push(cx,cy,cz,radius);
    g.setAttribute('aOrganism',new THREE.Float32BufferAttribute(organisms,4));
    g.setIndex(indices);g.computeVertexNormals();return g;
  }));
  const geometry=mergeGeometries(surfaces);surfaces.forEach(g=>g.dispose());
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uOpacity:{value:0}},
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`${gardenSwimGLSL}
      uniform float uTime; varying vec2 vUv; varying float vDepth;
      void main(){vUv=uv;vec3 p=gardenSwim(position,uTime);
        p.x+=sin(uTime*.46+p.y*.82+p.z*1.7)*.035;
        p.z+=cos(uTime*.38+p.y*.58+p.x*1.2)*.035*.76;
        vec4 mv=modelViewMatrix*vec4(p,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`uniform float uOpacity;varying vec2 vUv;varying float vDepth;
      ${gardenAtmosphereGLSL}
      void main(){
        float a=vUv.x*6.2831853, r=vUv.y;
        float wave=sin(a*13.+sin(r*10.+a*3.)*.5);
        float aa=max(fwidth(wave),.035);
        float veins=1.-smoothstep(.06-aa,.06+aa,abs(wave));
        float folds=.5+.5*sin(r*29.+sin(a*7.)*.6);
        float lip=smoothstep(.84,.97,r)*(1.-smoothstep(.98,1.,r));
        float core=exp(-pow((r-.55)*6.,2.));
        vec3 color=mix(vec3(.085,.012,.37),vec3(.025,.25,.62),lip*.7);
        color+=vec3(.42,.10,.9)*veins+vec3(.045,.095,.38)*core;
        float transmission=gardenTransmission(vDepth);
        float alpha=(.018+folds*.012+veins*.09+lip*.055+core*.025)*uOpacity*transmission;
        gl_FragColor=vec4(color*transmission,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=3;return mesh;
}
