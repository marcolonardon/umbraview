/* A Terra das vistas do espaço (a do sistema e a da missão): a esfera com a imagem de verdade (o
 * Blue Marble da NASA, earthImage.js), virada como a Terra está no instante, com a linha do eixo e
 * o véu azul do lado do dia.
 *
 * Com os continentes dá para ver a rotação, uma volta por dia, e qual lado está virado para a
 * Lua. Enquanto a imagem não chega, a Terra fica lisa, com uma grade por cima para a rotação
 * aparecer.
 */
import { Line } from '@react-three/drei'
import { Color } from 'three'

import { token } from './cssToken.js'
import { EarthHaze } from './EarthHaze.jsx'
import { earthImageOfPage } from './earthImage.js'
import { useBodyTexture } from './useBodyTexture.js'

/* A imagem da Terra é escura: o mar ocupa a maior parte dela e é quase preto, e com a luz da cena a
   Terra sumia no fundo. Dois ajustes só no desenho dela, sem mexer na luz da Lua: o lado do dia
   reflete uma vez e meia a cor da imagem, e a imagem inteira brilha um pouco por conta própria,
   para o lado da noite não ficar preto. O Sol continua mandando: o lado do dia é bem mais claro
   que o da noite, e a linha entre os dois continua onde a direção do Sol a põe. */
const EARTH_DAY_GAIN = new Color().setScalar(1.5)
const EARTH_OWN_LIGHT = new Color().setScalar(1)
const EARTH_OWN_LIGHT_INTENSITY = 0.2
// quanto a linha do eixo passa de cada polo, em vezes o raio
const AXIS_REACH = 1.6

/* radius: o raio da Terra na cena. matrix: a orientação dela no instante, um Matrix4 (o
   earthMatrix do src/engine/system.js). sunDirection: a direção do Sol a partir da Terra,
   [x, y, z]. Fica no centro do grupo em que for posta. */
export function EarthBody({ radius, matrix, sunDirection }) {
  const texture = useBodyTexture(earthImageOfPage)
  return (
    <>
      <group matrix={matrix} matrixAutoUpdate={false}>
        <mesh>
          <sphereGeometry args={[radius, 48, 24]} />
          {texture ? (
            <meshStandardMaterial
              key="textured"
              color={EARTH_DAY_GAIN}
              map={texture}
              emissive={EARTH_OWN_LIGHT}
              emissiveMap={texture}
              emissiveIntensity={EARTH_OWN_LIGHT_INTENSITY}
            />
          ) : (
            <meshStandardMaterial key="plain" color={token('--color-earth')} />
          )}
        </mesh>
        {!texture && (
          <mesh>
            <sphereGeometry args={[radius * 1.003, 12, 6]} />
            <meshBasicMaterial color={token('--color-bg')} wireframe transparent opacity={0.35} />
          </mesh>
        )}
        <Line points={[[0, -radius * AXIS_REACH, 0], [0, radius * AXIS_REACH, 0]]} color={token('--color-text-muted')} lineWidth={1} />
      </group>
      {/* fora do grupo que gira com a Terra: o véu é do lado do dia, e não dos continentes */}
      <EarthHaze radius={radius} sunDirection={sunDirection} color={token('--color-earth')} />
    </>
  )
}
