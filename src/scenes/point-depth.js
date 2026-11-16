import * as THREE from 'three';

// Only the dense centre of a luminous grain occludes. Its soft halo remains
// transparent. Reuse the exact deformation and uniforms of the colour pass so
// the depth silhouette cannot lag behind a swimming or swaying organism.
export function attachPointDepth(points, { threshold = .28, radius = .28, depthBias = 0 } = {}) {
  const source = points.material;
  source.uniforms.uDepthSamples ??= { value: 1 };
  // Every fragment of a grain below this strength is already discarded.
  // Reject it at the vertex stage instead of rasterizing a transparent square.
  const depthReject = `
    /* point depth reject */
    if (vAlpha < (uDepthSamples < .5 ? ${threshold.toFixed(3)} : ${(threshold * .55).toFixed(5)})) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 1.0;
    }
  `;
  const depthVertex = `uniform float uDepthSamples;\n` + source.vertexShader.replace(
    /}\s*$/, `${depthBias ? `gl_Position.z += ${depthBias.toFixed(8)} * gl_Position.w;` : ''}\n${depthReject}\n}`
  );
  const depth = new THREE.ShaderMaterial({
    uniforms: source.uniforms,
    // The translucent colour and depth programs can round the same animated
    // position differently. Put the occlusion core just behind the membrane,
    // so its own depth cannot intermittently reject the visible surface.
    vertexShader: depthVertex,
    fragmentShader: `
      varying float vAlpha;
      uniform float uDepthSamples;
      void main() {
        float r = length(gl_PointCoord - .5);
        float coverage = exp(-r * r * 9.0);
        if (uDepthSamples < .5) {
          if (r > ${radius.toFixed(3)} || vAlpha * coverage < ${threshold.toFixed(3)}) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
          // Smooth sample coverage avoids a whole pixel switching depth as a
          // point moves or its opacity crosses the old binary threshold.
          float strength = smoothstep(${(threshold * .55).toFixed(3)}, ${(threshold * 1.45).toFixed(3)}, vAlpha);
          float edge = 1.0 - smoothstep(${(radius * .45).toFixed(3)}, ${(radius * 1.55).toFixed(3)}, r);
          float alpha = strength * edge;
          if (alpha < .002) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
        }
      }
    `,
    vertexColors: true,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    alphaToCoverage: true,
    blending: THREE.NoBlending,
  });
  const core = new THREE.Points(points.geometry, depth);
  core.name = `${points.name} / depth cores`;
  core.userData.isDepthPass = true;
  core.userData.depthBias = depthBias;
  points.add(core);
  return core;
}
