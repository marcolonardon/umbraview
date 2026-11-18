/* O valor de um token de src/styles/tokens.css, lido da página: o three não entende var(--…), e
 * cor escrita dentro do componente é o que o README proíbe ("Três regras que valem para qualquer
 * tela"). Mora aqui porque a vista do sistema, a da missão e os corpos que as duas desenham leem
 * as mesmas cores. */
export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
