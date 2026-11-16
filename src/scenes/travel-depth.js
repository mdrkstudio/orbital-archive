import * as THREE from 'three';

// Fade individual samples only as they reach the camera or disappear into distant
// water. There is no chapter/progress uniform, including in particle depth cores.
export const travelDepthGLSL = `
  vAlpha *= smoothstep(.35,2.0,-mv.z) * (1.0-smoothstep(80.0,115.0,-mv.z));
`;
// These limits are exactly the zero regions of the existing attenuation.
// Clip before lighting and point rasterization, never thin visible samples.
export const travelClipGLSL = `
  vec4 travelClip = projectionMatrix * mv;
  if (-mv.z <= .35 || -mv.z >= 115.0 ||
      abs(travelClip.x) > travelClip.w * (1.0 + uTravelPadding.x) ||
      abs(travelClip.y) > travelClip.w * (1.0 + uTravelPadding.y)) {
    vAlpha = 0.0;
    gl_PointSize = 1.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
`;
export function applyTravelDepth(root, {width=1280,height=720}={}) {
  const materials=new Set();
  root.traverse(object=>{
    for(const material of [object.material].flat()) {
      if(!material?.isShaderMaterial||materials.has(material))continue;
      materials.add(material);
      // Largest point in these scenes is a 100 CSS-pixel water-light halo.
      // Padding includes the whole splat, not only its centre; DPR cancels out.
      if(material.uniforms.uTravelPadding)material.uniforms.uTravelPadding.value.set(128/width,128/height);
      if(material.userData.travelDepth)continue;
      if(!material.vertexShader.includes('vAlpha')||!/vec4\s+mv\s*=/.test(material.vertexShader))continue;
      material.uniforms.uTravelPadding={value:new THREE.Vector2(128/width,128/height)};
      material.vertexShader='uniform vec2 uTravelPadding;\n'+material.vertexShader
        .replace(/vec4\s+mv\s*=[^;]+;/, match=>match+travelClipGLSL);
      // Depth strength must include distance attenuation before deciding that
      // all fragments can be skipped. Both passes still use one fade factor.
      material.vertexShader=material.vertexShader.includes('/* point depth reject */')
        ?material.vertexShader.replace('/* point depth reject */',travelDepthGLSL+'/* point depth reject */')
        :material.vertexShader.replace(/}\s*$/,`${travelDepthGLSL}\n}`);
      material.userData.travelDepth=true;
      material.needsUpdate=true;
    }
  });
}
