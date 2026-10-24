import { Link } from 'react-router-dom'
import { Eye, Loader2, RotateCcw, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SemValor } from '@/features/products/listagem/ValoresDoProduto'
import { SeloStatus } from '@/features/products/SeloStatus'
import { documentoFormatado, telefoneFormatado } from '@/features/suppliers/formatacaoFornecedor'
import { rotaDoFornecedor, type EstadoParaFornecedor } from '@/features/suppliers/navegacaoFornecedores'
import { pluralizar } from '@/features/catalog/textosCatalogo'
import type { FornecedorItemLista } from '@/types/fornecedor'

export interface ListaDeFornecedoresProps {
  fornecedores: FornecedorItemLista[]
  somenteLeitura: boolean
  estadoParaFornecedor: EstadoParaFornecedor
  /** Fornecedor com a troca de status em andamento. */
  alterandoStatusId: string | null
  aoAlterarStatus: (fornecedor: FornecedorItemLista) => void
  /** Id do titulo da lista (com o total), que nomeia a tabela. */
  idDoTitulo: string
}

function NomeDoFornecedor({
  fornecedor,
  estado,
  comSelo = false,
}: {
  fornecedor: FornecedorItemLista
  estado: EstadoParaFornecedor
  /** Selo "Inativo" junto do nome (nos cards; a tabela tem a coluna Status). */
  comSelo?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          to={rotaDoFornecedor(fornecedor.id)}
          state={estado}
          className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
        >
          {fornecedor.razaoSocial}
        </Link>
        {comSelo && !fornecedor.ativo && <SeloStatus ativo={false} />}
      </div>
      {fornecedor.nomeFantasia && (
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{fornecedor.nomeFantasia}</p>
      )}
    </div>
  )
}

function Representante({ fornecedor }: { fornecedor: FornecedorItemLista }) {
  const representante = fornecedor.representantePrincipal
  if (!representante) {
    return <SemValor motivo="Sem representante" />
  }
  const telefone = telefoneFormatado(representante.telefone)
  return (
    <span>
      {representante.nome}
      {telefone && <span className="block text-xs text-muted-foreground tabular-nums">{telefone}</span>}
    </span>
  )
}

function BotaoStatus({
  fornecedor,
  alterando,
  aoAlterar,
}: {
  fornecedor: FornecedorItemLista
  alterando: boolean
  aoAlterar: () => void
}) {
  const Icone = alterando ? Loader2 : fornecedor.ativo ? XCircle : RotateCcw
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-11 md:h-9"
      disabled={alterando}
      onClick={aoAlterar}
      aria-label={`${fornecedor.ativo ? 'Inativar' : 'Reativar'} ${fornecedor.razaoSocial}`}
    >
      <Icone className={alterando ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
      {fornecedor.ativo ? 'Inativar' : 'Reativar'}
    </Button>
  )
}

/**
 * Lista de fornecedores: tabela a partir de 1.024 px e cards abaixo disso (so
 * por CSS, como a lista de produtos). Colunas da spec B5 §8.2: Nº, Nome (com o
 * fantasia abaixo), CNPJ/CPF, telefone, representante, produtos e status.
 */
export function ListaDeFornecedores({
  fornecedores,
  somenteLeitura,
  estadoParaFornecedor,
  alterandoStatusId,
  aoAlterarStatus,
  idDoTitulo,
}: ListaDeFornecedoresProps) {
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table aria-labelledby={idDoTitulo} className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Nº
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Nome
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                CNPJ/CPF
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Telefone
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Representante
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Produtos
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Status
              </th>
              {!somenteLeitura && (
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Ações
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {fornecedores.map((fornecedor) => {
              const documento = documentoFormatado(fornecedor.tipoPessoa, fornecedor.documento)
              const telefone = telefoneFormatado(fornecedor.telefone)
              return (
                <tr key={fornecedor.id} className="align-middle">
                  <td className="px-3 py-3 text-muted-foreground tabular-nums">{fornecedor.numero}</td>
                  <td className="px-3 py-3">
                    <NomeDoFornecedor fornecedor={fornecedor} estado={estadoParaFornecedor} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                    {documento ?? <SemValor motivo="Sem documento" />}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                    {telefone ?? <SemValor motivo="Sem telefone" />}
                  </td>
                  <td className="px-3 py-3">
                    <Representante fornecedor={fornecedor} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{fornecedor.quantidadeProdutos}</td>
                  <td className="px-3 py-3">
                    <SeloStatus ativo={fornecedor.ativo} />
                  </td>
                  {!somenteLeitura && (
                    <td className="px-3 py-2 text-right">
                      <BotaoStatus
                        fornecedor={fornecedor}
                        alterando={alterandoStatusId === fornecedor.id}
                        aoAlterar={() => aoAlterarStatus(fornecedor)}
                      />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 lg:hidden" aria-label="Fornecedores">
        {fornecedores.map((fornecedor) => {
          const documento = documentoFormatado(fornecedor.tipoPessoa, fornecedor.documento)
          const telefone = telefoneFormatado(fornecedor.telefone)
          return (
            <li key={fornecedor.id}>
              <article className="space-y-3 rounded-md border p-4" aria-label={fornecedor.razaoSocial}>
                <div className="flex items-start justify-between gap-3">
                  <NomeDoFornecedor fornecedor={fornecedor} estado={estadoParaFornecedor} comSelo />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">Nº {fornecedor.numero}</span>
                </div>
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  {documento && (
                    <div>
                      <dt className="sr-only">CNPJ/CPF</dt>
                      <dd className="tabular-nums">{documento}</dd>
                    </div>
                  )}
                  {telefone && (
                    <div>
                      <dt className="sr-only">Telefone</dt>
                      <dd className="tabular-nums">{telefone}</dd>
                    </div>
                  )}
                  {fornecedor.representantePrincipal && (
                    <div>
                      <dt className="sr-only">Representante</dt>
                      <dd className="text-muted-foreground">
                        <Representante fornecedor={fornecedor} />
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="sr-only">Produtos</dt>
                    <dd className="text-muted-foreground tabular-nums">
                      {pluralizar(fornecedor.quantidadeProdutos, 'produto', 'produtos')}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm" className="h-11">
                    <Link to={rotaDoFornecedor(fornecedor.id)} state={estadoParaFornecedor}>
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      Abrir
                    </Link>
                  </Button>
                  {!somenteLeitura && (
                    <BotaoStatus
                      fornecedor={fornecedor}
                      alterando={alterandoStatusId === fornecedor.id}
                      aoAlterar={() => aoAlterarStatus(fornecedor)}
                    />
                  )}
                </div>
              </article>
            </li>
          )
        })}
      </ul>
    </>
  )
}
