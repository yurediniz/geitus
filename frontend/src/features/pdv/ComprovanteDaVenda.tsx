import { formatarReais, FUSO_DO_CAIXA, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { formatarQuantidade } from '@/features/pdv/formatacaoPdv'
import { mascararCep, mascararCnpj, mascararTelefone } from '@/lib/documentos'
import type { Empresa } from '@/types/empresa'
import type { ItemDaVenda, Venda } from '@/types/pdv'

const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DO_CAIXA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** "26/10/2026 14:32:05" no fuso do caixa. */
function dataEHora(valor: string): string {
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? valor : DATA_E_HORA.format(data).replace(',', '')
}

/** Valor sem o "R$" (as colunas do cupom ja dizem a moeda). */
function valor(numero: number): string {
  return formatarReais(numero).replace(/^R\$\s?/, '')
}

function endereco(empresa: Empresa): string[] {
  const { logradouro, numero, complemento, bairro, municipio, uf, cep } = empresa.endereco
  return [
    [`${logradouro}, ${numero}`, complemento].filter(Boolean).join(' - '),
    `${bairro} - ${municipio}/${uf} - CEP ${mascararCep(cep)}`,
  ]
}

export interface ComprovanteDaVendaProps {
  venda: Venda
  /** Os dados completos da empresa; sem eles (falhou a leitura), vale so o nome. */
  empresa: Empresa | null
  nomeDaEmpresa: string
}

/**
 * Comprovante da venda para impressora termica de 80 mm, no formato de uma
 * NFC-e (DEC-044), mas sem nenhum dado fiscal: o sistema ainda nao emite nota,
 * entao o cupom diz em destaque que e um DOCUMENTO NAO FISCAL.
 */
export function ComprovanteDaVenda({ venda, empresa, nomeDaEmpresa }: ComprovanteDaVendaProps) {
  const descontos = venda.descontoItens + venda.descontoTotal
  const quantidadeDeItens = venda.itens.length
  return (
    <article aria-label={`Comprovante da venda nº ${venda.numero}`} className="comprovante">
      <header className="centro">
        <p className="forte grande">{empresa?.nome ?? nomeDaEmpresa}</p>
        {empresa?.razaoSocial && <p>{empresa.razaoSocial}</p>}
        {empresa?.cnpj && (
          <p>
            {`CNPJ ${mascararCnpj(empresa.cnpj)}`}
            {empresa.inscricaoEstadual && ` IE ${empresa.inscricaoEstadual}`}
          </p>
        )}
        {empresa && endereco(empresa).map((linha) => <p key={linha}>{linha}</p>)}
        {empresa?.telefone && <p>{`Tel. ${mascararTelefone(empresa.telefone)}`}</p>}
      </header>

      <hr />
      <p className="centro forte">DOCUMENTO NÃO FISCAL</p>
      <p className="centro">Comprovante de venda · não é NFC‑e</p>
      {venda.status === 'CANCELADA' && <p className="centro forte">*** VENDA CANCELADA ***</p>}
      <hr />

      <table>
        <thead>
          <tr>
            <th className="esquerda">#</th>
            <th className="esquerda">DESCRIÇÃO</th>
            <th className="direita">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {venda.itens.map((item) => (
            <LinhaDoItem key={item.ordem} item={item} />
          ))}
        </tbody>
      </table>

      <hr />
      <dl>
        <Par rotulo="Qtd. total de itens" valor={String(quantidadeDeItens)} />
        <Par rotulo="Valor total R$" valor={valor(venda.subtotal)} />
        {descontos > 0 && <Par rotulo="Descontos R$" valor={`-${valor(descontos)}`} />}
        <Par rotulo="Valor a pagar R$" valor={valor(venda.total)} forte />
      </dl>
      <dl>
        <Par rotulo="FORMA DE PAGAMENTO" valor="VALOR PAGO" forte />
        {venda.pagamentos.map((pagamento) => (
          <Par key={pagamento.forma} rotulo={ROTULO_DA_FORMA[pagamento.forma]} valor={valor(pagamento.valor)} />
        ))}
        {venda.troco > 0 && <Par rotulo="Troco R$" valor={valor(venda.troco)} />}
      </dl>

      <hr />
      <p>{venda.clienteNome ? `CONSUMIDOR: ${venda.clienteNome}` : 'CONSUMIDOR NÃO IDENTIFICADO'}</p>
      <p>{`Venda nº ${venda.numero} · ${dataEHora(venda.concluidaEm)}`}</p>
      <p>{`${venda.pontoNome} · Operador: ${venda.vendedorNome}`}</p>
      <hr />
      <p className="centro">Este comprovante não tem valor fiscal e não substitui a nota fiscal (NFC‑e).</p>
      <p className="centro">Obrigado pela preferência!</p>
    </article>
  )
}

function LinhaDoItem({ item }: { item: ItemDaVenda }) {
  const unidade = item.embalagemRotulo ?? item.unidade
  const desconto = item.descontoItem + item.descontoRateado
  return (
    <>
      <tr>
        <td className="esquerda topo">{String(item.ordem).padStart(3, '0')}</td>
        <td className="esquerda" colSpan={2}>
          {item.nome}
        </td>
      </tr>
      <tr>
        <td />
        {/* Como no detalhe do F8: quantidade quebrada (sem embalagem) sai com 3 casas. */}
        <td className="esquerda">{`${formatarQuantidade(item.quantidade, item.embalagemRotulo === null && !Number.isInteger(item.quantidade))} ${unidade} x ${valor(item.precoUnitario)}`}</td>
        <td className="direita">{valor(item.valorBruto)}</td>
      </tr>
      {desconto > 0 && (
        <tr>
          <td />
          <td className="esquerda">Desconto</td>
          <td className="direita">{`-${valor(desconto)}`}</td>
        </tr>
      )}
    </>
  )
}

function Par({ rotulo, valor: texto, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={forte ? 'par forte' : 'par'}>
      <dt>{rotulo}</dt>
      <dd>{texto}</dd>
    </div>
  )
}
