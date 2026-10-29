import { useId, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, PackageOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CampoMoeda } from '@/components/ui/campo-moeda'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { CAIXA_QUERY_KEY } from '@/features/cash-register/caixaQuery'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { lerErroDoServidor } from '@/features/cash-register/errosDoCaixa'
import { formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import {
  comUnidade,
  DEVOLUCAO_NA_FORMA,
  fraseDaConfirmacao,
  quantidadeDaLinha,
  reembolsoInicial,
  somaDoReembolso,
  valorPrevisto,
} from '@/features/pdv/devolucao'
import { chaveDaVendaParaDevolucao, PDV_QUERY_KEY } from '@/features/pdv/pdvQuery'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import { ESTOQUE_QUERY_KEY } from '@/features/stock/estoqueQuery'
import { cn } from '@/lib/utils'
import { HttpError } from '@/services/httpClient'
import { buscarVendaParaDevolucao, devolverItens } from '@/services/pdvService'
import type { FormaDePagamento } from '@/types/caixa'
import type { DestinoDaDevolucao, Devolucao, DevolucaoRequest, VendaParaDevolucao } from '@/types/pdv'

const TAMANHO_MAXIMO_DO_MOTIVO = 200
const MENSAGEM_SEM_MOTIVO = 'Informe o motivo.'
const FALHA_AO_DEVOLVER = 'Não foi possível registrar a devolução. Confira a conexão e tente de novo.'

const ROTULO_DO_DESTINO: Readonly<Record<DestinoDaDevolucao, string>> = {
  ESTOQUE: 'Voltar ao estoque',
  AVARIADO: 'Avariado (não volta)',
}

export interface FormularioDeDevolucaoProps {
  vendaId: string
  numero: number
  aoVoltar: () => void
  /** A devolucao foi gravada: a tela volta ao detalhe da venda com o aviso. */
  aoDevolver: (devolucao: Devolucao) => void
}

/**
 * "Devolver itens" (spec de Estoque, 6.2, regra 10; so ADMIN): quanto de cada
 * linha volta e para onde, o valor previsto, o reembolso pela forma original
 * e o motivo; o botao diz o que vai acontecer. O servidor confere tudo de novo.
 */
export function FormularioDeDevolucao({ vendaId, numero, aoVoltar, aoDevolver }: FormularioDeDevolucaoProps) {
  const consulta = useQuery({
    queryKey: chaveDaVendaParaDevolucao(numero),
    queryFn: () => buscarVendaParaDevolucao(numero),
  })

  if (consulta.isPending) {
    return <CarregandoCaixa rotulo="Carregando a venda para devolução" />
  }
  if (consulta.isError) {
    const mensagem =
      consulta.error instanceof HttpError && consulta.error.status === 409
        ? consulta.error.message
        : 'Não foi possível carregar a venda para devolução.'
    return (
      <ErroAoCarregar mensagem={mensagem} aoTentarDeNovo={() => consulta.refetch()}>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={aoVoltar}>
          Voltar
        </Button>
      </ErroAoCarregar>
    )
  }
  return <Formulario venda={consulta.data} vendaId={vendaId} aoVoltar={aoVoltar} aoDevolver={aoDevolver} />
}

/** Erros vindos do servidor, ja ligados a linha (pela ordem), a forma ou ao motivo. */
interface ErrosDoEnvio {
  linhas: Partial<Record<number, string>>
  formas: Partial<Record<FormaDePagamento, string>>
  reembolso: string | null
  motivo: string | null
  geral: string | null
}

const SEM_ERROS: ErrosDoEnvio = { linhas: {}, formas: {}, reembolso: null, motivo: null, geral: null }

function Formulario({
  venda,
  vendaId,
  aoVoltar,
  aoDevolver,
}: Omit<FormularioDeDevolucaoProps, 'numero'> & { venda: VendaParaDevolucao }) {
  const queryClient = useQueryClient()
  const id = useId()
  const [quantidades, setQuantidades] = useState<Partial<Record<number, string>>>({})
  const [destinos, setDestinos] = useState<Partial<Record<number, DestinoDaDevolucao>>>({})
  // null: o reembolso acompanha o valor (preenchido sozinho); depois de editado, fica o que o usuario digitou.
  const [reembolsoEditado, setReembolsoEditado] = useState<Partial<Record<FormaDePagamento, string>> | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erroDoMotivo, setErroDoMotivo] = useState<string | null>(null)
  const [erros, setErros] = useState<ErrosDoEnvio>(SEM_ERROS)
  // Uma chave por abertura do formulario: repetir o envio (rede caiu) nao grava duas vezes.
  const [chave] = useState(() => crypto.randomUUID())

  const linhas = useMemo(
    () =>
      venda.linhas.map((linha) => {
        const resultado = quantidadeDaLinha(linha, quantidades[linha.ordem] ?? '')
        const quantidade = 'quantidade' in resultado ? resultado.quantidade : 0
        return {
          linha,
          quantidade,
          erro: 'erro' in resultado ? resultado.erro : null,
          destino: destinos[linha.ordem] ?? 'ESTOQUE',
          valor: valorPrevisto(linha, quantidade),
        }
      }),
    [venda.linhas, quantidades, destinos],
  )
  const devolvidas = linhas.filter((item) => item.quantidade > 0)
  const valor = Math.round(devolvidas.reduce((soma, item) => soma + item.valor * 100, 0)) / 100
  const reembolso = reembolsoEditado ?? reembolsoInicial(venda.formas, valor)
  const soma = somaDoReembolso(reembolso)
  const reembolsos = venda.formas
    .map((forma) => ({ forma: forma.forma, valor: reembolso[forma.forma] ? Number(reembolso[forma.forma]) : 0 }))
    .filter((item) => item.valor > 0)
  const formaAlem = venda.formas.find(
    (forma) => Math.round(Number(reembolso[forma.forma] || 0) * 100) > Math.round(forma.disponivel * 100),
  )
  const somaConfere = Math.round(soma * 100) === Math.round(valor * 100)
  const temErroNasLinhas = linhas.some((item) => item.erro !== null)
  const frase = fraseDaConfirmacao(
    reembolsos,
    devolvidas.map((item) => ({ quantidade: item.quantidade, unidade: item.linha.unidade, destino: item.destino })),
  )

  const devolucao = useMutation<Devolucao, unknown, DevolucaoRequest>({
    mutationFn: (pedido) => devolverItens(vendaId, pedido),
    onSuccess: (gravada) => {
      // A devolucao muda a venda, o caixa de quem devolve, o estoque e o que o PDV mostra dos produtos.
      void queryClient.invalidateQueries({ queryKey: PDV_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ESTOQUE_QUERY_KEY })
      aoDevolver(gravada)
    },
    onError: (falha, pedido) => setErros(errosDoEnvio(falha, pedido)),
  })

  const enviar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (devolucao.isPending) {
      return
    }
    const texto = motivo.trim()
    if (texto === '') {
      setErroDoMotivo(MENSAGEM_SEM_MOTIVO)
      return
    }
    if (devolvidas.length === 0 || temErroNasLinhas || !somaConfere || formaAlem) {
      return
    }
    setErros(SEM_ERROS)
    devolucao.mutate({
      chave,
      motivo: texto,
      itens: devolvidas.map((item) => ({
        ordem: item.linha.ordem,
        quantidade: item.quantidade,
        destino: item.destino,
      })),
      reembolsos,
    })
  }

  const avisoDoReembolso = (() => {
    if (devolvidas.length === 0) {
      return null
    }
    if (formaAlem) {
      const naForma = DEVOLUCAO_NA_FORMA[formaAlem.forma]
      return `${naForma.charAt(0).toUpperCase()}${naForma.slice(1)} restam ${formatarReais(formaAlem.disponivel)} para devolver.`
    }
    if (!somaConfere) {
      if (valor === 0) {
        return 'Esta devolução não tem valor a reembolsar.'
      }
      const diferenca = Math.round((valor - soma) * 100)
      const pedido =
        venda.formas.length === 1
          ? `O reembolso precisa somar ${formatarReais(valor)}`
          : `Distribua ${formatarReais(valor)} entre as formas de pagamento`
      return `${pedido} (${diferenca > 0 ? 'faltam' : 'sobram'} ${formatarReais(Math.abs(diferenca) / 100)}).`
    }
    return null
  })()

  const pronto = devolvidas.length > 0 && !temErroNasLinhas && somaConfere && !formaAlem
  // O foco vai para a primeira quantidade que ainda pode voltar (o PDV e usado pelo teclado).
  const primeiraAberta = venda.linhas.find((linha) => linha.disponivel > 0 && !linha.etiqueta)?.ordem

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={aoVoltar} disabled={devolucao.isPending}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Venda
        </Button>
        <p className="text-sm text-muted-foreground">{`Devolver itens da venda nº ${venda.numero}`}</p>
      </div>

      <ul aria-label="Itens da venda" className="divide-y">
        {linhas.map(({ linha, quantidade, erro, destino, valor: valorDaLinha }) => {
          const idQuantidade = `${id}-quantidade-${linha.ordem}`
          const idDestino = `${id}-destino-${linha.ordem}`
          const idErro = `${id}-erro-${linha.ordem}`
          const esgotada = linha.disponivel <= 0
          const mensagem = erro ?? erros.linhas[linha.ordem] ?? null
          return (
            <li key={linha.ordem} className={cn('space-y-2 py-3', esgotada && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{linha.nome}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {esgotada
                      ? `Vendido ${comUnidade(linha.quantidade, linha.unidade)} · já devolvido`
                      : `Vendido ${comUnidade(linha.quantidade, linha.unidade)}${
                          linha.devolvida > 0 ? ` · devolvido ${comUnidade(linha.devolvida, linha.unidade)}` : ''
                        } · restam ${comUnidade(linha.disponivel, linha.unidade)}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {quantidade > 0 ? formatarReais(valorDaLinha) : ''}
                </span>
              </div>
              {!esgotada && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label htmlFor={idQuantidade} className="block text-xs font-medium">
                      {linha.etiqueta ? 'Devolver (item de balança, só inteiro)' : `Devolver (${linha.unidade})`}
                    </label>
                    {linha.etiqueta ? (
                      <NativeSelect
                        id={idQuantidade}
                        value={quantidades[linha.ordem] ? 'toda' : ''}
                        onChange={(event) =>
                          setQuantidades((atuais) => ({
                            ...atuais,
                            [linha.ordem]: event.target.value === 'toda' ? String(linha.quantidade) : '',
                          }))
                        }
                        className="h-11 w-48 md:h-9"
                      >
                        <option value="">Não devolver</option>
                        <option value="toda">{`Tudo (${comUnidade(linha.quantidade, linha.unidade)})`}</option>
                      </NativeSelect>
                    ) : (
                      <Input
                        id={idQuantidade}
                        autoFocus={linha.ordem === primeiraAberta}
                        inputMode={linha.fracionada ? 'decimal' : 'numeric'}
                        autoComplete="off"
                        placeholder="0"
                        value={quantidades[linha.ordem] ?? ''}
                        aria-invalid={mensagem ? true : undefined}
                        aria-describedby={mensagem ? idErro : undefined}
                        onChange={(event) => {
                          setQuantidades((atuais) => ({ ...atuais, [linha.ordem]: event.target.value }))
                          setErros((atuais) => ({ ...atuais, linhas: { ...atuais.linhas, [linha.ordem]: undefined } }))
                        }}
                        disabled={devolucao.isPending}
                        className="h-11 w-28 md:h-9"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={idDestino} className="block text-xs font-medium">
                      Destino
                    </label>
                    <NativeSelect
                      id={idDestino}
                      value={destino}
                      onChange={(event) =>
                        setDestinos((atuais) => ({
                          ...atuais,
                          [linha.ordem]: event.target.value === 'AVARIADO' ? 'AVARIADO' : 'ESTOQUE',
                        }))
                      }
                      disabled={devolucao.isPending}
                      className="h-11 w-48 md:h-9"
                    >
                      <option value="ESTOQUE">{ROTULO_DO_DESTINO.ESTOQUE}</option>
                      <option value="AVARIADO">{ROTULO_DO_DESTINO.AVARIADO}</option>
                    </NativeSelect>
                  </div>
                </div>
              )}
              <ErroDoCampo id={idErro} mensagem={mensagem ?? undefined} />
            </li>
          )
        })}
      </ul>

      <section aria-labelledby={`${id}-reembolso`} className="space-y-2 rounded-md bg-muted/60 px-3 py-3">
        <h3 id={`${id}-reembolso`} className="text-sm font-semibold">
          Reembolso
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {venda.formas.map((forma) => {
            const idForma = `${id}-forma-${forma.forma}`
            const erroDaForma = erros.formas[forma.forma]
            return (
              <div key={forma.forma} className="space-y-1">
                <label htmlFor={idForma} className="block text-xs font-medium">
                  {`${ROTULO_DA_FORMA[forma.forma]} · até ${formatarReais(forma.disponivel)}`}
                </label>
                <CampoMoeda
                  id={idForma}
                  value={reembolso[forma.forma] ?? ''}
                  onChange={(texto) => {
                    setReembolsoEditado({ ...reembolso, [forma.forma]: texto })
                    setErros((atuais) => ({ ...atuais, formas: { ...atuais.formas, [forma.forma]: undefined } }))
                  }}
                  disabled={devolucao.isPending || forma.disponivel <= 0}
                  aria-invalid={erroDaForma ? true : undefined}
                  className="h-11 md:h-9"
                />
                <ErroDoCampo id={`${idForma}-erro`} mensagem={erroDaForma} />
              </div>
            )
          })}
        </div>
        {reembolsoEditado && (
          <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => setReembolsoEditado(null)}>
            Distribuir sozinho de novo
          </Button>
        )}
      </section>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-motivo`} className="text-sm font-medium">
          Motivo da devolução
          <MarcaObrigatorio />
        </label>
        <textarea
          id={`${id}-motivo`}
          value={motivo}
          rows={2}
          maxLength={TAMANHO_MAXIMO_DO_MOTIVO}
          onChange={(event) => {
            setMotivo(event.target.value)
            setErroDoMotivo(null)
            setErros((atuais) => ({ ...atuais, motivo: null }))
          }}
          disabled={devolucao.isPending}
          aria-invalid={erroDoMotivo || erros.motivo ? true : undefined}
          aria-describedby={erroDoMotivo || erros.motivo ? `${id}-motivo-erro` : undefined}
          placeholder="Ex.: Produto com defeito"
          className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm"
        />
        <ErroDoCampo id={`${id}-motivo-erro`} mensagem={erroDoMotivo ?? erros.motivo ?? undefined} />
      </div>

      {/* Rodape fixo: com muitos itens, o total, o aviso, o erro do envio e a confirmacao continuam a vista. */}
      <div className="sticky -bottom-6 -mx-6 -mb-6 space-y-2 border-t bg-card px-6 pt-3 pb-6">
        <p className="flex items-baseline justify-between gap-3 text-sm font-semibold tabular-nums">
          <span>Total da devolução</span>
          <span>{formatarReais(valor)}</span>
        </p>
        {(avisoDoReembolso ?? erros.reembolso) && (
          <p role="status" className="text-sm text-warning-soft-foreground">
            {avisoDoReembolso ?? erros.reembolso}
          </p>
        )}
        {erros.geral && <ErroInline mensagem={erros.geral} />}
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoVoltar} disabled={devolucao.isPending}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11 whitespace-normal text-left" disabled={!pronto || devolucao.isPending}>
            {devolucao.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <PackageOpen className="h-4 w-4" aria-hidden="true" />
            )}
            {devolvidas.length === 0 ? 'Escolha o que devolver' : frase}
          </Button>
        </DialogFooter>
      </div>
    </form>
  )
}

/** Liga os erros do servidor ao que a tela mostra: `itens[i]` vira a linha pela ordem, `reembolsos[i]` a forma. */
function errosDoEnvio(falha: unknown, pedido: DevolucaoRequest): ErrosDoEnvio {
  const campos = [
    'motivo',
    'reembolsos',
    ...pedido.itens.flatMap((_, indice) => [`itens[${indice}].quantidade`, `itens[${indice}].ordem`]),
    ...pedido.reembolsos.flatMap((_, indice) => [`reembolsos[${indice}].valor`, `reembolsos[${indice}].forma`]),
  ]
  const { porCampo, geral } = lerErroDoServidor(falha, campos, FALHA_AO_DEVOLVER)
  const erros: ErrosDoEnvio = { linhas: {}, formas: {}, reembolso: null, motivo: null, geral }
  for (const [campo, mensagem] of Object.entries(porCampo)) {
    const item = /^itens\[(\d+)]/.exec(campo)
    const reembolso = /^reembolsos\[(\d+)]/.exec(campo)
    if (item) {
      const ordem = pedido.itens[Number(item[1])]?.ordem
      if (ordem !== undefined) {
        erros.linhas[ordem] = mensagem
      }
    } else if (reembolso) {
      const forma = pedido.reembolsos[Number(reembolso[1])]?.forma
      if (forma !== undefined) {
        erros.formas[forma] = mensagem
      }
    } else if (campo === 'reembolsos') {
      erros.reembolso = mensagem ?? null
    } else if (campo === 'motivo') {
      erros.motivo = mensagem ?? null
    }
  }
  return erros
}
