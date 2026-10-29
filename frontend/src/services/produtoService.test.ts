import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  atualizarProduto,
  buscarProduto,
  cadastrarProduto,
  excluirProduto,
  inativarProduto,
  listarHistoricoDePrecos,
  listarProdutos,
  reativarProduto,
  baixarImagemDoProduto,
  enviarImagemDoProduto,
  removerImagemDoProduto,
  sugerirSku,
} from '@/services/produtoService'
import { apiDelete, apiGet, apiGetBlob, apiPatch, apiPost, apiPutMultipart } from '@/services/httpClient'
import type { EstoqueFiltro, ProdutoRequest } from '@/types/produto'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  apiPutMultipart: vi.fn(),
  apiGetBlob: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPatchMock = vi.mocked(apiPatch)
const apiDeleteMock = vi.mocked(apiDelete)
const apiPutMultipartMock = vi.mocked(apiPutMultipart)

const ID = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f'

const produtoRequest: ProdutoRequest = {
  codigo: null,
  vendidoBalanca: false,
  nome: 'Arroz 5kg',
  nomeCurto: null,
  unidadeId: '6f1c2b8e-0000-4000-8000-000000000001',
  categoriaId: null,
  marcaId: null,
  fornecedorIds: [],
  fornecedorUltimaCompraId: null,
  descricao: null,
  precoVenda: 25.9,
  custo: null,
  precoMinimo: null,
  promocao: null,
  atacado: null,
  controlaEstoque: true,
  estoqueMinimo: null,
  estoqueMaximo: null,
  pontoReposicao: null,
  codigosBarras: ['7891000315507'],
  embalagens: [],
  sku: 'SKU-1',
}

describe('produtoService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listarProdutos (pagina)', () => {
    const PADRAO = {
      busca: '',
      status: 'ativos',
      categoria: [] as string[],
      estoque: [] as EstoqueFiltro[],
      promocao: false,
      ordem: 'nome',
      pagina: 1,
    } as const

    it('envia os padroes e a pagina 1 da tela como 0 na API', async () => {
      const pagina = { itens: [], pagina: 0, tamanho: 25, totalItens: 0 }
      apiGetMock.mockResolvedValue(pagina)

      await expect(listarProdutos(PADRAO)).resolves.toBe(pagina)

      expect(apiGetMock).toHaveBeenCalledWith('/produtos?status=ativos&ordem=nome&pagina=0&tamanho=25', {
        autenticada: true,
        signal: undefined,
      })
    })

    it('envia todos os parametros, a busca aparada e o signal', async () => {
      apiGetMock.mockResolvedValue({ itens: [], pagina: 2, tamanho: 10, totalItens: 0 })
      const controle = new AbortController()

      await listarProdutos(
        {
          busca: ' café & leite ',
          status: 'todos',
          categoria: ['3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f', '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'],
          estoque: ['zerado', 'baixo'],
          promocao: true,
          ordem: '-preco',
          pagina: 3,
          tamanho: 10,
        },
        controle.signal,
      )

      expect(apiGetMock).toHaveBeenCalledWith(
        '/produtos?busca=caf%C3%A9+%26+leite&status=todos&categoria=3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f&categoria=0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d&estoque=zerado&estoque=baixo&promocao=true&ordem=-preco&pagina=2&tamanho=10',
        { autenticada: true, signal: controle.signal },
      )
    })

    it('busca so com espacos nao vai para a API', async () => {
      apiGetMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 25, totalItens: 0 })

      await listarProdutos({ ...PADRAO, busca: '   ', status: 'inativos' })

      expect(apiGetMock).toHaveBeenCalledWith('/produtos?status=inativos&ordem=nome&pagina=0&tamanho=25', {
        autenticada: true,
        signal: undefined,
      })
    })
  })

  it('cadastra produto via POST autenticado sem enviar empresaId', async () => {
    apiPostMock.mockResolvedValue({})

    await cadastrarProduto(produtoRequest)

    expect(apiPostMock).toHaveBeenCalledWith('/produtos', produtoRequest, { autenticada: true })
    expect(apiPostMock.mock.calls[0]?.[1]).not.toHaveProperty('empresaId')
  })

  it('busca produto pelo UUID', async () => {
    apiGetMock.mockResolvedValue({})

    await buscarProduto(ID)

    expect(apiGetMock).toHaveBeenCalledWith(`/produtos/${ID}`, { autenticada: true })
  })

  it('atualiza produto via PATCH autenticado pelo UUID', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarProduto(ID, produtoRequest)

    expect(apiPatchMock).toHaveBeenCalledWith(`/produtos/${ID}`, produtoRequest, { autenticada: true })
  })

  it('inativa e reativa produto via PATCH autenticado pelo UUID', async () => {
    apiPatchMock.mockResolvedValue({})

    await inativarProduto(ID)
    await reativarProduto(ID)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, `/produtos/${ID}/inativar`, {}, { autenticada: true })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, `/produtos/${ID}/reativar`, {}, { autenticada: true })
  })

  it('exclui produto via DELETE autenticado pelo UUID', async () => {
    apiDeleteMock.mockResolvedValue(undefined)

    await excluirProduto(ID)

    expect(apiDeleteMock).toHaveBeenCalledWith(`/produtos/${ID}`, { autenticada: true })
  })

  it('codifica o id na rota', async () => {
    apiGetMock.mockResolvedValue({})

    await buscarProduto('a/b')

    expect(apiGetMock).toHaveBeenCalledWith('/produtos/a%2Fb', { autenticada: true })
  })

  it('sugere SKU devolvendo apenas o texto', async () => {
    apiGetMock.mockResolvedValue({ sku: 'P000031' })

    await expect(sugerirSku()).resolves.toBe('P000031')
    expect(apiGetMock).toHaveBeenCalledWith('/produtos/sku/sugestao', { autenticada: true })
  })

  it('lista o historico de precos paginado do produto (pagina e tamanho na URL)', async () => {
    const pagina = { itens: [], pagina: 1, tamanho: 20, totalItens: 0 }
    apiGetMock.mockResolvedValue(pagina)

    await expect(listarHistoricoDePrecos(ID, 1)).resolves.toBe(pagina)

    expect(apiGetMock).toHaveBeenCalledWith(`/produtos/${ID}/historico-precos?pagina=1&tamanho=20`, {
      autenticada: true,
    })
  })

  describe('imagem do produto', () => {
    it('envia a grande e a miniatura em duas partes do multipart, com extensao do tipo', async () => {
      const imagem = { miniaturaUrl: '/api/m', grandeUrl: '/api/g', largura: 1200, altura: 900, atualizadaEm: 'x' }
      apiPutMultipartMock.mockResolvedValue(imagem)
      const grande = new Blob(['g'], { type: 'image/webp' })
      const miniatura = new Blob(['m'], { type: 'image/webp' })

      await expect(enviarImagemDoProduto(ID, grande, miniatura)).resolves.toBe(imagem)

      const [caminho, formulario] = apiPutMultipartMock.mock.calls[0]
      expect(caminho).toBe(`/produtos/${ID}/imagem`)
      const parteGrande = formulario.get('grande')
      const parteMiniatura = formulario.get('miniatura')
      expect(parteGrande).toBeInstanceOf(File)
      expect((parteGrande as File).name).toBe('grande.webp')
      expect((parteMiniatura as File).name).toBe('miniatura.webp')
      expect((parteGrande as File).size).toBe(1)
    })

    it('em JPEG, as partes levam a extensao .jpg', async () => {
      apiPutMultipartMock.mockResolvedValue({})

      await enviarImagemDoProduto(ID, new Blob(['g'], { type: 'image/jpeg' }), new Blob(['m'], { type: 'image/jpeg' }))

      const [, formulario] = apiPutMultipartMock.mock.calls[0]
      expect((formulario.get('grande') as File).name).toBe('grande.jpg')
      expect((formulario.get('miniatura') as File).name).toBe('miniatura.jpg')
    })

    it('baixa a imagem gravada pela URL assinada (para girar)', async () => {
      const blob = new Blob(['x'], { type: 'image/webp' })
      vi.mocked(apiGetBlob).mockResolvedValue(blob)

      await expect(baixarImagemDoProduto('/api/imagens/produtos/p/v/grande?expira=1')).resolves.toBe(blob)
      expect(apiGetBlob).toHaveBeenCalledWith('/api/imagens/produtos/p/v/grande?expira=1')
    })

    it('remove a imagem com DELETE autenticado', async () => {
      apiDeleteMock.mockResolvedValue(undefined)

      await removerImagemDoProduto(ID)

      expect(apiDeleteMock).toHaveBeenCalledWith(`/produtos/${ID}/imagem`, { autenticada: true })
    })
  })
})
