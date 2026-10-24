/**
 * Bipe curto e discreto quando a leitura e recusada (spec do PDV §6.2), com
 * Web Audio: sem arquivo de som e sem dependencia. Volume baixo (0,1). Se o
 * navegador nao tiver Web Audio ou recusar tocar, fica em silencio: o erro
 * continua no campo, em vermelho.
 */

const VOLUME = 0.1
const FREQUENCIA_HZ = 220
const DURACAO_S = 0.15

type ConstrutorDeAudio = new () => AudioContext

let contexto: AudioContext | null = null

function construtorDeAudio(): ConstrutorDeAudio | undefined {
  const global = globalThis as typeof globalThis & { webkitAudioContext?: ConstrutorDeAudio }
  return global.AudioContext ?? global.webkitAudioContext
}

export function tocarBipeDeErro(): void {
  try {
    const Construtor = construtorDeAudio()
    if (!Construtor) {
      return
    }
    contexto ??= new Construtor()
    if (contexto.state === 'suspended') {
      void contexto.resume()
    }
    const oscilador = contexto.createOscillator()
    const ganho = contexto.createGain()
    oscilador.type = 'square'
    oscilador.frequency.value = FREQUENCIA_HZ
    ganho.gain.value = VOLUME
    oscilador.connect(ganho).connect(contexto.destination)
    oscilador.start()
    oscilador.stop(contexto.currentTime + DURACAO_S)
  } catch {
    // Sem som: o erro ja aparece no campo.
    contexto = null
  }
}
