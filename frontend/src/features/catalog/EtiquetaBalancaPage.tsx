import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Info, Loader2, ScanBarcode, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { ETIQUETA_BALANCA_QUERY_KEY, mensagemErroCatalogo } from '@/features/catalog/catalogoQuery'
import { AvisoSomenteLeitura, ErroInline, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { rotaDoProduto } from '@/features/products/navegacaoProdutos'
import { useAuth } from '@/hooks/useAuth'
import {
  MODELOS_DE_ETIQUETA,
  TAMANHO_ETIQUETA,
  descreverFormatoEtiqueta,
  modeloDaConfiguracao,
  totalDigitosEtiqueta,
} from '@/lib/etiquetaBalanca'
import { cn } from '@/lib/utils'
import {
  buscarConfiguracaoEtiqueta,
  salvarConfiguracaoEtiqueta,
  testarEtiqueta,
} from '@/services/etiquetaBalancaService'
import type {
  ConfiguracaoEtiqueta,
  ConfiguracaoEtiquetaResponse,
  ProdutoComCodigoGrandeDemais,
  SalvarEtiquetaResponse,
  TesteEtiquetaResponse,
  TipoInformacaoEtiqueta,
} from '@/types/etiquetaBalanca'

/** Valor do select "Modelo" quando a configuracao nao bate com nenhum modelo pronto. */
const PERSONALIZADO = 'personalizado'

const OPCOES_DIGITOS_CODIGO = [4, 5, 6] as const
const OPCOES_PREENCHIMENTO = [0, 1, 2] as const
const OPCOES_DIGITOS_INFORMACAO = [4, 5, 6, 7] as const
const OPCOES_CASAS = [2, 3] as const

const ROTULO_TIPO: Readonly<Record<TipoInformacaoEtiqueta, string>> = {
  VALOR: 'Valor (R$)',
  PESO: 'Peso (kg)',
}

/** Problema do formato que impede salvar e testar; null quando o formato e valido. */
function problemaDoFormato(config: ConfiguracaoEtiqueta): string | null {
  if (!/^\d{1,2}$/.test(config.prefixo)) {
    return 'O prefixo deve ter 1 ou 2 dígitos.'
  }
  const total = totalDigitosEtiqueta(config)
  return total === TAMANHO_ETIQUETA
    ? null
    : `A etiqueta precisa ter ${TAMANHO_ETIQUETA} dígitos no total (hoje: ${total}).`
}

/** So os campos do formato (a resposta da API traz tambem o `padrao`). */
function semPadrao({ padrao: _padrao, ...configuracao }: ConfiguracaoEtiquetaResponse): ConfiguracaoEtiqueta {
  return configuracao
}

/**
 * Tela "Balança" do catalogo (/produtos/balanca, spec B2 §3.3): o formato da
 * etiqueta que a balanca imprime, com modelos prontos, a previa e o teste de
 * uma etiqueta. Leitura e teste para todos; salvar so ADMIN (o backend tambem barra).
 */
export function EtiquetaBalancaPage() {
  const { usuario } = useAuth()
  const podeAlterar = usuario?.perfil === 'ADMIN'
  const configuracaoQuery = useQuery<ConfiguracaoEtiquetaResponse>({
    queryKey: ETIQUETA_BALANCA_QUERY_KEY,
    queryFn: () => buscarConfiguracaoEtiqueta(),
  })

  let conteudo: ReactNode
  if (configuracaoQuery.isPending) {
    conteudo = (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando a configuração...
      </p>
    )
  } else if (configuracaoQuery.isError) {
    conteudo = (
      <div className="max-w-2xl space-y-3">
        <ErroInline mensagem="Não foi possível carregar a configuração da etiqueta." />
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => configuracaoQuery.refetch()}>
          Tentar novamente
        </Button>
      </div>
    )
  } else {
    conteudo = <FormularioEtiqueta inicial={configuracaoQuery.data} podeAlterar={podeAlterar} />
  }

  return (
    <div className="space-y-6">
      <CatalogoNav />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Etiqueta de balança</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Como o Geitus lê a etiqueta que a balança imprime para os produtos vendidos a granel: o código do produto e o
          valor ou o peso.
        </p>
      </div>
      {!podeAlterar && (
        <AvisoSomenteLeitura texto="Somente administradores podem alterar a etiqueta da balança. Você está no modo leitura." />
      )}
      {conteudo}
    </div>
  )
}

interface FormularioEtiquetaProps {
  /** Configuracao carregada (lida so na montagem). */
  inicial: ConfiguracaoEtiquetaResponse
  podeAlterar: boolean
}

function FormularioEtiqueta({ inicial, podeAlterar }: FormularioEtiquetaProps) {
  const queryClient = useQueryClient()
  const [config, setConfig] = useState<ConfiguracaoEtiqueta>(() => semPadrao(inicial))
  const [padrao, setPadrao] = useState(inicial.padrao)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [afetados, setAfetados] = useState<ProdutoComCodigoGrandeDemais[]>([])
  const desabilitado = !podeAlterar

  const salvarMutation = useMutation<SalvarEtiquetaResponse, unknown, ConfiguracaoEtiqueta>({
    mutationFn: (configuracao) => salvarConfiguracaoEtiqueta(configuracao),
    onMutate: () => {
      setMensagemSucesso(null)
      setAfetados([])
    },
    onSuccess: (resposta) => {
      queryClient.setQueryData(ETIQUETA_BALANCA_QUERY_KEY, resposta.configuracao)
      setPadrao(resposta.configuracao.padrao)
      setAfetados(resposta.produtosComCodigoGrandeDemais)
      setMensagemSucesso('Configuração da etiqueta salva.')
    },
  })

  const alterar = (mudanca: Partial<ConfiguracaoEtiqueta>) => {
    setConfig((atual) => ({ ...atual, ...mudanca }))
    setMensagemSucesso(null)
    salvarMutation.reset()
  }

  const modelo = modeloDaConfiguracao(config)
  const problema = problemaDoFormato(config)
  const total = totalDigitosEtiqueta(config)
  const nomeInformacao = config.tipoInformacao === 'VALOR' ? 'valor' : 'peso'
  const erroSalvar = salvarMutation.isError
    ? mensagemErroCatalogo(salvarMutation.error, {
        padrao: 'Não foi possível salvar a configuração. Tente novamente.',
        naoEncontrado: 'Não foi possível salvar a configuração. Atualize a tela e tente novamente.',
        semPermissao: 'Somente administradores podem alterar a etiqueta da balança.',
      })
    : null

  return (
    <div className="max-w-3xl space-y-6">
      <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroSalvar} />
      {afetados.length > 0 && <AvisoProdutosAfetados produtos={afetados} />}

      <Card>
        <CardHeader>
          <CardTitle>Formato da etiqueta</CardTitle>
          <CardDescription>
            Escolha o modelo da sua balança ou ajuste os campos. A etiqueta sempre tem {TAMANHO_ETIQUETA} dígitos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {padrao && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              A empresa ainda não salvou a configuração: este é o padrão do Geitus.
            </p>
          )}

          <div className="max-w-md space-y-1.5">
            <label htmlFor="modelo" className="text-sm font-medium">
              Modelo
            </label>
            <NativeSelect
              id="modelo"
              value={modelo?.id ?? PERSONALIZADO}
              disabled={desabilitado}
              onChange={(event) => {
                const escolhido = MODELOS_DE_ETIQUETA.find((opcao) => opcao.id === event.target.value)
                if (escolhido) {
                  alterar(escolhido.configuracao)
                }
              }}
            >
              {MODELOS_DE_ETIQUETA.map((opcao) => (
                <option key={opcao.id} value={opcao.id}>
                  {opcao.nome}
                </option>
              ))}
              <option value={PERSONALIZADO}>Personalizado</option>
            </NativeSelect>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="prefixo" className="text-sm font-medium">
                Prefixo
              </label>
              <Input
                id="prefixo"
                value={config.prefixo}
                onChange={(event) => alterar({ prefixo: event.target.value.replace(/\D/g, '') })}
                disabled={desabilitado}
                inputMode="numeric"
                maxLength={2}
                autoComplete="off"
                aria-describedby="prefixo-ajuda"
              />
              <p id="prefixo-ajuda" className="text-xs text-muted-foreground">
                1 ou 2 dígitos no início da etiqueta.
              </p>
            </div>
            <CampoNumerico
              id="digitosCodigo"
              rotulo="Dígitos do código"
              valor={config.digitosCodigo}
              opcoes={OPCOES_DIGITOS_CODIGO}
              desabilitado={desabilitado}
              aoAlterar={(digitosCodigo) => alterar({ digitosCodigo })}
            />
            <CampoNumerico
              id="digitosPreenchimento"
              rotulo="Zeros de preenchimento"
              ajuda="Zeros entre o código e o valor, usados em alguns modelos."
              valor={config.digitosPreenchimento}
              opcoes={OPCOES_PREENCHIMENTO}
              desabilitado={desabilitado}
              aoAlterar={(digitosPreenchimento) => alterar({ digitosPreenchimento })}
            />
            <div className="space-y-1.5">
              <label htmlFor="tipoInformacao" className="text-sm font-medium">
                A etiqueta traz
              </label>
              <NativeSelect
                id="tipoInformacao"
                value={config.tipoInformacao}
                disabled={desabilitado}
                onChange={(event) =>
                  alterar({ tipoInformacao: event.target.value === 'PESO' ? 'PESO' : 'VALOR' })
                }
              >
                {(Object.keys(ROTULO_TIPO) as TipoInformacaoEtiqueta[]).map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {ROTULO_TIPO[tipo]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <CampoNumerico
              id="digitosInformacao"
              rotulo={`Dígitos do ${nomeInformacao}`}
              valor={config.digitosInformacao}
              opcoes={OPCOES_DIGITOS_INFORMACAO}
              desabilitado={desabilitado}
              aoAlterar={(digitosInformacao) => alterar({ digitosInformacao })}
            />
            <CampoNumerico
              id="casasDecimais"
              rotulo="Casas decimais"
              valor={config.casasDecimais}
              opcoes={OPCOES_CASAS}
              desabilitado={desabilitado}
              aoAlterar={(casasDecimais) => alterar({ casasDecimais })}
            />
          </div>

          <div className="flex min-h-11 items-center gap-3">
            <Switch
              id="digitoVerificador"
              aria-labelledby="digitoVerificador-rotulo"
              checked={config.digitoVerificador}
              onCheckedChange={(digitoVerificador) => alterar({ digitoVerificador })}
              disabled={desabilitado}
            />
            <label id="digitoVerificador-rotulo" htmlFor="digitoVerificador" className="cursor-pointer text-sm font-medium">
              Tem dígito verificador no fim
            </label>
          </div>

          {/* Previa: o formato em letras e o total, para conferir com a etiqueta impressa. */}
          <div className="space-y-1 rounded-md bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">Prévia do formato</p>
            <p className="font-medium tabular-nums break-words">{descreverFormatoEtiqueta(config)}</p>
            <p className={cn('text-sm tabular-nums', problema ? 'text-destructive' : 'text-muted-foreground')}>
              {`${total} de ${TAMANHO_ETIQUETA} dígitos`}
            </p>
            {problema && (
              <p id="formato-problema" className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {problema}
              </p>
            )}
          </div>

          {podeAlterar && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => salvarMutation.mutate(config)}
                disabled={problema !== null || salvarMutation.isPending}
                aria-describedby={problema ? 'formato-problema' : undefined}
              >
                {salvarMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Salvar configuração
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TesteDeEtiqueta config={config} formatoValido={problema === null} />
    </div>
  )
}

interface CampoNumericoProps {
  id: string
  rotulo: string
  ajuda?: string
  valor: number
  opcoes: readonly number[]
  desabilitado: boolean
  aoAlterar: (valor: number) => void
}

/** Select de uma quantidade de digitos (as opcoes sao os intervalos aceitos pelo backend). */
function CampoNumerico({ id, rotulo, ajuda, valor, opcoes, desabilitado, aoAlterar }: CampoNumericoProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <NativeSelect
        id={id}
        value={String(valor)}
        disabled={desabilitado}
        aria-describedby={ajuda ? `${id}-ajuda` : undefined}
        onChange={(event) => aoAlterar(Number(event.target.value))}
      >
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </NativeSelect>
      {ajuda && (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
    </div>
  )
}

/** Aviso (nao bloqueia) dos produtos "Vendidos na balança" cujo codigo nao cabe no novo formato. */
function AvisoProdutosAfetados({ produtos }: { produtos: ProdutoComCodigoGrandeDemais[] }) {
  const titulo =
    produtos.length === 1
      ? '1 produto tem código com mais dígitos do que esta etiqueta comporta.'
      : `${produtos.length} produtos têm código com mais dígitos do que esta etiqueta comporta.`
  return (
    <div role="status" className="space-y-2 rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
      <p className="flex items-start gap-2 font-medium text-warning-soft-foreground">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {titulo}
      </p>
      <p className="text-warning-soft-foreground">Troque o código desses produtos para vendê-los na balança.</p>
      <ul className="space-y-1">
        {produtos.map((produto) => (
          <li key={produto.id}>
            <Link
              to={rotaDoProduto(produto.id)}
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 tabular-nums"
            >
              {`Nº ${produto.numero} · ${produto.nome} · Cód. ${produto.codigo}`}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface TesteDeEtiquetaProps {
  /** Configuracao da tela (ainda nao salva). */
  config: ConfiguracaoEtiqueta
  formatoValido: boolean
}

/** Classe do resultado: produto encontrado, codigo sem produto ou numero fora do formato. */
function classeDoResultado(resultado: TesteEtiquetaResponse): string {
  if (resultado.produto) {
    return 'bg-success-soft text-success-soft-foreground'
  }
  return resultado.leitura ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-muted text-muted-foreground'
}

/**
 * "Testar etiqueta": le um numero com a configuracao da tela e mostra o
 * produto encontrado pelo codigo (a mensagem vem pronta do backend).
 */
function TesteDeEtiqueta({ config, formatoValido }: TesteDeEtiquetaProps) {
  const [numero, setNumero] = useState('')
  const testeMutation = useMutation<TesteEtiquetaResponse, unknown, { codigo: string; configuracao: ConfiguracaoEtiqueta }>({
    mutationFn: ({ codigo, configuracao }) => testarEtiqueta(codigo, configuracao),
  })
  const codigo = numero.trim()
  const podeTestar = codigo !== '' && formatoValido && !testeMutation.isPending

  const testar = () => {
    if (podeTestar) {
      testeMutation.mutate({ codigo, configuracao: config })
    }
  }

  const resultado = testeMutation.data
  return (
    <Card>
      <CardHeader>
        <CardTitle>Testar etiqueta</CardTitle>
        <CardDescription>Leia ou digite o número de uma etiqueta para conferir o formato antes de salvar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-sm">
            <label htmlFor="numeroEtiqueta" className="text-sm font-medium">
              Número da etiqueta
            </label>
            <div className="relative">
              <ScanBarcode
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="numeroEtiqueta"
                value={numero}
                onChange={(event) => {
                  setNumero(event.target.value)
                  testeMutation.reset()
                }}
                // O leitor termina com Enter: testa na hora.
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    testar()
                  }
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ex.: 2000542010000"
                className="h-11 pl-9 tabular-nums"
              />
            </div>
          </div>
          <Button type="button" variant="outline" className="h-11" onClick={testar} disabled={!podeTestar}>
            {testeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Testar
          </Button>
        </div>
        {!formatoValido && <p className="text-xs text-muted-foreground">Corrija o formato para testar.</p>}
        <div role="status" aria-live="polite">
          {resultado && (
            <p className={cn('flex items-start gap-2 rounded-md px-3 py-2 text-sm font-medium', classeDoResultado(resultado))}>
              {resultado.produto ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {resultado.mensagem}
            </p>
          )}
        </div>
        {testeMutation.isError && <ErroInline mensagem="Não foi possível testar a etiqueta. Tente novamente." />}
      </CardContent>
    </Card>
  )
}
