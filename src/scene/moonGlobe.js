/* A cor da Lua inteira na cena: onde cada ponto da Lua cai nas imagens de public/data/moon/
 * (geradas por scripts/prepare-data/prepare_moon_global.py), e a cor do polo sul nas malhas do
 * relevo. As contas não conhecem o React, para serem testadas no Node.
 *
 * São duas imagens da mesma cor. A esfera usa a de latitude e longitude (color.jpg). As malhas do
 * relevo do polo usam a da projeção polar (color-south.jpg), porque na de latitude e longitude o
 * polo é um ponto esticado numa linha inteira da imagem, e a cor sairia em raios em volta dele.
 */
import { MOON_RADIUS_M } from '../engine/geometry.js'

/* O ponto da imagem color.jpg (e do mapa de normais) de uma latitude e longitude, em graus: u de 0
   (180° oeste) a 1 (180° leste), v de 0 (polo sul) a 1 (polo norte). É a mesma conta que a
   sphereGeometry do three faz para os vértices dela, com os eixos da cena (coordinates.js): o teste
   confere, e por isso a esfera não precisa de geometria própria. */
export function globeTextureUv(latDeg, lonDeg) {
  return [(lonDeg + 180) / 360, (latDeg + 90) / 180]
}

/* A esfera lisa é aberta no polo sul, onde entra a malha do relevo (thetaLength, em reliefMesh.js),
   e o three espalha a imagem inteira pela parte que sobra. Estes dois números fazem a esfera usar
   só o pedaço de cima da imagem: o repeat e o offset em y da textura. */
export function globeTextureWindow(thetaLength) {
  const repeatY = thetaLength / Math.PI
  return { repeatY, offsetY: 1 - repeatY }
}

/* O ponto da imagem color-south.jpg de um ponto da cena ([x, y, z], de qualquer tamanho). far: o
   campo far do manifest.json do relevo; a imagem cobre exatamente a grade dele. É a conta que o
   shader das malhas faz (applySouthColor), escrita aqui para ter teste. */
export function southColorUv([x, y, z], far) {
  const length = Math.hypot(x, y, z)
  // cena → motor: (x, −z, y); depois a projeção polar de geometry.js, em metros
  const k = (2 * MOON_RADIUS_M) / (1 - y / length)
  const px = (k * -z) / length
  const py = (k * x) / length
  const side = far.columns * far.resolutionM
  return [(px - far.x0) / side, 1 - (far.y0 - py) / side]
}

/* O ponto da imagem color-south.jpg de cada vértice de uma malha do polo: positions são os
   vértices em fila (x, y, z, x, y, z...), como os do buildReliefCap (reliefMesh.js), e far é o
   campo far do manifesto. Devolve dois números por vértice (u, v), na mesma ordem.
   É para quem desenha a malha com um material comum, sem o shader daqui: a vista da missão, em
   que a Lua anda e gira, e a posição do ponto no mundo não serve para achar o ponto da imagem
   (MoonSouthCap.jsx). */
export function southCapUvs(positions, far) {
  const uvs = new Float32Array((positions.length / 3) * 2)
  for (let i = 0; i < positions.length / 3; i++) {
    const [u, v] = southColorUv([positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]], far)
    uvs[2 * i] = u
    uvs[2 * i + 1] = v
  }
  return uvs
}

/* Os vértices de uma malha (x, y, z em fila) levados para o raio 1, cada um na direção em que
   estava. Devolve outro array; o de entrada fica como estava. É para a malha do polo da vista da
   missão (MoonSouthCap.jsx): as normais saem dos vértices com a altura de verdade, e a malha é
   desenhada no raio da esfera, sem degrau na borda. */
export function onUnitSphere(positions) {
  const flat = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    const length = Math.hypot(positions[i], positions[i + 1], positions[i + 2])
    flat[i] = positions[i] / length
    flat[i + 1] = positions[i + 1] / length
    flat[i + 2] = positions[i + 2] / length
  }
  return flat
}

/* Os uniformes da cor polar, os mesmos objetos para todas as malhas do relevo: quando a imagem
   chega, trocar o valor aqui muda todas de uma vez. uSouthColorMix em 0 deixa a cor lisa do
   material, que é como o relevo aparece enquanto a imagem baixa (ou se ela não chegar).
   uSouthColorFrame: a borda esquerda e a de cima da grade e o lado dela, em raios da Lua. */
export const southColorUniforms = {
  uSouthColor: { value: null },
  uSouthColorMix: { value: 0 },
  uSouthColorFrame: { value: [0, 0, 1] },
}

/* Os uniformes do mapa das áreas de pouso (LandingAreasLayer.jsx), também os mesmos para todas as
   malhas do relevo: a máscara (um byte por quadrado da grade), onde ela fica (a borda esquerda, a de
   cima e o lado, em raios da Lua), a cor e a força. Com a força em 0, o relevo fica como é. */
export const landingUniforms = {
  uLandingMask: { value: null },
  uLandingFrame: { value: [0, 0, 1] },
  uLandingColor: { value: [0, 0, 0] },
  uLandingStrength: { value: 0 },
  // a máscara da Lua inteira, na projeção de latitude e longitude (globalLandingMask), e a força dela
  uGlobalLandingMask: { value: null },
  uGlobalLandingStrength: { value: 0 },
}

/* Liga a máscara da Lua inteira, para a esfera e para a parte do relevo do polo que fica fora da
   grade fina. A cor é a mesma do mapa do polo (setLandingMask). Com texture null, desliga. */
export function setGlobalLandingMask(texture, color) {
  landingUniforms.uGlobalLandingMask.value = texture
  landingUniforms.uGlobalLandingStrength.value = texture ? 1 : 0
  if (texture) landingUniforms.uLandingColor.value = color
}

/* O trecho de shader que lê a máscara da Lua inteira no ponto unit (a direção do ponto na cena): a
   longitude 0° fica em +x e cresce para −z (coordinates.js), e a máscara começa na longitude 0°. */
const GLOBAL_LANDING_GLSL = `
float globalLandingAt(vec3 unit) {
  float longitude = atan(-unit.z, unit.x);
  float latitude = asin(clamp(unit.y, -1.0, 1.0));
  vec2 uv = vec2(fract(longitude / 6.283185307), latitude / 3.141592654 + 0.5);
  return texture2D(uGlobalLandingMask, uv).r * uGlobalLandingStrength;
}`

/* Liga o mapa: texture é a textura do three com a máscara (landingMask, em landingGridFiles.js),
   layout é o desenho da grade, color é a cor em vermelho, verde e azul de 0 a 1. Com texture null,
   desliga. Quem chama pede o quadro novo à cena. */
export function setLandingMask(texture, layout, color) {
  landingUniforms.uLandingMask.value = texture
  landingUniforms.uLandingStrength.value = texture ? 1 : 0
  if (texture) {
    landingUniforms.uLandingFrame.value = [
      layout.x0 / MOON_RADIUS_M,
      layout.y0 / MOON_RADIUS_M,
      (layout.columns * layout.stepM) / MOON_RADIUS_M,
    ]
    landingUniforms.uLandingColor.value = color
  }
}

/* Quanto da cor do mapa entra na cor do chão, e quanto ela brilha por conta própria. O brilho
   próprio existe porque um lugar com janela de pouso no período pode estar no escuro na hora
   escolhida, e a mancha não pode sumir junto com a luz. */
const LANDING_TINT = 0.35
const LANDING_GLOW = 0.22
/* Na esfera, o mapa da Lua inteira cobre o lado visível quase todo: mais fraco que no polo, para a
   Lua continuar aparecendo por baixo dele. */
const GLOBE_LANDING_TINT = 0.2
const GLOBE_LANDING_GLOW = 0.1

/* Liga a cor polar: texture é a textura do three com a color-south.jpg, far é o campo far do
   manifesto do relevo. Com null, desliga. Quem chama pede o quadro novo à cena. */
export function setSouthColor(texture, far) {
  southColorUniforms.uSouthColor.value = texture
  southColorUniforms.uSouthColorMix.value = texture ? 1 : 0
  if (far) {
    southColorUniforms.uSouthColorFrame.value = [
      far.x0 / MOON_RADIUS_M,
      far.y0 / MOON_RADIUS_M,
      (far.columns * far.resolutionM) / MOON_RADIUS_M,
    ]
  }
}

/* Faz o material de uma malha do relevo ler a cor da imagem polar, no lugar da cor lisa, e o mapa
   das áreas de pouso por cima. A posição usada é a do vértice na cena, e a conta é a de
   southColorUv. Devolve o próprio material. */
export function applySouthColor(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, southColorUniforms, landingUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSouthPosition;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSouthPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uSouthColor;
uniform float uSouthColorMix;
uniform vec3 uSouthColorFrame;
uniform sampler2D uLandingMask;
uniform vec3 uLandingFrame;
uniform vec3 uLandingColor;
uniform float uLandingStrength;
uniform sampler2D uGlobalLandingMask;
uniform float uGlobalLandingStrength;
varying vec3 vSouthPosition;
${GLOBAL_LANDING_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 southUnit = normalize(vSouthPosition);
  float southK = 2.0 / (1.0 - southUnit.y);
  vec2 southPolar = vec2(southK * -southUnit.z, southK * southUnit.x);
  vec2 southUv = vec2(
    (southPolar.x - uSouthColorFrame.x) / uSouthColorFrame.z,
    1.0 - (uSouthColorFrame.y - southPolar.y) / uSouthColorFrame.z
  );
  diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uSouthColor, southUv).rgb, uSouthColorMix);
  vec2 landingUv = vec2(
    (southPolar.x - uLandingFrame.x) / uLandingFrame.z,
    1.0 - (uLandingFrame.y - southPolar.y) / uLandingFrame.z
  );
  // fora da grade a máscara não vale: sem isto, a borda dela se repetiria pelo relevo afora
  float landingInside = step(0.0, landingUv.x) * step(landingUv.x, 1.0) * step(0.0, landingUv.y) * step(landingUv.y, 1.0);
  // a grade fina vale até 84°S; dali para fora, no relevo do polo, vale a da Lua inteira
  float landing = max(
    texture2D(uLandingMask, landingUv).r * landingInside * uLandingStrength,
    globalLandingAt(southUnit)
  );
  diffuseColor.rgb = mix(diffuseColor.rgb, uLandingColor, ${LANDING_TINT.toFixed(2)} * landing);
  totalEmissiveRadiance += uLandingColor * (${LANDING_GLOW.toFixed(2)} * landing);
}`,
      )
  }
  return material
}

/* O onBeforeCompile dos materiais da Lua da vista da missão (MoonBody.jsx e MoonSouthCap.jsx, card
   C18): o mapa das áreas de pouso, a grade fina do polo e a da Lua inteira, com os mesmos uniformes
   da cena principal (LandingAreasLayer.jsx liga e desliga). Lá a Lua fica parada no centro, e a
   posição do ponto no mundo é a dele na Lua; aqui ela anda e gira, e o shader lê a posição do vértice
   no próprio objeto (transformed), que gira junto. Com as duas forças em 0, a Lua fica como é. */
export function bodyLandingShader(shader) {
  Object.assign(shader.uniforms, landingUniforms)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vBodyPosition;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBodyPosition = transformed;')
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform sampler2D uLandingMask;
uniform vec3 uLandingFrame;
uniform vec3 uLandingColor;
uniform float uLandingStrength;
uniform sampler2D uGlobalLandingMask;
uniform float uGlobalLandingStrength;
varying vec3 vBodyPosition;
${GLOBAL_LANDING_GLSL}`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  vec3 bodyUnit = normalize(vBodyPosition);
  // a projeção polar de applySouthColor, em raios da Lua; no hemisfério norte ela cai fora da grade
  float bodyK = 2.0 / max(1.0 - bodyUnit.y, 1e-4);
  vec2 bodyPolar = vec2(bodyK * -bodyUnit.z, bodyK * bodyUnit.x);
  vec2 landingUv = vec2(
    (bodyPolar.x - uLandingFrame.x) / uLandingFrame.z,
    1.0 - (uLandingFrame.y - bodyPolar.y) / uLandingFrame.z
  );
  float landingInside = step(0.0, landingUv.x) * step(landingUv.x, 1.0) * step(0.0, landingUv.y) * step(landingUv.y, 1.0);
  float landing = max(
    texture2D(uLandingMask, landingUv).r * landingInside * uLandingStrength,
    globalLandingAt(bodyUnit)
  );
  diffuseColor.rgb = mix(diffuseColor.rgb, uLandingColor, ${LANDING_TINT.toFixed(2)} * landing);
  totalEmissiveRadiance += uLandingColor * (${LANDING_GLOW.toFixed(2)} * landing);
}`,
    )
}

/* O onBeforeCompile do material da esfera da Lua: faz ele ler o mapa das áreas de pouso da Lua
   inteira, pela posição do vértice na cena, como as malhas do relevo. A cena entrega esta função ao
   material (MoonGlobe.jsx). */
export function globalLandingShader(shader) {
  Object.assign(shader.uniforms, landingUniforms)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vGlobePosition;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlobePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;')
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform sampler2D uGlobalLandingMask;
uniform float uGlobalLandingStrength;
uniform vec3 uLandingColor;
varying vec3 vGlobePosition;
${GLOBAL_LANDING_GLSL}`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  float landing = globalLandingAt(normalize(vGlobePosition));
  diffuseColor.rgb = mix(diffuseColor.rgb, uLandingColor, ${GLOBE_LANDING_TINT.toFixed(2)} * landing);
  totalEmissiveRadiance += uLandingColor * (${GLOBE_LANDING_GLOW.toFixed(2)} * landing);
}`,
    )
}
