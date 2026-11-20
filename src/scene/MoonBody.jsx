/* A Lua das vistas do espaço (a do sistema e a da missão): a esfera com a imagem da cena principal
 * (moonImages.js), virada como ela está no instante (a mesma face para a Terra, a menos da
 * libração), com a linha do eixo. Enquanto a imagem não chega, fica lisa, na cor do token. */
import { Line } from '@react-three/drei'

import { useFarRelief } from '../hooks/useFarRelief.js'
import { token } from './cssToken.js'
import { bodyLandingShader } from './moonGlobe.js'
import { moonImagesOfPage } from './moonImages.js'
import { MoonNorthCap } from './MoonNorthCap.jsx'
import { MoonSouthCap } from './MoonSouthCap.jsx'
import { useBodyTexture } from './useBodyTexture.js'

const moonColorImage = () => moonImagesOfPage().then((images) => images.color)
const moonNormalImage = () => moonImagesOfPage().then((images) => images.normal)
/* Os triângulos da esfera: poucos para a Lua vista de longe; com relevo, de perto, a borda dela
   contra o céu mostraria as quinas. */
const SEGMENTS = [48, 24]
const RELIEF_SEGMENTS = [128, 64]
// quanto a linha do eixo passa de cada polo, em vezes o raio
const AXIS_REACH = 1.7
// sem relevo, o relevo do polo não é lido: uma leitura que nunca chega (a mesma função sempre, como o hook pede)
const NO_FAR_RELIEF = () => new Promise(() => {})
// o que se vê não recebe o raio do clique quando há uma esfera só para isso
const NO_RAYCAST = () => null

/* radius: o raio da Lua na cena. matrix: a orientação e a posição dela no instante, um Matrix4 (o
   moonMatrix do src/engine/system.js, com a posição posta pela vista, na escala dela).
   onClick, onPointerOver e onPointerOut: para a vista em que a Lua é clicável (a da missão, que
   escolhe nela o local de pouso, card C17); sem eles, a Lua não ouve o mouse.
   showAxis: se a linha do eixo é desenhada; a vista da missão a esconde no passo do pouso, onde
   ela atravessaria os pinos do polo, e durante o voo.
   relief: a Lua ganha o relevo da cena principal. É para a vista em que se chega perto dela (a da
   missão, card C17): sem ele, de perto, o polo era uma mancha cinza. De longe não faz diferença,
   e fica desligado. São três coisas:
     - o mapa de normais da Lua inteira (a mesma imagem da cena principal): as crateras fazem
       sombra com o Sol;
     - no polo sul, a malha do relevo e a imagem polar (MoonSouthCap.jsx), por cima da esfera:
       nas imagens de latitude e longitude o polo sai em raios; no polo norte, uma malha com as
       imagens da esfera refeitas na projeção do polo (MoonNorthCap.jsx);
     - uma esfera de clique, simples e que não aparece: o raio do mouse é testado contra os
       triângulos de quem ouve o mouse a cada movimento dele, e os da Lua com relevo são muitos;
     - o mapa de onde dá para pousar (card C18), no shader da esfera e da malha do polo
       (bodyLandingShader), desligado até a vista ligar. */
export function MoonBody({ radius, matrix, onClick, onPointerOver, onPointerOut, showAxis = true, relief = false }) {
  const farRelief = useFarRelief(relief ? undefined : NO_FAR_RELIEF)
  const texture = useBodyTexture(moonColorImage)
  const normals = useBodyTexture(moonNormalImage, false)
  const normalMap = relief ? normals : null
  const handlers = { onClick, onPointerOver, onPointerOut }
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh {...(relief ? { raycast: NO_RAYCAST } : handlers)}>
        <sphereGeometry args={[radius, ...(relief ? RELIEF_SEGMENTS : SEGMENTS)]} />
        {/* a key refaz o material quando uma imagem chega: o three só decide ao montar o shader se ele tem imagem */}
        <meshStandardMaterial
          key={`${texture ? 'textured' : 'plain'} ${normalMap ? 'relief' : 'smooth'}`}
          color={texture ? '#ffffff' : token('--color-moon')}
          map={texture}
          normalMap={normalMap}
          // a esfera continua inteira por baixo da malha do polo, quase no mesmo raio: ela vai um
          // pouco para trás na profundidade, para as duas não disputarem o pixel
          polygonOffset={relief}
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
          onBeforeCompile={relief ? bodyLandingShader : undefined}
        />
      </mesh>
      {farRelief && <MoonSouthCap relief={farRelief} radius={radius} />}
      {/* o polo norte também, com a imagem refeita no navegador (MoonNorthCap.jsx): sem ela, raios */}
      {relief && <MoonNorthCap radius={radius} />}
      {relief && (
        <mesh {...handlers}>
          <sphereGeometry args={[radius, ...SEGMENTS]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      )}
      {showAxis && (
        <Line points={[[0, -radius * AXIS_REACH, 0], [0, radius * AXIS_REACH, 0]]} color={token('--color-text-muted')} lineWidth={1} />
      )}
    </group>
  )
}
