/* A Lua das vistas do espaço (a do sistema e a da missão): a esfera com a imagem da cena principal
 * (moonImages.js), virada como ela está no instante (a mesma face para a Terra, a menos da
 * libração), com a linha do eixo. Enquanto a imagem não chega, fica lisa, na cor do token. */
import { Line } from '@react-three/drei'

import { token } from './cssToken.js'
import { moonImagesOfPage } from './moonImages.js'
import { useBodyTexture } from './useBodyTexture.js'

const moonColorImage = () => moonImagesOfPage().then((images) => images.color)
// quanto a linha do eixo passa de cada polo, em vezes o raio
const AXIS_REACH = 1.7

/* radius: o raio da Lua na cena. matrix: a orientação e a posição dela no instante, um Matrix4 (o
   moonMatrix do src/engine/system.js, com a posição posta pela vista, na escala dela). */
export function MoonBody({ radius, matrix }) {
  const texture = useBodyTexture(moonColorImage)
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh>
        <sphereGeometry args={[radius, 48, 24]} />
        <meshStandardMaterial key={texture ? 'textured' : 'plain'} color={texture ? '#ffffff' : token('--color-moon')} map={texture} />
      </mesh>
      <Line points={[[0, -radius * AXIS_REACH, 0], [0, radius * AXIS_REACH, 0]]} color={token('--color-text-muted')} lineWidth={1} />
    </group>
  )
}
