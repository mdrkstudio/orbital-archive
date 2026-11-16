import { createKelpSurface } from './kelp-surface.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

// The organism is a bundle of independent rhizomes, with leaves growing from
// irregular nodes. There is deliberately no central cylinder or helical ribbon.
export function createKelpForest({ mobile = false, pixelRatio = 1 } = {}) {
  const random = rng(92471);
  const group = new THREE.Group();
  const geometries = [];
  const columns = [];
  const layout = mobile
    ? [[-2.9, 1, .78, 0], [2.8, 1, .85, 1], [-2.1,-10,.6,2], [1.8,-15,.5,3]]
    : [[-4.9, 1, 1.05, 0], [4.1, 1.3, 1.15, 1], [-3.3,-9,.7,2], [1.2,-12,.68,3], [-9,-11,.65,4], [8.8,-15,.72,5],[-1.8,-22,.60,6],[3.5,-25,.65,7],[-6.5,-19,.70,8],[7,-22,.6,9]];
  for (let i=0; i<(mobile?5:18); i++) layout.push([-25+random()*50,-20-random()*27,.25+random()*.55,i+6]);

  function centre(c, y, strand = 0) {
    const a = y * .48 + c.phase + strand * 2.399;
    const w = c.radius * (.46 + Math.sin(y*.7+c.phase)*.12);
    return new THREE.Vector3(c.x + Math.sin(y*.31+c.phase)*c.radius*.65 + Math.cos(a)*w,
      y, c.z + Math.cos(y*.25+c.phase)*.3 + Math.sin(a)*w);
  }
  function addTube(points, radius, segments=100, sides=7) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve,segments,radius,sides,false);
    geometry.deleteAttribute('uv'); geometries.push(geometry);
  }
  function leaf(c, y, heading, length, width, phase, strand) {
    const base = centre(c,y,strand);
    const tilt = -.65 + random()*1.5;
    const curl = (random()>.38?1:-1)*(.55+Math.pow(random(),1.4)*6.0);
    const rows=length<1.4?18:(mobile?42:64), cols=length<1.4?4:6;
    const pos=[], indices=[];
    let reach=0, rise=0;
    for(let row=0;row<=rows;row++) {
      const t=row/rows;
      const bend=tilt+curl*t*t;
      if(row>0){
        const mid=(row-.5)/rows;
        const angle=tilt+curl*mid*mid;
        reach+=Math.cos(angle)*length/rows;
        rise+=Math.sin(angle)*length/rows;
      }
      const a=heading+.65*Math.sin(t*3.14+phase)+t*t*Math.sin(phase*3)*.8;
      const x=base.x+Math.cos(a)*reach;
      const z=base.z+Math.sin(a)*reach;
      const yy=base.y+rise;
      const envelope=Math.pow(Math.sin(Math.PI*t),.65)*Math.pow(1-t,.4)*width*(1+.16*Math.sin(t*19+phase));
      const twist=Math.sin(phase+t*3.1)*1.3+t*.65;
      for(let col=0;col<=cols;col++) {
        const across=col/cols*2-1;
        const broad=across*envelope;
        const edge=Math.pow(Math.abs(across),3.);
        const fold=(1-across*across)*envelope*.22
          +Math.sin(t*23+phase+across*3)*envelope*.19*edge;
        pos.push(x-Math.sin(a)*broad*Math.cos(twist)-Math.cos(a)*Math.sin(bend)*broad*Math.sin(twist),
          yy+Math.cos(bend)*broad*Math.sin(twist)+fold,
          z+Math.cos(a)*broad*Math.cos(twist)-Math.sin(a)*Math.sin(bend)*broad*Math.sin(twist));
      }
    }
    for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
      const i=row*(cols+1)+col; indices.push(i,i+1,i+cols+1,i+1,i+cols+2,i+cols+1);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();geometries.push(g);
  }
  layout.forEach(([x,z,radius,id])=>{
    const c={x,z,radius,phase:random()*6.28,hero:id<2,height:28,lean:0,color:2};columns.push(c);
    const strands=c.hero?7:3;
    for(let strand=0;strand<strands;strand++) {
      const path=[];
      for(let step=0;step<=70;step++) path.push(centre(c,-18+step*.58,strand));
      addTube(path,radius*(c.hero?.105:.13)*(1+random()*.5),mobile?90:160,7);
    }
    const count=c.hero?(mobile?145:240):(id<10?220:115);
    for(let i=0;i<count;i++) {
      const y=-11+random()*29;
      const h=random()*Math.PI*2;
      const primary=c.hero && i%5===0;
      const len=radius*(1.5+random()*3.0)*(primary?1.45:1.);
      leaf(c,y,h,len,(radius*(c.hero?.13:.09)+radius*random()*(c.hero?.29:.16))*(primary?2.15:1.),random()*6.28,i%strands);
    }
    // Small epiphytes break the clean edges of the primary ribbon bundles.
    for(let i=0;i<(mobile?70:(c.hero?290:145));i++){
      leaf(c,-10+random()*27,random()*Math.PI*2,
        radius*(.35+random()*1.1),radius*(.025+random()*.075),random()*6.28,i%strands);
    }
  });
  // Broad near fronds interrupt the bottom of the channel and overlap the pillars.
  const frontPaths = [
    [[-8,-6.5,3],[-5.7,-5.0,3.2],[-3.8,-4.6,3.4],[-1.7,-5.0,3.1],[-.7,-3.9,2.9]],
    [[8,-6.3,3.1],[5.5,-4.8,3.5],[3.5,-4.5,3.3],[1.1,-5.3,2.9],[-.1,-4.8,2.7]],
    [[-7,-8,4],[-4.1,-6.4,3.9],[-1.9,-6.2,3.7],[.3,-7.0,3.2]],
    [[8,-4.2,2.8],[6.2,-3.3,3.1],[4.5,-3.5,3.4],[3.1,-4.8,3.2]]
  ];
  // Large returning fronds establish a readable curl before the fine foliage.
  // Their tips curl back toward the organism; each fold occupies a different depth.
  for(const side of [-1,1]) for(let level=0;level<4;level++){
    const x=mobile?(side<0?-2.9:2.8):(side<0?-4.8:4.3), y=-4.8+level*2.65;
    const reach=(1.45+random()*.75)*(mobile?.7:1), z=1.7+random()*.7;
    const dir=level%2===0?side:-side;
    frontPaths.push([
      [x,y-1.4,z], [x+dir*reach*.55,y-.55,z+.8],
      [x+dir*reach*1.15,y+.6,z+.35], [x+dir*reach*.85,y+1.65,z-.3],
      [x+dir*reach*.1,y+1.9,z-.5], [x-dir*reach*.18,y+1.15,z-.1],
      [x+dir*reach*.23,y+.75,z+.22]
    ]);
  }
  frontPaths.forEach((path,index)=>{
    const curve=new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(...p)));
    const pos=[],indices=[],steps=80;
    for(let i=0;i<=steps;i++){
      const t=i/steps,p=curve.getPoint(t),tangent=curve.getTangent(t);
      const across=new THREE.Vector3(-tangent.y,tangent.x,Math.sin(t*7+index)*.8).normalize();
      const width=Math.pow(Math.sin(Math.PI*t),.65)*(index<4?.5+index*.06:.32+(index%3)*.07)*(1-t*.65);
      for(let j=0;j<=4;j++){
        const q=p.clone().addScaledVector(across,(j/2-1)*width);
        q.z+=Math.sin(j/4*Math.PI)*width*.3;
        pos.push(q.x,q.y,q.z);
        if(i<steps&&j<4){const k=i*5+j;indices.push(k,k+5,k+1,k+1,k+5,k+6);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setIndex(indices);g.computeVertexNormals();geometries.push(g);
  });
  const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
  // Geometry is a sampling scaffold only. No filled surface or depth mask is rendered.
  const uniforms={uTime:{value:0},uOpacity:{value:1},uPixelRatio:{value:pixelRatio}};
  const scaffold=new THREE.Mesh(geometry);
  const points=createKelpSurface(scaffold,uniforms,mobile);
  geometry.dispose();scaffold.material.dispose();
  points.material.userData.baseOpacity=1;
  group.add(points);group.material=points.material;
  group.userData={columns,centre};
  return group;
}
