import { z } from 'zod'

/**
 * Nome de um item da arvore (categoria, marca): obrigatorio, 1-100 caracteres.
 * Espelha a regra do backend (que continua validando). Usado nas telas da
 * arvore e no seletor do produto.
 */
export function nomeDaArvoreSchema(singular: string) {
  return z.string().trim()
    .min(1, `Informe o nome da ${singular}.`)
    .max(100, 'Nome deve ter no máximo 100 caracteres.')
}

/** Nome de categoria (ver `nomeDaArvoreSchema`). */
export const nomeCategoriaSchema = nomeDaArvoreSchema('categoria')
