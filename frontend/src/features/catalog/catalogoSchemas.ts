import { z } from 'zod'

/**
 * Nome de categoria: obrigatorio, 1-100 caracteres. Espelha a regra do backend
 * (que continua validando). Usado na tela de Categorias e no seletor do produto.
 */
export const nomeCategoriaSchema = z.string().trim()
  .min(1, 'Informe o nome da categoria.')
  .max(100, 'Nome deve ter no máximo 100 caracteres.')
