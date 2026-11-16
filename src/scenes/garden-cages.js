import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gardenAtmosphereGLSL } from './garden-atmosphere.js';
export function createGardenCages(layout,mobile){
  const parts=[];
  const tube=(points,width)=>{
    const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),mobile?32:56,width,5,false);
    g.deleteAttribute('uv');parts.push(g);
  };
  layout.forEach(([cx,cy,cz,r],id)=>{
    for(let rib=0;rib<8;rib++){
      const points=[];
      for(let i=0;i<=24;i++){
        const p=i/24*Math.PI,a=rib/8*Math.PI*2+Math.sin(p*2+id)*.15;
        points.push(new THREE.Vector3(cx+Math.sin(p)*Math.cos(a)*r,cy+Math.cos(p)*r,cz+Math.sin(p)*Math.sin(a)*r));
      }
      tube(points,r*(rib%3===0?.028:.018));
    }
    for(let band=0;band<3;band++){
      const phi=.65+band*.86, points=[];
      for(let i=0;i<=48;i++){
        const a=i/48*Math.PI*2,p=phi+Math.sin(a*3+id)*.08;
        points.push(new THREE.Vector3(cx+Math.sin(p)*Math.cos(a)*r,cy+Math.cos(p)*r,cz+Math.sin(p)*Math.sin(a)*r));
      }
      tube(points,r*.018);
    }
    tube([new THREE.Vector3(cx,cy-r*.7,cz),new THREE.Vector3(cx+r*.1,cy,cz),new THREE.Vector3(cx,cy+r*.5,cz)],r*.075);
  });
  const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uOpacity:{value:0}},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime;varying float vDepth;varying vec3 vLocal;varying vec3 vNormal;
      void main(){vec3 p=position;vLocal=p;vNormal=normalize(normalMatrix*normal);
        p.x+=sin(uTime*.46+p.y*.82+p.z*1.7)*.035;
        p.z+=cos(uTime*.38+p.y*.58+p.x*1.2)*.035*.76;
        vec4 mv=modelViewMatrix*vec4(p,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`uniform float uOpacity;varying float vDepth;varying vec3 vLocal;varying vec3 vNormal;
      ${gardenAtmosphereGLSL}
      void main(){float pulse=.5+.5*sin(vLocal.y*19.+sin(vLocal.x*11.)+vLocal.z*9.);
        float light=.3+.7*abs(dot(normalize(vNormal),normalize(vec3(.2,.8,1.))));
        vec3 color=mix(vec3(.003,.10,.16),vec3(.008,.85,1.65),pulse)*light;
        float transmission=gardenTransmission(vDepth);
        gl_FragColor=vec4(color*transmission,uOpacity*.78*transmission);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  return new THREE.Mesh(g,material);
}
