import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
  naoEnviada?: boolean
}

const aoAlterar = vi.fn()

function Cenario({
  gravada = null,
  somenteLeitura = false,
  enviando = false,
  desabilitado = false,
  naoEnviada = false,
}: CenarioProps) {
  const imagem = useImagemDoProduto(gravada)
  ultimoPendente = imagem.pendente
  return (
    <QuadroDaImagem
      imagem={imagem}
      nomeDoProduto="Arroz 5kg"
      somenteLeitura={somenteLeitura}
      desabilitado={desabilitado}
      enviando={enviando}
      naoEnviada={naoEnviada}
      aoAlterar={aoAlterar}
    />
  )
}

/** A regiao `aria-live` do quadro (sempre montada, so para leitor de tela). */
function anuncio(): HTMLElement {
  const regiao = document.querySelector<HTMLElement>('[aria-live="polite"]')
  if (!regiao) {
    throw new Error('regiao aria-live nao encontrada')
  }
  return regiao
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

    expect(await within(quadro()).findByText('Processando imagem…')).toBeInTheDocument()
    expect(prepararImagemMock).toHaveBeenCalledWith(arquivo, 0)
    resolver(preparada())

    const previa = await screen.findByRole('img', { name: 'Arroz 5kg' })
    expect(previa).toHaveAttribute('src', 'blob:previa-1')
    expect(within(quadro()).queryByText('Processando imagem…')).not.toBeInTheDocument()
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

  it('enviando a imagem, o quadro mostra "Enviando imagem…" e as acoes ficam desabilitadas', () => {
    render(<Cenario gravada={GRAVADA} enviando desabilitado />)

    expect(within(quadro()).getByText('Enviando imagem…')).toBeInTheDocument()
    expect(anuncio()).toHaveTextContent('Enviando imagem…')
    expect(screen.getByRole('button', { name: 'Trocar imagem' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Girar imagem' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remover imagem' })).toBeDisabled()
  })

  it('a imagem gravada que falha ao carregar volta ao icone, dizendo que nao foi possivel mostrar', () => {
    render(<Cenario gravada={GRAVADA} />)

    fireEvent.error(screen.getByRole('img', { name: 'Arroz 5kg' }))

    expect(screen.getByText('Não foi possível mostrar a imagem.')).toBeInTheDocument()
    expect(screen.queryByText('Sem imagem')).not.toBeInTheDocument()
    // As acoes continuam: da para trocar ou remover a imagem gravada.
    expect(screen.getByRole('button', { name: 'Trocar imagem' })).toBeInTheDocument()
  })

  it('OPERADOR ve a imagem, sem botoes nem arrastar e soltar', () => {
    render(<Cenario gravada={GRAVADA} somenteLeitura />)

    expect(screen.getByRole('img', { name: 'Arroz 5kg' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Escolher a imagem do produto')).not.toBeInTheDocument()

    fireEvent.drop(quadro(), { dataTransfer: { files: [foto()], types: ['Files'] } })
    expect(prepararImagemMock).not.toHaveBeenCalled()
  })

  describe('dica e avisos de pendencia', () => {
    it('a dica do formato e, so com ponteiro fino, a do arrastar', () => {
      render(<Cenario />)

      expect(screen.getByText(/^Foto em JPG, PNG ou WebP, até 15 MB\./)).toBeInTheDocument()
      const arrastar = screen.getByText('Ou arraste a foto até o quadro.')
      expect(arrastar).toHaveClass('hidden', 'pointer-fine:inline')
    })

    it('imagem nova: avisa que ela sera gravada ao salvar', async () => {
      render(<Cenario />)
      fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })

      expect(await screen.findByText('Imagem nova. Ela será gravada quando você salvar.')).toHaveClass(
        'text-xs',
        'text-muted-foreground',
      )
    })

    it('remocao pendente: avisa que a imagem sera removida ao salvar', () => {
      render(<Cenario gravada={GRAVADA} />)

      fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }))

      expect(screen.getByText('A imagem será removida quando você salvar.')).toBeInTheDocument()
    })

    it('depois da falha no envio: pede para salvar de novo', async () => {
      render(<Cenario naoEnviada />)
      fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })

      expect(
        await screen.findByText('Esta imagem ainda não foi enviada. Toque em Salvar para tentar de novo.'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Imagem nova. Ela será gravada quando você salvar.')).not.toBeInTheDocument()
    })

    it('sem mudanca, nenhum aviso de pendencia', () => {
      render(<Cenario gravada={GRAVADA} />)

      expect(screen.queryByText(/quando você salvar/)).not.toBeInTheDocument()
    })
  })

  describe('acessibilidade', () => {
    it('a regiao aria-live fica sempre montada e anuncia o processamento e a imagem pronta', async () => {
      let resolver: (valor: ImagemPreparada) => void = () => {}
      prepararImagemMock.mockReturnValue(new Promise((resolve) => (resolver = resolve)))
      render(<Cenario />)
      expect(anuncio()).toHaveClass('sr-only')
      expect(anuncio()).toHaveTextContent('')

      fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })
      await waitFor(() => expect(anuncio()).toHaveTextContent('Processando imagem…'))
      await act(async () => resolver(preparada()))

      await waitFor(() => expect(anuncio()).toHaveTextContent('Imagem pronta.'))
    })

    it('anuncia a remocao', () => {
      render(<Cenario gravada={GRAVADA} />)

      fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }))

      expect(anuncio()).toHaveTextContent('Imagem removida.')
    })

    it('depois de adicionar, o foco vai para "Trocar imagem"', async () => {
      render(<Cenario />)
      screen.getByRole('button', { name: 'Adicionar imagem' }).focus()

      fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })

      await waitFor(() => expect(screen.getByRole('button', { name: 'Trocar imagem' })).toHaveFocus())
    })

    it('depois de soltar uma foto no quadro, o foco tambem vai para "Trocar imagem"', async () => {
      render(<Cenario />)

      fireEvent.drop(quadro(), { dataTransfer: { files: [foto()], types: ['Files'] } })

      await waitFor(() => expect(screen.getByRole('button', { name: 'Trocar imagem' })).toHaveFocus())
    })

    it('depois de remover, o foco vai para "Adicionar imagem"', () => {
      render(<Cenario gravada={GRAVADA} />)
      const remover = screen.getByRole('button', { name: 'Remover imagem' })
      remover.focus()

      fireEvent.click(remover)

      expect(screen.getByRole('button', { name: 'Adicionar imagem' })).toHaveFocus()
    })

    it('girando, o botao fica aria-disabled (sem perder o foco) e ignora cliques', async () => {
      prepararImagemMock.mockReturnValue(new Promise(() => {}))
      baixarImagemMock.mockResolvedValue(new Blob(['g'], { type: 'image/webp' }))
      render(<Cenario gravada={GRAVADA} />)
      const girar = screen.getByRole('button', { name: 'Girar imagem' })
      girar.focus()

      fireEvent.click(girar)

      await waitFor(() => expect(girar).toHaveAttribute('aria-disabled', 'true'))
      expect(girar).not.toBeDisabled()
      expect(girar).toHaveFocus()
      fireEvent.click(girar)
      expect(baixarImagemMock).toHaveBeenCalledTimes(1)
    })

    it('o erro descreve Trocar e Girar (e Adicionar, sem imagem)', async () => {
      prepararImagemMock.mockRejectedValue(new ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'))
      render(<Cenario gravada={GRAVADA} />)

      fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })

      await screen.findByRole('alert')
      for (const nome of ['Trocar imagem', 'Girar imagem']) {
        expect(screen.getByRole('button', { name: nome })).toHaveAccessibleDescription(
          'Não foi possível ler esta imagem. Use JPG, PNG ou WebP.',
        )
      }
    })

    it('as acoes avisam a pagina (para limpar o sucesso e, no remover, a falha anterior)', async () => {
      render(<Cenario gravada={GRAVADA} />)

      fireEvent.click(screen.getByRole('button', { name: 'Remover imagem' }))
      expect(aoAlterar).toHaveBeenLastCalledWith('remover')
      fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })
      expect(aoAlterar).toHaveBeenLastCalledWith('escolher')
      await screen.findByRole('img', { name: 'Arroz 5kg' })
      fireEvent.click(screen.getByRole('button', { name: 'Girar imagem' }))
      expect(aoAlterar).toHaveBeenLastCalledWith('girar')
    })
  })

  describe('arrastar e soltar', () => {
    it('com o quadro ocupado, o arquivo solto e ignorado sem o navegador abrir a foto', async () => {
      prepararImagemMock.mockReturnValue(new Promise(() => {}))
      render(<Cenario />)
      fireEvent.change(inputDeArquivo(), { target: { files: [foto()] } })
      await waitFor(() => expect(prepararImagemMock).toHaveBeenCalledTimes(1))

      const dataTransfer = { files: [foto('outra.jpg')], types: ['Files'], dropEffect: 'copy' }
      fireEvent.dragOver(quadro(), { dataTransfer })
      expect(dataTransfer.dropEffect).toBe('none')
      expect(quadro()).not.toHaveAttribute('data-arrastando')
      const naoCancelado = fireEvent.drop(quadro(), { dataTransfer })

      // false = preventDefault: o navegador nao navega para a foto.
      expect(naoCancelado).toBe(false)
      expect(prepararImagemMock).toHaveBeenCalledTimes(1)
    })

    it('OPERADOR: soltar um arquivo tambem nao abre a foto no navegador', () => {
      render(<Cenario gravada={GRAVADA} somenteLeitura />)

      const naoCancelado = fireEvent.drop(quadro(), { dataTransfer: { files: [foto()], types: ['Files'] } })

      expect(naoCancelado).toBe(false)
      expect(prepararImagemMock).not.toHaveBeenCalled()
    })

    it('arrastar texto (sem arquivos) nao e tratado', () => {
      render(<Cenario />)

      const naoCancelado = fireEvent.dragOver(quadro(), { dataTransfer: { files: [], types: ['text/plain'] } })

      expect(naoCancelado).toBe(true)
      expect(quadro()).not.toHaveAttribute('data-arrastando')
    })
  })
})
