import * as THREE from 'three';
import { attachPointDepth } from './point-depth.js';

// One continuous, fixed-coordinate substrate joins all three landmarks.
// Long roots cross the old scene boundaries; no geometry is recycled near camera.
export function createContinuousHabitat({mobile=false,pixelRatio=1,samples=4}={}) {
  let seed=49171;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const positions=[],normals=[],colors=[],sizes=[],kinds=[];
  const point=(p,n,size,kind=0,brightness=1)=>{
    positions.push(...p);normals.push(...n);sizes.push(size);kinds.push(kind);
    const garden=Math.exp(-(((p[2]+55)/32)**2)),tree=THREE.MathUtils.smoothstep(-p[2],80,125);
    const vein=.5+.5*Math.sin(p[0]*6.2+p[2]*2.5+Math.sin(p[1]*4)*2);
    const light=(.22+Math.pow(vein,5)*1.25)*brightness;
    colors.push((.004+tree*.024)*light,(.14+garden*.11-tree*.04)*light,(.22+tree*.19-garden*.11)*light);
  };
  const floor=(x,z)=>-7.3+THREE.MathUtils.smoothstep(-z,82,124)*2.0+Math.sin(x*.27+z*.11)*.9+Math.sin(x*.85-z*.29)*.48+
    Math.pow(.5+.5*Math.sin(x*.62+z*.22),5)*1.4;
  const count=mobile?130000:450000;
  for(let i=0;i<count;i++){
    const z=13-random()*170,kind=i%6;
    if(kind<3){
      const x=(random()-.5)*(i%5===0?36:18),y=floor(x,z);
      const dx=(floor(x+.01,z)-floor(x-.01,z))/.02;
      const dz=(floor(x,z+.01)-floor(x,z-.01))/.02;
      const n=new THREE.Vector3(-dx,1,-dz).normalize();
      point([x,y,z],n.toArray(),.8+random()*.95,0,2.2);
    }else{
      const approach=THREE.MathUtils.smoothstep(-z,78,124);
      const a=random()*Math.PI;
      const radius=THREE.MathUtils.lerp(13.5,10.4,approach);
      const height=THREE.MathUtils.lerp(13,5.4,approach);
      const flute=Math.sin(a*15+z*.21)*.38+Math.sin(a*39-z*.7)*.10;
      const x=Math.cos(a)*(radius+Math.sin(z*.12)*.65+flute);
      const y=Math.sin(a)*(height+flute)-.25;
      const n=new THREE.Vector3(-Math.cos(a),-Math.sin(a),.1).normalize();
      point([x,y,z],n.toArray(),.85+random()*1.1,0,1.65);
      // Lower banks continue the arch down to the shared floor.
      if(i%3===0){
        const side=i%2?1:-1, yy=-6+random()*6;
        point([side*(radius+flute),yy,z],[-side,0,0],.8+random(),0,.7);
      }
    }
  }

  // Braided root shelves on either side of the open swimming channel.
  for(let root=0;root<18;root++){
    const side=root%2?1:-1,phase=random()*6.28;
    const path=[];
    for(let j=0;j<=22;j++){
      const z=12-j*7.5;
      const x=side*(4.6+(root%9)*.75+Math.sin(z*.08+phase)*1.2);
      path.push(new THREE.Vector3(x,floor(x,z)+.3+Math.sin(z*.065+phase)*.65,z));
    }
    const curve=new THREE.CatmullRomCurve3(path);
    const points=mobile?950:3100;
    for(let i=0;i<points;i++){
      const t=random(),p=curve.getPoint(t),tangent=curve.getTangent(t);
      const across=new THREE.Vector3(0,1,0).cross(tangent).normalize();
      const up=tangent.clone().cross(across).normalize();
      const angle=random()*Math.PI*2;
      const radius=(.1+root%4*.04)*(1+.18*Math.sin(t*120+angle*5));
      const n=across.multiplyScalar(Math.cos(angle)).addScaledVector(up,Math.sin(angle));
      p.addScaledVector(n,radius);
      point(p.toArray(),n.toArray(),.9+random()*.85,0,1.7);
    }
  }
  // Root buttresses remain beside the viewer between the landmark clusters.
  function rootTube(path,radius,total){
    const curve=new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(...p)));
    for(let i=0;i<total;i++){
      const t=random(),p=curve.getPoint(t),tangent=curve.getTangent(t);
      const reference=Math.abs(tangent.y)>.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
      const across=reference.cross(tangent).normalize(),up=tangent.clone().cross(across).normalize();
      const a=random()*Math.PI*2,n=across.multiplyScalar(Math.cos(a)).addScaledVector(up,Math.sin(a));
      p.addScaledVector(n,radius*(.35+.65*Math.sin(Math.PI*t))*(1+.13*Math.sin(a*7+t*45)));
      point(p.toArray(),n.toArray(),.8+random()*.8,0,2.8);
    }
  }
  for(const z of [-28,-40,-77,-91,-105,-116])for(const side of [-1,1]){
    const x=side*(5.8+random()*1.8),y=floor(x,z);
    rootTube([[x-side,y,z+2],[x+.3*side,-3,z+.4],[x-side*.6,1,z-1],[x+side,5,z+.5],[x+side*1.8,10,z-1]],.24+random()*.18,mobile?2200:7000);
    for(let branch=0;branch<4;branch++){
      const yy=-3+branch*2.9,reach=side*(1+random()*1.5);
      rootTube([[x,yy,z],[x+reach*.6,yy+.4,z+.4],[x+reach,yy+1.6,z+.8],[x+reach*.6,yy+2.3,z+.1]],.07+random()*.055,mobile?250:850);
    }
  }
  // Sparse drifting grains give an unbroken parallax reference through the gaps.
  for(let i=0;i<(mobile?4500:15000);i++){
    point([(random()-.5)*30,-6+random()*20,16-random()*177],[0,1,0],.4+random()*.7,1,.7);
  }
  const geometry=new THREE.BufferGeometry();
  for(const [key,data,size] of [['position',positions,3],['normal',normals,3],['color',colors,3],['aSize',sizes,1],['aKind',kinds,1]])
    geometry.setAttribute(key,new THREE.Float32BufferAttribute(data,size));
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uOpacity:{value:1},uPixelRatio:{value:pixelRatio},uDepthSamples:{value:samples>1?1:0}},
    transparent:true,depthWrite:false,vertexColors:true,
    vertexShader:`uniform float uTime,uPixelRatio,uOpacity;attribute float aSize,aKind;
      varying vec3 vColor;varying float vAlpha;
      void main(){
        vec3 p=position;
        if(aKind>.5){p.x+=sin(uTime*.17+p.z*.19)*.16;p.y+=sin(uTime*.12+p.x*.7)*.12;}
        vec4 mv=modelViewMatrix*vec4(p,1.);
        vec3 n=normalize(normalMatrix*normal);
        float edge=pow(clamp(1.-abs(dot(n,normalize(-mv.xyz))),0.,1.),2.);
        float key=max(0.,dot(normal,normalize(vec3(-.4,1.,.25))));
        float fog=exp(-max(0.,-mv.z-13.)*.035);
        vColor=color*(.16+key*.6+edge*.8);
        vColor=mix(vec3(.001,.022,.034),vColor,fog);
        float projected=aSize*uPixelRatio*33./max(2.,-mv.z);
        gl_PointSize=clamp(projected,1.6,3.3*uPixelRatio);
        vAlpha=uOpacity*min(1.,pow(projected/gl_PointSize,2.))*fog;
        if(aKind>.5)vAlpha*=.35;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;
      void main(){float r=length(gl_PointCoord-.5)*2.,aa=max(fwidth(r),.08);
        float cover=exp(-r*r*1.7)*(1.-smoothstep(1.-aa,1.,r));
        gl_FragColor=vec4(vColor,cover*vAlpha);
      }`
  });
  const habitat=new THREE.Points(geometry,material);habitat.name='Continuous seabed, roots, walls and water';
  attachPointDepth(habitat,{threshold:.25,radius:.22});
  return habitat;
}
