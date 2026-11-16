import * as THREE from 'three';
import { attachPointDepth } from './point-depth.js';

const TAU=Math.PI*2;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const curve=points=>new THREE.CatmullRomCurve3(points.map(p=>Array.isArray(p)?V(...p):p));
const mix=THREE.MathUtils.lerp;
const smooth=THREE.MathUtils.smoothstep;
function rng(seed){let s=seed;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}
function profile(values,t){const q=t*(values.length-1),i=Math.min(values.length-2,Math.floor(q));return mix(values[i],values[i+1],smooth(q-i,0,1));}

function material(ratio,height,mode='wood'){
  return new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uOpacity:{value:0},uPixelRatio:{value:ratio},uViewportHeight:{value:height}},
    transparent:true,vertexColors:true,depthWrite:false,
    blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor,
    vertexShader:`attribute float aSize;attribute float aKind;
      uniform float uTime,uOpacity,uPixelRatio,uViewportHeight;
      varying vec3 vColor;varying float vAlpha;
      void main(){
        vec3 p=position; vec3 n=normal;
        ${mode==='ray'?`
          float w=clamp(abs(p.x)/2.15,0.,1.);
          float phase=uTime*1.55-w*2.3+sign(p.x)*.28;
          p.z+=sin(phase)*pow(w,1.65)*.38;
          p.y+=sin(phase-.3)*w*w*.13;
          n.x-=cos(phase)*w*sign(p.x)*.55;
          float tail=smoothstep(.75,2.7,-p.y);
          p.x+=sin(uTime*1.3+p.y*2.5)*tail*.11;
        `:mode==='drift'?`
          p.x+=sin(uTime*.2+p.z*.19)*.6;
          p.y=mod(p.y+uTime*.1+8.,16.)-8.;
        `:mode==='wood'||mode==='glow'?`
          float flex=smoothstep(.5,5.5,p.y)*smoothstep(.7,6.,abs(p.x-2.1));
          p.x+=sin(uTime*.44+p.y*.42+p.z*.2)*flex*.1;
          p.z+=cos(uTime*.37+p.x*.3)*flex*.07;
          if(aKind>1.5){p.y+=sin(uTime*.43+p.x)*.1;p.x+=sin(uTime*.27+p.z)*.07;}
        `:''}
        vec4 mv=modelViewMatrix*vec4(p,1.);
        vec3 N=normalize(normalMatrix*n);
        float rim=pow(clamp(1.-abs(dot(N,normalize(-mv.xyz))),0.,1.),2.1);
        vec3 localN=normalize(n);
        float key=max(0.,dot(localN,normalize(vec3(-5.,7.,5.)-p)));
        float heart=exp(-length(p-vec3(1.4,2.,1.))* .82);
        float heartFace=max(.1,dot(localN,normalize(vec3(1.4,2.,1.)-p)));
        ${mode==='glow'||mode==='drift'?'vColor=color;':`
          vColor=color*(.035+key*1.5+rim*.32);
          float bounce=max(0.,dot(localN,normalize(vec3(4.,1.,-5.)-p)));
          vColor+=color*vec3(.12,.45,1.1)*bounce*.3;
          vColor+=color*vec3(1.2,.6,3.0)*heart*heartFace*1.5;
          vColor+=vec3(.09,.072,.48)*heart*heart*heartFace;
        `}
        ${mode==='ray'?'vColor=color*(.42+key*.65+rim*.6);vColor+=vec3(.09,.025,.16)*rim*(.25+.75*w);':''}
        float depth=max(0.,-mv.z-17.);
        float fog=exp(-depth*.043);
        vColor=mix(vec3(.004,.022,.058),vColor,fog);
        vColor=mix(vColor,vColor*vec3(.3,.85,1.05),smoothstep(25.,52.,-mv.z)*.7);
        float diameter=aSize*uPixelRatio*48.*(uViewportHeight/940.)/max(2.,-mv.z);
        gl_PointSize=clamp(diameter,1.65,4.2*uPixelRatio);
        float coverage=min(1.,pow(diameter/gl_PointSize,2.));
        vAlpha=uOpacity*coverage*mix(.55,1.,fog);
        ${mode==='wood'||mode==='stone'?'vAlpha*=mix(.3,1.,smoothstep(-.15,.45,dot(N,normalize(-mv.xyz))));':''}
        ${mode==='ray'?'vAlpha*=.72;':''}
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;
      void main(){float r=length(gl_PointCoord-.5),aa=max(fwidth(r)*.7,.035);
        float alpha=vAlpha*(1.-smoothstep(.39-aa,.39+aa,r));
        gl_FragColor=vec4(vColor*alpha,alpha);
      }`
  });
}

// The sampler follows the anatomical flow of each limb. Fine fibers are
// concentrated on ridges; fissures are missing surface, not a black mesh.
function reservoir(capacity,random){
  const p=new Float32Array(capacity*3),n=new Float32Array(capacity*3),c=new Float32Array(capacity*3),s=new Float32Array(capacity),k=new Float32Array(capacity);
  let count=0;
  return {
    point(P,N,C,size,kind=0){
      if(count>=capacity)throw new Error('Cove particle budget exceeded');
      if(!Number.isFinite(P.x+P.y+P.z+N.x+N.y+N.z)||N.lengthSq()<1e-8)return;
      const i=count*3;p.set(P.toArray(),i);n.set(N.clone().normalize().toArray(),i);c.set(C,i);s[count]=size;k[count++]=kind;
    },
    geometry(){const g=new THREE.BufferGeometry();for(const [name,a,dim] of [['position',p,3],['normal',n,3],['color',c,3],['aSize',s,1],['aKind',k,1]])g.setAttribute(name,new THREE.BufferAttribute(a.slice(0,count*dim),dim));g.computeBoundingSphere();return g;},
    wood(path,radii,samples,seed=0,gain=1){
      const frames=path.computeFrenetFrames(160,false),length=path.getLength();
      for(let i=0;i<samples;i++){
        const t=(i+.5)/samples,fi=Math.min(160,Math.floor(t*160));
        const baseAngle=(i*2.39996323)%TAU;
        const warp=.5*Math.sin(t*13+seed)+.22*Math.sin(t*37+seed*2)+.055*Math.sin(t*91+seed);
        const a=baseAngle+warp;
        const center=path.getPoint(t),N=frames.normals[fi].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[fi],Math.sin(a));
        const B=frames.normals[fi].clone().multiplyScalar(-Math.sin(a)).addScaledVector(frames.binormals[fi],Math.cos(a));
        const grooves=7+(seed%4),u=a*grooves+Math.sin(t*18+seed)*1.5+Math.sin(t*43+a*2)*.65;
        const ridge=Math.pow(.5+.5*Math.cos(u),9);
        const patch=Math.pow(.5+.5*Math.sin(t*39+Math.sin(a*3)*2.6+seed),2);
        const pores=.5+.5*Math.sin(a*37+t*311+Math.sin(a*13-t*91)*2);
        const tear=Math.sin(a*3+t*7+seed);
        if(tear>.89 && ridge<.2)continue;
        const radius=profile(radii,t),knots=1+.22*Math.sin(t*14+seed)*Math.sin(t*9+seed*.3);
        const corr=1+.15*Math.cos(u)+.075*Math.sin(a*11+t*63)+.035*Math.sin(a*31-t*113);
        const P=center.addScaledVector(N,radius*knots*corr);
        P.addScaledVector(frames.tangents[fi],(random()-.5)*length/samples*4);
        const radialSlope=-.15*Math.sin(u)*(grooves+1.3*Math.cos(t*43+a*2))+.825*Math.cos(a*11+t*63)+1.085*Math.cos(a*31-t*113);
        const normal=N.clone().addScaledVector(B,-radialSlope*.38/corr).normalize();
        const violet=.68*smooth(Math.sin(P.x*.66+P.y*.91+P.z*.3),.35,.95);
        const fineRidge=Math.pow(.5+.5*Math.cos(a*27+Math.sin(t*31+seed)+t*4),16);
        const brightness=(.012+(ridge*(.12+patch*1.1)+fineRidge*.16*patch)*(.3+pores*.7))*gain;
        const spec=ridge>.9&&patch>.8 ? 1.4:1;
        const color=[mix(.018,.3,violet)*brightness*spec,mix(.48,.08,violet)*brightness, mix(1.4,1.65,violet)*brightness];
        const grade=random(),size=grade<.7?.55+random()*.45:grade<.97?1.+random()*.5:1.7+random()*.7;
        this.point(P,normal,color,size);
      }
    },
    line(path,samples,color,radius=.01){
      const frames=path.computeFrenetFrames(60,false);
      for(let i=0;i<samples;i++){
        const t=(i+.5)/samples,fi=Math.min(60,Math.floor(t*60)),a=i*2.39996323;
        const N=frames.normals[fi].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[fi],Math.sin(a));
        const P=path.getPoint(t).addScaledVector(N,radius*(.5+.5*Math.sin(t*Math.PI)));
        this.point(P,N,color,.65+random()*.45);
      }
    }
  };
}

export function createCoveScene({mobile=false,pixelRatio=1,viewportHeight=940,samples=4}={}){
  const random=rng(73319),group=new THREE.Group(),materials=[],swimmers=[];
  group.name='Scene 03 / hollow ancient tree in a deep cavern';
  const quality=mobile?.4:1;
  const trunk=reservoir(Math.ceil(710000*quality),random),roots=reservoir(Math.ceil(580000*quality),random),crown=reservoir(Math.ceil(680000*quality),random);
  const foreground=reservoir(Math.ceil(100000*quality),rng(65109));
  const cave=reservoir(Math.ceil(550000*quality),random),glow=reservoir(Math.ceil(66000*quality),random);
  const count=n=>Math.ceil(n*quality);
  const wood=(data,points,radii,n,seed,gain=1)=>{const path=curve(points);data.wood(path,radii,count(n),seed,gain);return path;};
  const tip=(path,radius=.055)=>{
    const end=path.getPoint(1),dir=path.getTangent(1),axis=V(0,0,1).cross(dir).normalize(),bin=dir.clone().cross(axis).normalize();
    for(let i=0;i<count(210);i++){
      const t=random(),a=random()*TAU,r=radius*Math.sin(t*Math.PI)*Math.sqrt(random());
      const P=end.clone().addScaledVector(dir,(t-.5)*radius*7).addScaledVector(axis,Math.cos(a)*r).addScaledVector(bin,Math.sin(a)*r);
      glow.point(P,dir,[1.6+t*1.4,.1+t*.25,3.8+t*1.3],.7+random()*.55,1);
    }
  };

  // Hand-composed load-bearing masses: divergent paths leave real hollows
  // around the heart and break the silhouette at different heights.
  const trunks=[
    {p:[[-5,-5,6],[-1.2,-3,3],[1.6,-1.4,.8],[2.6,-.1,1.1],[1.9,1.35,.4],[.6,3.2,.2],[-2.8,5.8,-1]],r:[.8,1.05,.84,.7,.56,.4,.07]},
    {p:[[8,-5,5],[5,-3.1,3],[3.5,-1.4,1],[3.1,.1,1.15],[3.4,1.8,.5],[3,3.3,-.4],[6.1,6.2,-1]],r:[.55,1.1,.84,.65,.49,.4,.07]},
    {p:[[1.6,-5.2,6],[2.7,-2.8,2.8],[2.3,-1.25,1.8],[1.25,.2,1.25],[1.5,1.5,.5],[.15,2.9,.1],[-3.9,4.7,-.7]],r:[.8,.91,.67,.5,.38,.28,.04]},
    {p:[[6,-4.9,1],[4.1,-2.5,-.3],[2.7,-.8,-.55],[2.45,.85,-.6],[1.8,2.3,-.55],[3.1,4.3,-1.4],[4.4,6.5,-2]],r:[.7,.9,.72,.67,.47,.35,.04]},
    {p:[[-2.5,-4.4,1],[.8,-2.2,-.4],[1.3,-.7,-.8],[1.05,.8,-.5],[.85,2.0,-.3],[-.9,3.9,-1],[-4.8,5.4,-2]],r:[.64,.8,.6,.45,.38,.24,.04]},
    {p:[[4,-5,5.5],[4,-2.5,1.8],[2.65,-.8,1.4],[2.1,.2,.75],[2.9,1.5,.65],[3.9,2.8,.1],[7.6,5,-1.6]],r:[.52,.75,.56,.38,.3,.25,.03]}
  ];
  const mainPaths=trunks.map((t,i)=>wood(trunk,t.p,t.r,43000,i,1.15));

  // Buttress membranes fold between selected masses; tears and rolled edges
  // replace the previous smooth helices. No closed central cylinder exists.
  for(let band=0;band<14;band++){
    const path=mainPaths[band%6],start=.12+(band%3)*.12,end=Math.min(.87,start+.36+random()*.13);
    const frames=path.computeFrenetFrames(120,false),phase=band*2.4;
    for(let i=0,n=count(10500);i<n;i++){
      const u=(i+.5)/n,t=mix(start,end,u),across=(i*.61803398875%1)*2-1,fi=Math.floor(t*120);
      const r=profile(trunks[band%6].r,t),a=phase+u*.65;
      const N=frames.normals[fi].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[fi],Math.sin(a));
      const B=frames.normals[fi].clone().multiplyScalar(-Math.sin(a)).addScaledVector(frames.binormals[fi],Math.cos(a));
      const width=(.26+.33*Math.sin(u*Math.PI))*Math.pow(Math.sin(u*Math.PI),.4);
      const fold=Math.sin(across*10+u*9)*.08+Math.sin(u*39+across*4)*.025;
      if(Math.sin(u*20+across*7+band)>.82&&Math.abs(across)>.35)continue;
      const P=path.getPoint(t).addScaledVector(N,r+fold).addScaledVector(B,across*width);
      const norm=N.clone().addScaledVector(B,-Math.cos(across*10+u*9)*.8/Math.max(.12,width)).normalize();
      const ridge=Math.pow(Math.abs(across),5)+Math.pow(.5+.5*Math.cos(across*10+u*9),12)*.5;
      const bright=(.025+ridge*.8)*(.3+.7*Math.pow(.5+.5*Math.sin(u*17+band),2));
      const purple=band%3===0;
      trunk.point(P,norm,purple?[bright*.7,bright*.15,bright*1.1]:[bright*.06,bright*.75,bright],.55+random()*.75);
    }
  }
  // Split knots wrap locally around crotches, never around the entire tree.
  for(let i=0;i<23;i++){
    const path=mainPaths[i%6],t=.31+random()*.38,center=path.getPoint(t),r=profile(trunks[i%6].r,t)*1.1,points=[];
    for(let j=0;j<9;j++){const a=j/8*TAU*.87+i;points.push(center.clone().add(V(Math.cos(a)*r,Math.sin(a)*r*.55,Math.sin(a*.8)*r*.5+.12)));}
    wood(trunk,points,[.065,.15,.12,.018],2300,i+18,1.3);
  }

  // Short adventitious limbs and braided cambium cross the long load-bearing
  // fibers. Their scale hierarchy makes local cavities legible in the trunk.
  for(let i=0;i<52;i++){
    const index=i%6,path=mainPaths[index],t=.26+random()*.51;
    const p=path.getPoint(t),q=path.getPoint(Math.min(.97,t+.12+random()*.13));
    const side=i%2?1:-1,offset=V(side*(.18+random()*.4),.15+random()*.4,.3+random()*.3);
    const r=profile(trunks[index].r,t);
    p.z+=r*.7;q.z+=profile(trunks[index].r,Math.min(.97,t+.18))*.6;
    const middle=p.clone().lerp(q,.5).add(offset);
    wood(trunk,[p,p.clone().lerp(middle,.7).add(V(-side*.14,-.08,.1)),middle,q],[.065+random()*.09,.075,.055,.008],1500,190+i,.9);
    if(i%3===0){
      const branch=middle.clone().add(V(side*(.35+random()*.5),.4+random()*.5,-.1));
      wood(trunk,[middle,middle.clone().lerp(branch,.5).add(V(0,.1,.15)),branch],[.045,.028,.003],650,250+i,.8);
    }
  }

  // Unequal roots travel laterally, buckle over one another, then dive into
  // the near floor. Their endpoints are arranged in groups rather than spokes.
  const rootEnds=[[-11,-5,6],[-9,-4.9,8],[-6.7,-5.6,9],[-4,-5,7],[-1.4,-5.5,9],[2,-5.4,9],[5.5,-5.1,8],[9,-4.8,7],[12,-4.5,5],[-10,-3.8,0],[10,-3.9,-1],[-7,-4.2,-3]];
  rootEnds.forEach((end,i)=>{
    const side=end[0]<2?-1:1,start=V(2+(i%3)*.4,-1.1-(i%4)*.22,.4+(i%3)*.5);
    const path=wood(roots,[start,V(2+side*1.5,-1.9,1+(i%4)*.4),V(mix(2,end[0],.47),-2.7+(i%3)*.3,end[2]*.5),V(mix(2,end[0],.77),-3.8,end[2]*.75),V(...end)],[.68+(i%3)*.13,.64,.53,.32,.08],17000,i+31,1.1);
    for(let j=0;j<3;j++){
      const t=.3+j*.17,p=path.getPoint(t),q=path.getTangent(t),r=profile([.7,.55,.35,.08],t);
      wood(roots,[p,p.clone().addScaledVector(q,.8).add(V(side*.15,.35,.15)),p.clone().addScaledVector(q,2).add(V(-side*.35,-.5,.75)),p.clone().addScaledVector(q,3.1).add(V(side*.4,-1.25,1.1))],[r*.3,r*.2,.06,.012],2600,i+j+40,.9);
    }
  });
  const nearTendrils=[
    [[-10,-5.5,7],[-7.8,-4.1,6],[-6.8,-2.8,4],[-5.8,-2.5,3.5]],
    [[-7,-5.8,8],[-5.8,-4.2,7],[-5.4,-3.0,5.5],[-5.8,-2.65,4.9]],
    [[-4.3,-5.8,8],[-3.8,-4.7,7],[-3.7,-3.7,6],[-3.8,-3.45,5.5]],
    [[10,-5.5,7],[8,-3.7,6],[7.3,-2.5,4.2],[6.1,-2.15,3]],
    [[9,-5.4,8],[7.4,-4.6,7],[6.7,-3.6,6.2],[6.1,-3.35,5.8]],
    [[6,-6,9],[5.6,-5,8],[4.9,-4.5,7.5],[4.7,-4.3,7]]
  ];
  nearTendrils.forEach((points,i)=>{
    const path=wood(roots,points,[.22,.17,.085,.012],7000,i+60,1.3);
    tip(path,.055);
  });

  // An eroded, uneven root bed joins the buttresses into a foreground landform.
  // It stays below the exposed roots, so overlaps retain dark separations.
  for(let i=0,n=count(96000);i<n;i++){
    const x=-10+random()*22,z=-2+random()*13;
    const d=Math.hypot((x-2)*.65,z*.65),a=Math.atan2(z,x-2);
    const ridge=Math.pow(.5+.5*Math.sin(a*13+d*.7+Math.sin(d*2)*.45),5);
    const rubble=Math.sin(x*3.1+z*2.3)*Math.sin(z*4.2-x*1.7);
    const y=-5.3+Math.exp(-d*.32)*2.1+ridge*.32+rubble*.12;
    const P=V(x,y,z),N=V(Math.sin(x*3.1)*.2,1,Math.cos(z*4.2)*.2).normalize();
    const light=(.009+ridge*.07)*(.3+random()*.7);
    roots.point(P,N,[light*.12,light*.55,light],.65+random()*.75);
  }

  // Major branches have explicit insertion points on the trunk. Each carries
  // secondary forks and tapering tertiary twigs with a shared growth direction.
  const limbs=[
    [[1.7,.65,.4],[-.1,1.05,.7],[-1.8,1.2,.5],[-3.3,1.8,-.1]],
    [[1.1,1.8,.2],[-.4,2.25,.6],[-2.6,2.4,.2],[-4.8,3.25,-.7]],
    [[.5,2.9,.1],[-1.3,3.8,.4],[-3.3,4.1,-.1],[-5.2,5.4,-1]],
    [[2.7,1.05,.5],[3.8,1.3,.9],[5,1.6,.6],[6.7,2.2,-.5]],
    [[3.3,2.2,.2],[4.2,3.1,.4],[5.8,3.4,-.1],[8.1,4.2,-1.2]],
    [[2.1,2.1,-.6],[1,3.9,-.8],[-.3,4.8,-1.4],[-1.3,6.8,-2]],
    [[3,3.3,-.4],[3.4,4.8,-.6],[2.6,5.5,-1.1],[2.4,7.1,-1.6]],
    [[1.8,-.15,-.5],[.2,.1,-1.3],[-1.9,.65,-2.1],[-3.3,1.5,-3]],
    [[3.1,-.3,-.3],[4.4,.3,-1.2],[5.3,.8,-2.3],[6.6,1.6,-3.1]]
  ];
  const sprout=(path,radius,depth,seed)=>{
    crown.wood(path,[radius,radius*.7,radius*.32,.006],count(depth===2?10500:depth===1?2300:650),seed,1.7);
    if(depth===0){if(random()<.12)tip(path,.042);return;}
    const branches=depth===2?6:3;
    for(let j=0;j<branches;j++){
      const t=.16+(j+.15+random()*.65)/branches*.73,p=path.getPoint(t),direction=path.getTangent(t);
      const length=(depth===2?1.5:.65)*(.65+random());
      const out=direction.clone().multiplyScalar(.55).add(V((random()-.5)*1.8,.15+random()*1.2,(random()-.5)*1.6)).normalize();
      const end=p.clone().addScaledVector(out,length);
      const next=curve([p,p.clone().addScaledVector(direction,length*.27),end.clone().add(V(.12,-.25,.12)),end]);
      sprout(next,radius*(.22+random()*.16),depth-1,seed+j*.41);
    }
    if(depth===2)tip(path,.065);
  };
  limbs.forEach((p,i)=>sprout(curve(p),.22+(i%3)*.095,2,80+i));
  mainPaths.forEach((path,i)=>{
    const p=path.getPoint(.8),end=path.getPoint(1),tangent=path.getTangent(1);
    sprout(curve([p,path.getPoint(.9),end,end.clone().addScaledVector(tangent,1.8)]),.2,2,100+i);
  });

  // Rock surfaces form three independently occluding distances: near roof
  // and shelves, fluted middle walls, and an eroded far chamber.
  for(let layer=0;layer<3;layer++){
    const total=count(layer===0?120000:95000);
    for(let i=0;i<total;i++){
      const a=(i*2.39996323)%TAU,z=mix(layer===0?3:-9,layer===0?-9:layer===1?-22:-39,random());
      const base=layer===0?10.4:layer===1?13.5:17;
      const wave=Math.sin(a*7+z*.28)*.75+Math.sin(a*19+z*.8)*.25;
      const chipped=.1*Math.sin(a*67+z*5.1)+.08*Math.sin(a*113-z*8.3);
      const radius=base+wave+chipped,sy=layer===0?5.4:layer===1?7.2:10;
      const P=V(Math.cos(a)*radius,Math.sin(a)*(sy+wave*.4)-.25,z);
      if(P.y<-5.1)continue;
      const N=V(-Math.cos(a),-Math.sin(a),.16).normalize();
      const stratum=Math.pow(.5+.5*Math.sin(a*21+z*.23+Math.sin(z*.7)),8);
      const patch=Math.pow(.5+.5*Math.sin(a*4+z*.31),2);
      const grain=.5+.5*Math.sin(a*97+z*7+Math.sin(a*13-z*2)*3);
      const lum=(.014+stratum*(.18+patch*.4))*(.25+.75*grain);
      cave.point(P,N,[lum*.016,lum*.33,lum*.8],.75+random()*1.2);
    }
  }
  const shelves=[[-10,-3.8,2,4,1.1,5],[10,-3.6,1,3,1.5,5],[-12,.1,-10,4,5,8],[12,.7,-14,3,6,8],[-4,-5,-10,9,1.8,10]];
  shelves.forEach(([x,y,z,sx,sy,sz],j)=>{
    for(let i=0,n=count(18000);i<n;i++){
      const v=(i+.5)/n*2-1,a=i*2.39996323,r=Math.sqrt(1-v*v),rough=1+.14*Math.sin(a*9+v*7)+.05*Math.sin(a*31-v*19);
      const N=V(Math.cos(a)*r,v,Math.sin(a)*r),P=V(x+N.x*sx*rough,y+N.y*sy*rough,z+N.z*sz*rough);
      const edge=Math.pow(.5+.5*Math.sin(v*22+a*11),12),light=.016+edge*.42;
      cave.point(P,N,[light*.05,light*.6,light],.65+random());
    }
  });
  for(let i=0;i<26;i++){
    const side=i%2?1:-1,z=-5-random()*24,x=side*(8.5+random()*4);
    wood(cave,[[x,6.5,z],[x-side*.6,3.3,z-.3],[x-side*.2,-.4,z+.7],[x-side*.8,-5,z+1]],[.3,.35,.27,.1],2300,130+i,.42);
  }

  // Isolated distant pillars provide scale cues behind the open swimming lane.
  for(let i=0;i<9;i++){
    const x=-8+(i%5)*3.2,z=-13-Math.floor(i/5)*12-random()*5;
    wood(cave,[[x-1,7,z],[x+.35,3.5,z-.6],[x-.3,-.8,z],[x+.5,-5,z+1]],[.28,.42,.25,.48],2700,290+i,.6);
  }

  // Lantern membranes are broken translucent patches with long filaments,
  // not evenly patterned glowing spheres.
  const lanterns=[[-7.7,2.8,-1,.48],[-7.5,-1.4,-2,.33],[-5.5,-2.1,-4,.29],[7.8,2.7,-3,.37],[8.1,.9,-3,.32],[-10,2.1,-11,.35],[11,.4,-12,.4]];
  for(const [x,y,z,r] of lanterns){
    for(let i=0,n=count(3300);i<n;i++){
      const v=(i+.5)/n*2-1,a=i*2.39996323,ring=Math.sqrt(1-v*v),N=V(Math.cos(a)*ring,v,Math.sin(a)*ring);
      const patch=Math.sin(a*3+v*8+Math.sin(a*7+v*11)*2.4)*Math.sin(a*5-v*7);
      if(patch<.55)continue;
      glow.point(V(x+N.x*r,y+N.y*r,z+N.z*r),N,[.005,.08+patch*.27,.32+patch*.9],.7+random()*.7,2);
    }
    for(let j=0;j<12;j++){
      const a=j/12*TAU;
      cave.line(curve([[x+Math.cos(a)*r*.65,y-r*.7,z+Math.sin(a)*r*.65],[x+Math.cos(a)*r*.55,y-2,z+.1],[x+.12*Math.sin(j),y-5.5,z-.6]]),count(450),[.015,.18,.3],.009);
    }
  }
  // Curved, separated luminous blades are enclosed by a gnarled wood cradle.
  const heartBlades=[
    [[1.25,1.72,1.12],[1.05,2.,1.18],[1.08,2.28,1.02]],
    [[1.43,1.71,1.18],[1.39,2.04,1.26],[1.55,2.39,1.06]],
    [[1.56,1.73,1.1],[1.7,1.98,1.2],[1.67,2.21,1.04]]
  ];
  heartBlades.forEach((points,i)=>{
    const path=curve(points);
    for(let j=0,n=count(1200);j<n;j++){
      const t=random(),a=random()*TAU,r=(i===1?.065:.052)*Math.pow(Math.sin(t*Math.PI),.8);
      glow.point(path.getPoint(t).add(V(Math.cos(a)*r,0,Math.sin(a)*r)),V(0,0,1),[2.4,.65+t*.55,4.3],.6+random()*.4,1);
    }
  });
  for(let i=0;i<9;i++){
    const a=i/9*TAU;
    wood(trunk,[[1.7+Math.cos(a)*.55,1.25,Math.sin(a)*.45+.6],[1.2+Math.cos(a+.3)*.65,2.,Math.sin(a+.3)*.5+.6],[1.45+Math.cos(a+.7)*.42,2.6,Math.sin(a+.7)*.4+.5]],[.095,.075,.02],1500,170+i,1.65);
  }

  // Return branches reconnect the crown's larger forks. Fine cambium bridges
  // concentrate detail around the heart while preserving the swimming lane.
  const details=rng(290313),detailPaths=[];
  for(let i=0;i<48;i++){
    const parent=curve(limbs[i%limbs.length]),t=.25+details()*.65;
    const start=parent.getPoint(t),direction=parent.getTangent(t),side=i%2?1:-1;
    const span=.5+details()*1.15;
    const end=start.clone().add(V(side*span,.75+details()*.8,-.2+details()*.8));
    const path=curve([start,start.clone().addScaledVector(direction,span*.4),end.clone().add(V(side*.23,-.12,.12)),end]);
    crown.wood(path,[.065,.044,.023,.003],count(1450),310+i,1.9);
    detailPaths.push(path);
    if(i%8===0)tip(path,.04);
  }
  // A finer branch order supplies readable structure between the lit main
  // limbs. It uses the parent tangent, so detail stays attached to the tree.
  detailPaths.forEach((parent,i)=>{
    for(let j=0;j<2;j++){
      const t=.3+j*.29,start=parent.getPoint(t),tangent=parent.getTangent(t);
      const side=(i+j)%2?1:-1,length=.3+details()*.5;
      const end=start.clone().addScaledVector(tangent,length*.5).add(V(side*length*.7,length*.65,(details()-.5)*.4));
      const path=curve([start,start.clone().addScaledVector(tangent,length*.35),end.clone().add(V(-side*.08,-.05,.06)),end]);
      crown.wood(path,[.026,.018,.009,.002],count(500),430+i+j*.2,2.2);
    }
  });
  for(let i=0;i<30;i++){
    const a=i/30*TAU,tilt=Math.sin(a*3)*.3;
    const points=[[1.3+Math.cos(a)*.63,1.35+Math.sin(a)*.22,.6+Math.sin(a)*.35],
      [.85+Math.cos(a+.7)*.85,2.1+tilt,.58+Math.sin(a+.7)*.5],
      [1.1+Math.cos(a+1.5)*1.1,2.9+tilt,.55+Math.sin(a+1.5)*.75],
      [1.5+Math.cos(a+1.9)*1.25,3.5+tilt,.2+Math.sin(a+1.9)*.75]];
    wood(trunk,points,[.025,.045,.032,.003],1250,370+i,2.0);
  }

  // Near-camera roots cross the middle root bed at distinct depths, rather
  // than sharing its radial fan. They create occlusion and strong parallax.
  const foregroundRoots=[
    [[-11,-5.7,9],[-7.1,-3.55,7],[-4.8,-3.1,5.9],[-2.1,-3.45,4],[1.2,-2.1,1.2]],
    [[10,-5.8,9],[7.3,-3.7,7],[6,-3.05,5],[4.7,-3.2,3.8],[3.1,-1.8,1.1]],
    [[-8,-5.8,10],[-4.2,-4.2,8],[-1.7,-3.75,6],[.25,-2.6,3.1],[2,-1.6,1]],
    [[8,-6,10],[5.3,-4.3,8],[3.9,-3.7,5.5],[3.35,-2.8,3],[2.7,-1.4,1]]
  ];
  foregroundRoots.forEach((points,i)=>{
    foreground.wood(curve(points),[.14,.37,.43,.28,.12],count(21000),510+i,1.25);
  });

  function flush(data,mode,name,occlusion=true){
    const mat=material(pixelRatio,viewportHeight,mode);materials.push(mat);
    const object=new THREE.Points(data.geometry(),mat);object.name=name;
    if(occlusion){attachPointDepth(object,{threshold:.23,radius:.27});mat.uniforms.uDepthSamples.value=samples>1?1:0;}
    group.add(object);return object;
  }
  flush(cave,'stone','Cavern / near vault, middle walls and far chamber');
  flush(roots,'wood','Tree / grouped overlapping root buttresses');
  flush(foreground,'wood','Tree / near roots crossing the middle ground');
  flush(trunk,'wood','Tree / torn trunk, hollow crotches and folded bark');
  flush(crown,'wood','Tree / connected primary, secondary and tertiary crown');
  const luminous=flush(glow,'glow','Tree / luminous blades, growing tips and lanterns',false);luminous.renderOrder=3;

  // Light exists at specific depths inside the cavern. Foreground depth
  // cores occlude these soft curtains, keeping the tree separate from haze.
  const lightCurtains=[[-4,1,-7,5.5,15,-.16,[.006,.08,.19]],[-1.4,1,-17,4.2,19,.09,[.004,.048,.17]],[5.8,2,-11,4.5,16,.18,[.012,.035,.15]]];
  lightCurtains.forEach(([x,y,z,width,height,tilt,color],i)=>{
    const mat=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uOpacity:{value:0},uPixelRatio:{value:pixelRatio},uViewportHeight:{value:viewportHeight},uTint:{value:new THREE.Color(...color)},uPhase:{value:i*2.7}},
      transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,
      vertexShader:`varying vec2 vUv;varying float vDepth;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying vec2 vUv;varying float vDepth;uniform float uTime,uOpacity,uPhase;uniform vec3 uTint;
        void main(){
          float x=vUv.x-.5+sin(vUv.y*3.+uTime*.06+uPhase)*.065;
          float edge=exp(-x*x*24.);
          float strands=.65+.35*sin(vUv.x*39.+sin(vUv.y*4.+uPhase)*1.2);
          float heightFade=smoothstep(0.,.18,vUv.y)*(1.-smoothstep(.82,1.,vUv.y));
          gl_FragColor=vec4(uTint,edge*strands*heightFade*uOpacity*.28*exp(-max(0.,vDepth-20.)*.035));
        }`
    });
    materials.push(mat);
    const beam=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);
    beam.position.set(x,y,z);beam.rotation.z=tilt;beam.name=`Cavern / light at depth ${z}`;beam.renderOrder=1;
    group.add(beam);
  });

  // Mantle and body are volumetric. Leading edges, cephalic lobes, eyes, gill
  // slits and a long tapering tail share the same deformation and depth pass.
  const raySurface=(w,t,side)=>{
    const leading=.58*Math.pow(1-w,1.7)+.43*Math.pow(w,4);
    const trailing=-.75*Math.pow(1-w,.68)+.43*Math.pow(w,4)-.14*Math.sin(w*Math.PI);
    return V(side*2.15*w,mix(trailing,leading,t),.1+Math.sin(t*Math.PI)*(.22*(1-w)+.035)+Math.sin(w*Math.PI)*.12+w*w*.13);
  };
  const rayLayouts=[[-3.55,-.2,1.8,.76,.65,.45,-.5],[6.35,1.75,.2,.57,.4,-.32,.24],[-4.8,.9,-.8,.4,-.34,.45,.34],[-6.1,1.85,-5,.3,.85,-.35,.4],[-1.9,-1.4,-6,.3,-1.1,.2,.1],[5,.2,-5,.3,.6,-.5,-.25],[-1.9,1.4,-10,.3,-.7,.65,.2],[-3.6,-2.6,-9,.28,.75,-.3,-.2],[7.8,3.3,-9,.24,1.1,.5,.3],[-5.9,-.2,-13,.19,-.6,-.65,.3],[1,-2,-13,.18,.8,.4,-.3],[7.4,-1.3,-6,.3,-1.1,.4,.2]];
  rayLayouts.slice(0,mobile?8:12).forEach(([x,y,z,scale,bank,yaw,pitch],id)=>{
    const data=reservoir(mobile?17000:37000,random),n=count(id<3?10500:4700);
    for(let i=0;i<n;i++){
      const w=(i+.5)/n,t=i*.61803398875%1,side=i%2?1:-1,P=raySurface(w,t,side);
      const dx=raySurface(Math.min(1,w+.001),t,side).sub(raySurface(Math.max(0,w-.001),t,side));
      const dy=raySurface(w,Math.min(1,t+.001),side).sub(raySurface(w,Math.max(0,t-.001),side));
      const N=dx.cross(dy).normalize();if(N.z<0)N.negate();
      const edge=Math.pow(Math.abs(t-.5)*2,16),vein=Math.pow(.5+.5*Math.cos(t*24+w*7+Math.sin(w*8)*.9),18);
      const mottling=Math.pow(.5+.5*Math.sin(w*37+Math.sin(t*29)*2+Math.sin(w*83-t*41)),2);
      if(mottling<.12&&edge<.2&&vein<.2)continue;
      const light=(.014+mottling*.42+edge*.6+vein*.045)*(.3+random()*.7);
      const purple=.25+.6*smooth(t,.25,.8)+.15*smooth(w,.65,.95);
      data.point(P,N,[mix(.016,.52,purple)*light,mix(.65,.11,purple)*light,light*1.85],.58+random()*.68);
    }
    for(let i=0,n=count(1100);i<n;i++){
      const t=(i+.5)/n,a=i*2.39996323,r=Math.pow(Math.sin(t*Math.PI),.6),N=V(Math.cos(a),0,Math.sin(a));
      data.point(V(Math.cos(a)*r*.18,-.65+t*1.3,.2+Math.sin(a)*r*.13),N,[.012,.12,.37],.6+random()*.45);
    }
    for(const side of [-1,1]){
      data.line(curve([[side*.12,.48,.23],[side*.22,.61,.24],[side*.25,.73,.28],[side*.18,.72,.32]]),count(500),[.025,.32,.9],.025);
      for(const edgeT of [0,1]){
        const points=Array.from({length:20},(_,j)=>raySurface(j/19,edgeT,side));
        data.line(curve(points),count(650),[.13,.34,1.25],.005);
      }
      for(let rib=0;rib<8;rib++){
        const points=Array.from({length:12},(_,j)=>{
          const q=j/11,t=mix(.48+rib*.028,.08+rib*.115,q)+Math.sin(q*Math.PI)*.09;
          return raySurface(.06+q*.87,t,side);
        });
        data.line(curve(points),count(90),[.035,.15,.45],.003);
      }
      for(let g=0;g<5;g++)data.line(curve([[side*.13,.2-g*.085,.32],[side*.23,.16-g*.085,.3],[side*.28,.12-g*.085,.24]]),count(35),[.015,.22,.45],.005);
      for(let j=0;j<count(45);j++){const a=random()*TAU;data.point(V(side*.2+Math.cos(a)*.024,.4+Math.sin(a)*.024,.29),V(0,0,1),[.65,1.2,1.7],.85);}
    }
    data.wood(curve([[0,-.5,.2],[.05,-1.1,.14],[.2,-1.9,.1],[.7,-3.15,.24]]),[.025,.018,.008,.002],count(700),id,1.5);
    const ray=flush(data,'ray',`Manta / ${id+1}`);
    ray.scale.set(mobile?scale/.72:scale,mobile?scale/1.45:scale,scale);ray.position.set(x,y,z);ray.rotation.set(pitch,yaw,bank);
    swimmers.push({ray,x,y,z,scale,bank,yaw,pitch,id});
  });
  const dust=reservoir(mobile?600:1800,random);
  for(let i=0;i<(mobile?600:1800);i++)dust.point(V((random()-.5)*24,(random()-.5)*16,-22+random()*27),V(0,0,1),[.008,.065,.12],.6+random()*1.1);
  flush(dust,'drift','Cavern / suspended current',false);
  group.userData.update=(time,visibility)=>{
    group.visible=visibility>.005;
    for(const mat of materials){mat.uniforms.uTime.value=time;mat.uniforms.uOpacity.value=visibility;}
    luminous.material.uniforms.uOpacity.value=visibility*(.96+Math.sin(time*.65)*.04);
    for(const {ray,x,y,z,bank,yaw,pitch,id} of swimmers){
      const phase=time*.23+id*1.73;
      ray.position.set(x+Math.sin(phase)*.58,y+Math.sin(phase*.9+.5)*.25,z+Math.cos(phase*.7)*(id<3?1.8:2.7));
      ray.rotation.set(pitch+Math.sin(phase*.9)*.11,yaw+Math.cos(phase)*.2,bank+Math.sin(phase)*.19);
      ray.material.uniforms.uTime.value=time+id*1.7;
    }
  };
  group.userData.resize=(ratio,height)=>{for(const mat of materials){mat.uniforms.uPixelRatio.value=ratio;mat.uniforms.uViewportHeight.value=height;}};
  return group;
}
