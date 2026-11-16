import * as THREE from 'three';

// Discontinuous algae-covered banks are real positions in the water column.
// They share the kelp shading and current, but use a separate sampling budget.
export function createGardenRelief(material, mobile = false) {
  let seed=35919;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const count=mobile?65000:230000;
  const positions=[],normals=[],colors=[],sizes=[];
  const height=(x,z)=>-7.9+Math.sin(x*.48+z*.21)*.9+Math.sin(x*1.5-z*.72)*.32+
    Math.pow(.5+.5*Math.sin(x*.7+z*.45),4)*1.2;
  for(let i=0;i<count;i++){
    const x=(random()-.5)*50,z=-5-random()*49;
    const upper=i%4===0;
    let y=height(x,z);
    // Broken canopy above the channel, with the brightest overhead water open.
    if(upper)y=10.5+Math.sin(x*.45+z*.2)*1.4;
    const wrinkle=.5+.5*Math.sin(x*5.1+z*3.8+Math.sin(x*2.3)*2);
    if(random()>.28+wrinkle*.64)continue;
    y+=Math.sin(x*12+z*9)*.055;
    positions.push(x,y,z);
    const dx=(height(x+.01,z)-height(x-.01,z))/.02;
    const dz=(height(x,z+.01)-height(x,z-.01))/.02;
    const n=new THREE.Vector3(-dx,upper?-1:1,-dz).normalize();normals.push(n.x,n.y,n.z);
    const glint=Math.pow(wrinkle,5), patch=.5+.5*Math.sin(x*.7-z*.18);
    colors.push(.002+glint*.003,.12+glint*.28,.12+glint*.3+patch*.07);
    sizes.push(.85+random()*.65+glint*.55);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
  const points=new THREE.Points(geometry,material);
  points.name='Algae-covered banks and overhead canopy';points.renderOrder=2;
  return points;
}
