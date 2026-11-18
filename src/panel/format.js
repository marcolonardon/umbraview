/* Os números do painel do ponto (card I1) viram texto aqui, e não no componente, para o teste
 * conferir o formato sem montar a tela. O ° e o " UTC" são unidade, como o % que o Intl já põe:
 * ficam junto do número, e não em src/data/. O "d", o "h" e o "min" da duração também (card I6). */
const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })

/* Sem o timeZone: 'UTC', a hora sai no fuso do computador de quem usa, e as missões falam em UTC.
   O CI roda em UTC e não veria o erro; por isso a suíte roda em Tóquio (vite.config.js). */
const utcDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  dateStyle: 'medium',
  timeStyle: 'short',
})

// só a data, para o que não tem hora que importe na tela: o dia de um lançamento (card C13)
const utcDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium' })

export function formatUtcDate(date) {
  return utcDate.format(date)
}

export function formatDegrees(degrees) {
  return `${degrees.toFixed(1)}°`
}

export function formatPercent(fraction) {
  return percent.format(fraction)
}

export function formatUtc(date) {
  return `${utcDateTime.format(date)} UTC`
}

/* A duração de uma janela de pouso (card I6): em dias, para quem lê não dividir por 24 de cabeça.
   Arredonda para o mais próximo, e não para baixo: a janela de 24 h chega com o milissegundo
   cortado (summary.js) e não pode aparecer menor que o mínimo. */
export function formatDuration(hours) {
  const minutes = Math.round(hours * 60)
  if (minutes < 60) return `${minutes} min`
  const total = Math.round(hours)
  if (total < 24) return `${total} h`
  const days = Math.floor(total / 24)
  const rest = total % 24
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`
}
