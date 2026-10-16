import { ShaderChunk } from 'three';

/** Keep the same filmic display transform in the direct and refracted paths.
 * This lets a completely faded cursor field bypass its offscreen passes.
 */
export function prepareDisplayMaterial(material, exposure) {
  const compile = material.onBeforeCompile.bind(material);
  const programKey = material.customProgramCacheKey.bind(material);
  material.toneMapped = false;
  material.onBeforeCompile = (shader, renderer) => {
    compile(shader, renderer);
    shader.uniforms.toneMappingExposure = exposure;
    const common = '#include <common>';
    shader.fragmentShader = shader.fragmentShader.includes(common)
      ? shader.fragmentShader.replace(common, `${common}\n${ShaderChunk.tonemapping_pars_fragment}`)
      : `${ShaderChunk.tonemapping_pars_fragment}\n${shader.fragmentShader}`;
    const transform = 'gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);';
    shader.fragmentShader = shader.fragmentShader.includes('#include <tonemapping_fragment>')
      ? shader.fragmentShader.replace('#include <tonemapping_fragment>', transform)
      : shader.fragmentShader.replace('#include <colorspace_fragment>', `${transform}\n#include <colorspace_fragment>`);
  };
  // The renderer already keys the direct/capture color spaces separately.
  material.customProgramCacheKey = () => `${programKey()}:display-aces-v1`;
}
