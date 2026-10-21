import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

import { CampoCodigosBarras, type CampoCodigosBarrasProps } from '@/features/products/CampoCodigosBarras'

/** Campo com estado proprio, dentro de um form (para provar que Enter nao o envia). */
function CampoComEstado({
  inicial = [],
  formatosGravados = {},
  onEnviar,
  ...resto
}: Partial<CampoCodigosBarrasProps> & { inicial?: string[]; onEnviar?: () => void }) {
  const [valor, setValor] = useState(inicial)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onEnviar?.()
      }}
    >
      <CampoCodigosBarras valor={valor} formatosGravados={formatosGravados} onChange={setValor} {...resto} />
      <span hidden data-testid="valor">{valor.join(',')}</span>
    </form>
  )
}

function campoAdicionar(): HTMLElement {
  return screen.getByLabelText('Adicionar código')
}

/** Como o leitor de codigo de barras: digita o codigo e tecla Enter. */
function lerCodigo(codigo: string) {
  fireEvent.change(campoAdicionar(), { target: { value: codigo } })
  fireEvent.keyDown(campoAdicionar(), { key: 'Enter' })
}

function valorAtual(): string[] {
  const texto = screen.getByTestId('valor').textContent ?? ''
  return texto === '' ? [] : texto.split(',')
}

function itens(): HTMLElement[] {
  return within(screen.getByRole('list', { name: /códigos de barras do produto/i })).getAllByRole('listitem')
}

describe('CampoCodigosBarras', () => {
  it('Enter adiciona o código e não envia o formulário (Review Focus 2)', () => {
    const onEnviar = vi.fn()
    render(<CampoComEstado onEnviar={onEnviar} />)

    lerCodigo('7891000315507')

    expect(valorAtual()).toEqual(['7891000315507'])
    expect(onEnviar).not.toHaveBeenCalled()
    expect(campoAdicionar()).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent('Código 7891000315507 adicionado.')
  })

  it('normaliza espaços e quebras de linha do leitor', () => {
    render(<CampoComEstado />)

    lerCodigo(' 7891 000315507\n')

    expect(valorAtual()).toEqual(['7891000315507'])
  })

  it('ignora entrada vazia', () => {
    render(<CampoComEstado />)

    lerCodigo('   ')

    expect(valorAtual()).toEqual([])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('o botão Adicionar também adiciona', () => {
    render(<CampoComEstado />)

    fireEvent.change(campoAdicionar(), { target: { value: '96385074' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))

    expect(valorAtual()).toEqual(['96385074'])
  })

  it('bloqueia código repetido e mantém o texto para conferir', () => {
    render(<CampoComEstado inicial={['7891000315507']} />)

    lerCodigo('7891000315507')

    expect(screen.getByRole('alert')).toHaveTextContent('Este código já está na lista.')
    expect(valorAtual()).toEqual(['7891000315507'])
    expect(campoAdicionar()).toHaveValue('7891000315507')
    expect(campoAdicionar()).toHaveAttribute('aria-invalid', 'true')

    // Digitar de novo limpa o erro.
    fireEvent.change(campoAdicionar(), { target: { value: '96385074' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('bloqueia o 21º código', () => {
    const vinte = Array.from({ length: 20 }, (_, indice) => `ABC${indice}`)
    render(<CampoComEstado inicial={vinte} />)

    lerCodigo('XYZ999')

    expect(screen.getByRole('alert')).toHaveTextContent('Limite de 20 códigos de barras atingido.')
    expect(valorAtual()).toHaveLength(20)
  })

  it('mostra o selo do formato reconhecido', () => {
    render(<CampoComEstado inicial={['7891000315507', '96385074', '036000291452']} />)

    const [ean13, ean8, upca] = itens()
    expect(within(ean13).getByText('EAN-13')).toBeInTheDocument()
    expect(within(ean8).getByText('EAN-8')).toBeInTheDocument()
    expect(within(upca).getByText('UPC-A')).toBeInTheDocument()
    expect(screen.queryByText(/formato não reconhecido/i)).not.toBeInTheDocument()
  })

  it('formato desconhecido é aceito com selo "Outro formato" e o aviso fixo', () => {
    render(<CampoComEstado />)

    lerCodigo('ABC-123')

    expect(valorAtual()).toEqual(['ABC-123'])
    const [item] = itens()
    expect(within(item).getByText('Outro formato')).toBeInTheDocument()
    expect(
      within(item).getByText('Formato não reconhecido (não é EAN-8, EAN-13 nem UPC-A). Confira antes de salvar.'),
    ).toBeInTheDocument()
  })

  it('bloqueia código novo com dígito verificador inválido', () => {
    render(<CampoComEstado />)

    lerCodigo('7891000315508')

    expect(screen.getByRole('alert')).toHaveTextContent('Dígito verificador inválido. Confira a leitura.')
    expect(valorAtual()).toEqual([])
  })

  it('código já gravado como OUTRO pode voltar à lista sem bloqueio (Review Focus 1)', () => {
    render(
      <CampoComEstado inicial={['7891000315508']} formatosGravados={{ '7891000315508': 'OUTRO' }} />,
    )
    expect(within(itens()[0]).getByText('Outro formato')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remover código 7891000315508' }))
    expect(valorAtual()).toEqual([])
    expect(campoAdicionar()).toHaveFocus()

    lerCodigo('7891000315508')
    expect(valorAtual()).toEqual(['7891000315508'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reordena com as setas, com rótulos acessíveis e o foco acompanhando o código', () => {
    render(<CampoComEstado inicial={['7891000315507', '96385074', 'ABC-1']} />)

    expect(screen.getByRole('button', { name: 'Mover código 7891000315507 para cima' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mover código ABC-1 para baixo' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Mover código 96385074 para cima' }))
    expect(valorAtual()).toEqual(['96385074', '7891000315507', 'ABC-1'])
    // Chegou ao topo: a seta para cima desabilita e o foco vai para a outra seta.
    expect(screen.getByRole('button', { name: 'Mover código 96385074 para baixo' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Mover código 7891000315507 para baixo' }))
    expect(valorAtual()).toEqual(['96385074', 'ABC-1', '7891000315507'])
    expect(screen.getByRole('status')).toHaveTextContent('Código 7891000315507 movido para a posição 3 de 3.')
  })

  it('mostra o erro recebido (ex.: 409 do backend) ligado ao campo', () => {
    render(<CampoComEstado erro='O código de barras 7891000315507 já está cadastrado no produto "Feijão".' />)

    expect(screen.getByRole('alert')).toHaveTextContent('já está cadastrado no produto "Feijão"')
    expect(campoAdicionar()).toHaveAccessibleDescription(/já está cadastrado no produto "Feijão"/)
  })

  it('desabilitado: lista visível, sem edição', () => {
    render(<CampoComEstado inicial={['7891000315507']} desabilitado />)

    expect(campoAdicionar()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remover código 7891000315507' })).toBeDisabled()
    expect(within(itens()[0]).getByText('7891000315507')).toBeInTheDocument()
  })

  it('lista vazia mostra o estado vazio', () => {
    render(<CampoComEstado />)

    expect(screen.getByText('Nenhum código de barras cadastrado.')).toBeInTheDocument()
  })
})
