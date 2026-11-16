import * as THREE from 'three';
import { attachPointDepth } from './point-depth.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { gardenAtmosphereGLSL } from './garden-atmosphere.js';

// Stable surface samples share the leaf deformation. Subpixel splats retain
// coverage, and lose energy continuously instead of switching on/off.
export function createKelpSurface(mesh, uniforms, mobile, distant = false) {
  let seed=81721;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Allocate samples to the visible water volume, not the offscreen roots.
  const vertices=mesh.geometry.getAttribute('position');
  const weights=new Float32Array(vertices.count);
  for(let i=0;i<vertices.count;i++){
    const y=vertices.getY(i), z=vertices.getZ(i), x=vertices.getX(i);
    weights[i]=y>-10 && y<12 && Math.abs(x)<(distant?45:18) ? Math.exp(-Math.max(0,-z)*.055)*Math.exp(-Math.abs(y)*.13)*(z>-4?2.6:1) : 0;
  }
  mesh.geometry.setAttribute('sampleWeight',new THREE.BufferAttribute(weights,1));
  const sampler=new MeshSurfaceSampler(mesh).setWeightAttribute('sampleWeight').setRandomGenerator(random).build();
  const positions=[], normals=[], sizes=[], colors=[];
  const p=new THREE.Vector3(), n=new THREE.Vector3();
  const teal=new THREE.Color(.002,.27,.075), olive=new THREE.Color(.08,.25,.003);
  const attempts=distant?(mobile?100000:340000):(mobile?320000:1450000);
  for(let i=0;i<attempts;i++) {
    sampler.sample(p,n);
    if(p.y < -9 || p.y > 13 || p.z < (distant?-65:-36)) continue;
    positions.push(p.x,p.y,p.z);
    normals.push(n.x,n.y,n.z);
    const mix=.5+.5*Math.sin(p.y*.73+p.x*.8+p.z*.5);
    const c=teal.clone().lerp(olive,Math.pow(mix,8.));
    const gold=Math.exp(-p.distanceTo(new THREE.Vector3(4.1,1.5,2.))*.55);
    c.lerp(new THREE.Color(.7,.34,.005),gold*.88);
    const tissue=.5+.5*Math.sin(p.y*3.2+Math.sin(p.x*4.1)+p.z*2.3);
    c.multiplyScalar((.23+tissue*.9)*(.6+random()*.8));
    colors.push(c.r,c.g,c.b);
    const band=random();
    sizes.push(band<.75 ? .7+random()*.4 : band<.975 ? 1.25+random()*.65 : 2.0+random()*.8);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
  uniforms.uDistant={value:distant?1:0};
  const material=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,vertexColors:true,blending:THREE.NormalBlending,
    vertexShader:`uniform float uTime,uOpacity,uPixelRatio,uDistant;attribute float aSize;
      varying vec3 vColor;varying float vAlpha;varying float vDistance;
      ${gardenAtmosphereGLSL}
      void main(){vec3 p=position;
        p.x+=sin(uTime*.65+p.y*.43+p.z*.3)*.22+sin(uTime*.37+p.y*.9)*.065;
        p.z+=cos(uTime*.48+p.y*.37+p.x*.2)*.14;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        float projected=aSize*uPixelRatio*28./max(2.,-mv.z);
        vDistance=smoothstep(23.,54.,-mv.z);
        // Distant grains merge softly; nearby grains retain crisp individual cores.
        gl_PointSize=clamp(projected,mix(1.65,2.4,vDistance),4.5*uPixelRatio);
        vec3 N=normalize(normalMatrix*normal);
        vec3 view=normalize(-mv.xyz);
        float facing=dot(N,view);
        float rim=pow(clamp(1.-abs(facing),0.,1.),2.1);
        float key=pow(max(0.,dot(N,normalize(vec3(-.3,.9,.25)))),1.5);
        float light=.026+key*.84+rim*.30;
        float transmission=gardenTransmission(-mv.z);
        float separation=exp(-max(0.,-mv.z-19.)*.073);
        vec3 localColor=color*light*mix(1.6,.60,vDistance);
        localColor+=vec3(.0005,.028,.045)*rim;
        vec3 waterTint=vec3(.001,.10,.125)*(.62+key*.65+rim*.4);
        vColor=mix(waterTint,localColor,separation);
        vAlpha=uOpacity*transmission*max(mix(0.,.65,vDistance),min(1.,pow(projected/gl_PointSize,2.)));
        vAlpha*=mix(.36,1.,smoothstep(-.25,.48,facing));
        vAlpha=mix(vAlpha,vAlpha*1.7,uDistant);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;varying float vDistance;
      void main(){float r=length(gl_PointCoord-.5)*2.;float aa=max(fwidth(r),.08);
        float coverage=exp(-r*r*mix(1.4,2.6,vDistance))*(1.-smoothstep(1.-aa,1.,r));
        gl_FragColor=vec4(vColor,vAlpha*coverage);
      }`
  });
  const points=new THREE.Points(g,material);points.renderOrder=2;
  // Occlusion exists only inside each particle, never across a filled leaf.
  if(!distant) attachPointDepth(points,{threshold:.18,radius:.33});
  return points;
}
