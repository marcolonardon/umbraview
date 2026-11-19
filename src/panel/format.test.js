/* Os números do painel do ponto (card I1) viram texto. A suíte roda no fuso de Tóquio
 * (vite.config.js): o caso da data só passa se a hora sair em UTC, que é a referência das missões,
 * e não no fuso do computador de quem usa. */
import { describe, expect, it } from 'vitest'

import { formatDegrees, formatDuration, formatElapsed, formatPercent, formatUtc, formatUtcDate } from './format.js'

describe('formatDegrees', () => {
  it('mostra uma casa decimal e o símbolo de grau', () => {
    expect(formatDegrees(12.345)).toBe('12.3°')
    expect(formatDegrees(0)).toBe('0.0°')
  })

  it('mostra a altura negativa como ela chega, com o sinal', () => {
    expect(formatDegrees(-0.84)).toBe('-0.8°')
  })
})

describe('formatPercent', () => {
  it('mostra a fração como porcentagem, com até uma casa decimal', () => {
    expect(formatPercent(0.855)).toBe('85.5%')
    expect(formatPercent(1)).toBe('100%')
    expect(formatPercent(0)).toBe('0%')
  })
})

describe('formatUtc', () => {
  it('mostra a data e a hora em UTC, e não no fuso de quem usa', () => {
    // em Tóquio (UTC+9) seriam 12:00; o painel tem que mostrar 03:00
    expect(formatUtc(new Date('2026-11-14T03:00:00Z'))).toBe('14 Nov 2026, 03:00 UTC')
  })
})

describe('formatUtcDate', () => {
  it('mostra só a data, em UTC, e não a do fuso de quem usa', () => {
    // em Tóquio (UTC+9) já seria dia 27; o lançamento do IM-2 foi no dia 26 pelo relógio da Flórida e 27 em UTC
    expect(formatUtcDate(new Date('2025-02-27T00:16:30Z'))).toBe('27 Feb 2025')
    expect(formatUtcDate(new Date('2025-02-26T23:59:00Z'))).toBe('26 Feb 2025')
  })
})

describe('formatDuration', () => {
  it('mostra dias e horas a partir de um dia, e só horas abaixo dele', () => {
    expect(formatDuration(148)).toBe('6 d 4 h')
    expect(formatDuration(30)).toBe('1 d 6 h')
    expect(formatDuration(18)).toBe('18 h')
  })

  it('mostra o dia inteiro sem o zero, mesmo quando chega com o milissegundo cortado', () => {
    expect(formatDuration(48)).toBe('2 d')
    // uma janela de 24 h cujo Date perdeu a fração de milissegundo (summary.js): não pode virar 23 h
    expect(formatDuration(23.9999997)).toBe('1 d')
  })

  it('abaixo de 1 h, mostra os minutos, para a janela curta não virar "0 h"', () => {
    expect(formatDuration(0.33)).toBe('20 min')
    // 59,7 min arredondam para 60: aí já é 1 h, e não "60 min"
    expect(formatDuration(0.995)).toBe('1 h')
  })
})

/* O tempo de missão do painel de voo (card C17): quanto passou desde o lançamento. Os minutos e as
   horas levam dois dígitos, para o número não mudar de largura enquanto a missão toca. */
describe('formatElapsed', () => {
  it('na primeira hora mostra os minutos; depois, horas e minutos; a partir de um dia, dias e horas', () => {
    expect(formatElapsed(0)).toBe('00 min')
    expect(formatElapsed(0.125)).toBe('07 min')
    expect(formatElapsed(1)).toBe('1 h 00 min')
    expect(formatElapsed(23.5)).toBe('23 h 30 min')
    expect(formatElapsed(28)).toBe('1 d 04 h')
    expect(formatElapsed(110.15)).toBe('4 d 14 h')
  })

  it('corta para baixo: o relógio de uma missão não adianta', () => {
    expect(formatElapsed(0.999)).toBe('59 min')
    expect(formatElapsed(47.99)).toBe('1 d 23 h')
  })
})
