import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { useImagemDoProduto, type ImagemPendente } from '@/features/products/imagemPendente'
import { QuadroDaImagem } from '@/features/products/secoes/QuadroDaImagem'
import { ErroDeImagem, prepararImagem, type ImagemPreparada } from '@/lib/imagemDoProduto'
import { baixarImagemDoProduto } from '@/services/produtoService'
import type { ImagemDoProduto } from '@/types/produto'

vi.mock('@/lib/imagemDoProduto', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/imagemDoProduto')>()
  return { ...original, prepararImagem: vi.fn() }
})

vi.mock('@/services/produtoService', () => ({
  baixarImagemDoProduto: vi.fn(),
}))

const prepararImagemMock = vi.mocked(prepararImagem)
const baixarImagemMock = vi.mocked(baixarImagemDoProduto)

const GRAVADA: ImagemDoProduto = {
  miniaturaUrl: '/api/imagens/produtos/p/v1/miniatura?expira=1&assinatura=a',
  grandeUrl: '/api/imagens/produtos/p/v1/grande?expira=1&assinatura=b',
  largura: 1200,
  altura: 900,
  atualizadaEm: '2026-10-24T10:00:00',
}

function preparada(nome = 'g'): ImagemPreparada {
  return {
    grande: new Blob([nome], { type: 'image/webp' }),
    miniatura: new Blob(['m'], { type: 'image/webp' }),
    tipo: 'image/webp',
    largura: 1200,
    altura: 900,
  }
}

function foto(nome = 'foto.jpg', tipo = 'image/jpeg'): File {
  return new File(['x'], nome, { type: tipo })
}

let ultimoPendente: ImagemPendente

interface CenarioProps {
  gravada?: ImagemDoProduto | null
  somenteLeitura?: boolean
  enviando?: boolean
  desabilitado?: boolean
}

function Cenario({ gravada = null, somenteLeitura = false, enviando = false, desabilitado = false }: CenarioProps) {
  const imagem = useImagemDoProduto(gravada)
  ultimoPendente = imagem.pendente
  return (
    <QuadroDaImagem
      imagem={imagem}
      nomeDoProduto="Arroz 5kg"
      somenteLeitura={somenteLeitura}
      desabilitado={desabilitado}
      enviando={enviando}
    />
  )
}

function inputDeArquivo(): HTMLInputElement {
  return screen.getByLabelText('Escolher a imagem do produto') as HTMLInputElement
}

function quadro(): HTMLElement {
  return screen.getByTestId('quadro-da-imagem')
}

let urls: number

beforeEach(() => {
  vi.clearAllMocks()
  urls = 0
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:previa-${++urls}`),
      revokeObjectURL: vi.fn(),
    }),
  )
  prepararImagemMock.mockResolvedValue(preparada())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('QuadroDaImagem', () => {
  it('sem imagem: o icone neutro, "Sem imagem" e "Adicionar imagem"', () => {
    render(<Cenario />)

    expect(screen.getByText('Sem imagem')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar imagem' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trocar imagem' })).not.toBeInTheDocument()
    // O seletor oferece a camera no celular.
    expect(inputDeArquivo()).toHaveAttribute('accept', 'image/*')
  })

  it('com imagem gravada: a foto inteira com o nome do produto e Trocar, Girar e Remover', () => {
    render(<Cenario gravada={GRAVADA} />)

    const imagem = screen.getByRole('img', { name: 'Arroz 5kg' })
    expect(imagem).toHaveAttribute('src', GRAVADA.grandeUrl)
    expect(imagem).toHaveClass('object-contain')
    expect(screen.getByRole('button', { name: 'Trocar imagem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Girar imagem' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover imagem' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adicionar imagem' })).not.toBeInTheDocument()
  })

  it('"Adicionar imagem" abre o seletor de arquivo', () => {
    render(<Cenario />)
    const clique = vi.spyOn(inputDeArquivo(), 'click')

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar imagem' }))

    expect(clique).toHaveBeenCalled()
  })

  it('adicionar por arquivo: comprime na hora, mostra "Processando imagem…" e depois a previa', async () => {
    let resolver: (valor: ImagemPreparada) => void = () => {}
    prepararImagemMock.mockReturnValue(new Promise((resolve) => (resolver = resolve)))
    render(<Cenario />)
    const arquivo = foto()

    fireEvent.change(inputDeArquivo(), { target: { files: [arquivo] } })

    expect(await screen.findByText('Processando imagem…')).toBeInTheDocument()
    expect(prepararImagemMock).toHaveBeenCalledWith(arquivo, 0)
    resolver(preparada())

    const previa = await screen.findByRole('img', { name: 'Arroz 5kg' })
    expect(previa).toHaveAttribute('src', 'blob:previa-1')
    expect(screen.queryByText('Processando imagem…')).not.toBeInTheDocument()
    expect(ultimoPendente).toMatchObject({ tipo: 'nova', arquivo, rotacao: 0 })
    expect(screen.getByRole('button', { name: 'Trocar imagem' })).toBeInTheDocument()
  })

  it('escolher o mesmo arquivo de novo funciona (o input e limpo)', async () => {
    render(<Cenario />)
    fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })

    await screen.findByRole('img', { name: 'Arroz 5kg' })
    expect(inputDeArquivo().value).toBe('')
  })

  it('adicionar por arrastar e soltar, com destaque ao arrastar por cima', async () => {
    render(<Cenario />)
    const arquivo = foto()

    fireEvent.dragOver(quadro(), { dataTransfer: { files: [], types: ['Files'] } })
    expect(quadro()).toHaveAttribute('data-arrastando', 'true')
    fireEvent.dragLeave(quadro())
    expect(quadro()).not.toHaveAttribute('data-arrastando')

    fireEvent.dragOver(quadro(), { dataTransfer: { files: [], types: ['Files'] } })
    fireEvent.drop(quadro(), { dataTransfer: { files: [arquivo], types: ['Files'] } })

    await waitFor(() => expect(prepararImagemMock).toHaveBeenCalledWith(arquivo, 0))
    expect(await screen.findByRole('img', { name: 'Arroz 5kg' })).toHaveAttribute('src', 'blob:previa-1')
    expect(quadro()).not.toHaveAttribute('data-arrastando')
  })

  it('girar a imagem nova recomprime o original com a rotacao acumulada', async () => {
    render(<Cenario />)
    const arquivo = foto()
    fireEvent.change(inputDeArquivo(), { target: { files: [arquivo] } })
    await screen.findByRole('img', { name: 'Arroz 5kg' })

    prepararImagemMock.mockImplementation(async () => preparada('girada'))
    fireEvent.click(screen.getByRole('button', { name: 'Girar imagem' }))
    await waitFor(() => expect(ultimoPendente).toMatchObject({ tipo: 'nova', rotacao: 90 }))
    fireEvent.click(screen.getByRole('button', { name: 'Girar imagem' }))
    await waitFor(() => expect(ultimoPendente).toMatchObject({ tipo: 'nova', rotacao: 180 }))

    expect(prepararImagemMock).toHaveBeenNthCalledWith(2, arquivo, 90)
    expect(prepararImagemMock).toHaveBeenNthCalledWith(3, arquivo, 180)
    // A previa troca a cada giro, e a anterior e revogada.
    await waitFor(() => expect(screen.getByRole('img', { name: 'Arroz 5kg' })).toHaveAttribute('src', 'blob:previa-3'))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa-1')
  })

  it('girar a imagem gravada baixa a versao grande e a gira 90 graus', async () => {
    const baixada = new Blob(['g'], { type: 'image/webp' })
    baixarImagemMock.mockResolvedValue(baixada)
    render(<Cenario gravada={GRAVADA} />)

    fireEvent.click(screen.getByRole('button', { name: 'Girar imagem' }))

    await waitFor(() => expect(ultimoPendente).toMatchObject({ tipo: 'nova', rotacao: 90 }))
    expect(baixarImagemMock).toHaveBeenCalledWith(GRAVADA.grandeUrl)
    const [arquivo, rotacao] = prepararImagemMock.mock.calls[0]
    expect(arquivo).toBeInstanceOf(File)
    expect(arquivo.type).toBe('image/webp')
    expect(rotacao).toBe(90)
  })

  it('falha ao baixar a imagem gravada para girar mostra o erro no quadro', async () => {
    baixarImagemMock.mockRejectedValue(new Error('rede'))
    render(<Cenario gravada={GRAVADA} />)

    fireEvent.click(screen.getByRole('button', { name: 'Girar imagem' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a imagem gravada. Tente de novo.')
    expect(ultimoPendente).toEqual({ tipo: 'nenhuma' })
  })

  it('trocar a imagem gravada abre o seletor e a nova substitui a previa', async () => {
    render(<Cenario gravada={GRAVADA} />)
    const clique = vi.spyOn(inputDeArquivo(), 'click')

    fireEvent.click(screen.getByRole('button', { name: 'Trocar imagem' }))
    expect(clique).toHaveBeenCalled()
    fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })

    await waitFor(() => expect(screen.getByRole('img', { name: 'Arroz 5kg' })).toHaveAttribute('src', 'blob:previa-1'))
  })

  it('remover a imagem gravada mostra "Sem imagem" e marca a remocao', () => {
    render(<Cenario gravada={GRAVADA} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }))

    expect(screen.getByText('Sem imagem')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Arroz 5kg' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar imagem' })).toBeInTheDocument()
    expect(ultimoPendente).toEqual({ tipo: 'remover' })
  })

  it('remover uma imagem nova sem imagem gravada volta a "nenhuma"', async () => {
    render(<Cenario />)
    fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })
    await screen.findByRole('img', { name: 'Arroz 5kg' })

    fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }))

    expect(ultimoPendente).toEqual({ tipo: 'nenhuma' })
    expect(screen.getByText('Sem imagem')).toBeInTheDocument()
  })

  it('arquivo invalido mostra a mensagem no quadro, sem mudar a imagem', async () => {
    prepararImagemMock.mockRejectedValue(new ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'))
    render(<Cenario gravada={GRAVADA} />)

    fireEvent.change(inputDeArquivo(), { target: { files: [foto('anima.gif', 'image/gif')] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.')
    expect(screen.getByRole('img', { name: 'Arroz 5kg' })).toHaveAttribute('src', GRAVADA.grandeUrl)
    expect(ultimoPendente).toEqual({ tipo: 'nenhuma' })
  })

  it('arquivo maior que 15 MB mostra a mensagem de tamanho', async () => {
    prepararImagemMock.mockRejectedValue(new ErroDeImagem('A imagem deve ter no máximo 15 MB.'))
    render(<Cenario />)

    fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('A imagem deve ter no máximo 15 MB.')
  })

  it('enviando a imagem, o quadro mostra "Processando imagem…" e as acoes ficam desabilitadas', () => {
    render(<Cenario gravada={GRAVADA} enviando desabilitado />)

    expect(screen.getByText('Processando imagem…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar imagem' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Girar imagem' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remover imagem' })).toBeDisabled()
  })

  it('a imagem gravada que falha ao carregar volta ao icone', () => {
    render(<Cenario gravada={GRAVADA} />)

    fireEvent.error(screen.getByRole('img', { name: 'Arroz 5kg' }))

    expect(screen.getByText('Sem imagem')).toBeInTheDocument()
  })

  it('OPERADOR ve a imagem, sem botoes nem arrastar e soltar', () => {
    render(<Cenario gravada={GRAVADA} somenteLeitura />)

    expect(screen.getByRole('img', { name: 'Arroz 5kg' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Escolher a imagem do produto')).not.toBeInTheDocument()

    fireEvent.drop(quadro(), { dataTransfer: { files: [foto()], types: ['Files'] } })
    expect(prepararImagemMock).not.toHaveBeenCalled()
  })
})
