import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'

import { FornecedorPage } from '@/features/suppliers/FornecedorPage'
import { useAuth } from '@/hooks/useAuth'
import { buscarCep } from '@/services/cepService'
import {
  adicionarProdutoAoFornecedor,
  atualizarFornecedor,
  buscarFornecedor,
  cadastrarFornecedor,
  listarProdutosDoFornecedor,
  removerProdutoDoFornecedor,
} from '@/services/fornecedorService'
import { HttpError } from '@/services/httpClient'
import { listarMarcas } from '@/services/marcaService'
import { listarProdutos } from '@/services/produtoService'
import { MARCAS, produtoAtivo, produtoSimples } from '@/test/fixturesProduto'
import type { Fornecedor, FornecedorRequest, ProdutoDoFornecedor } from '@/types/fornecedor'
import type { PaginaResponse } from '@/types/produto'

vi.mock('@/services/fornecedorService', () => ({
  TAMANHO_PAGINA_FORNECEDORES: 25,
  buscarFornecedor: vi.fn(),
  cadastrarFornecedor: vi.fn(),
  atualizarFornecedor: vi.fn(),
  inativarFornecedor: vi.fn(),
  reativarFornecedor: vi.fn(),
  excluirFornecedor: vi.fn(),
  listarProdutosDoFornecedor: vi.fn(),
  adicionarProdutoAoFornecedor: vi.fn(),
  removerProdutoDoFornecedor: vi.fn(),
}))

vi.mock('@/services/marcaService', () => ({
  listarMarcas: vi.fn(),
  cadastrarMarca: vi.fn(),
}))

vi.mock('@/services/produtoService', () => ({
  listarProdutos: vi.fn(),
}))

vi.mock('@/services/cepService', () => ({
  buscarCep: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const buscarFornecedorMock = vi.mocked(buscarFornecedor)
const cadastrarFornecedorMock = vi.mocked(cadastrarFornecedor)
const atualizarFornecedorMock = vi.mocked(atualizarFornecedor)
const listarProdutosDoFornecedorMock = vi.mocked(listarProdutosDoFornecedor)
const adicionarProdutoMock = vi.mocked(adicionarProdutoAoFornecedor)
const removerProdutoMock = vi.mocked(removerProdutoDoFornecedor)
const listarMarcasMock = vi.mocked(listarMarcas)
const listarProdutosMock = vi.mocked(listarProdutos)
const buscarCepMock = vi.mocked(buscarCep)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome: 'Ana Souza',
      email: 'ana@petshop.com',
      perfil,
      empresa: { id: 1, nome: 'Pet Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    },
    token: 'token',
    estaAutenticado: true,
    carregandoSessao: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

const ENDERECO_VAZIO = {
  cep: null,
  logradouro: null,
  numeroEndereco: null,
  complemento: null,
  bairro: null,
  municipio: null,
  uf: null,
}

const FORNECEDOR: Fornecedor = {
  id: 'dist-sul',
  numero: 7,
  tipoPessoa: 'PJ',
  documento: '11222333000181',
  razaoSocial: 'Distribuidora Sul Ltda',
  nomeFantasia: null,
  inscricaoEstadual: null,
  ...ENDERECO_VAZIO,
  telefone: null,
  email: null,
  observacoes: null,
  representantes: [{ id: 'rep-1', nome: 'Carlos Lima', telefone: '11987654321', email: null }],
  marcas: [{ id: 'tio-joao', nome: 'Tio João', caminho: 'Camil › Tio João' }],
  quantidadeProdutos: 2,
  ativo: true,
  criadoEm: '2026-10-24T10:00:00',
  atualizadoEm: null,
}

function produtoDoFornecedor(extras: Partial<ProdutoDoFornecedor> = {}): ProdutoDoFornecedor {
  return {
    id: produtoAtivo.id,
    numero: 15,
    nome: 'Arroz 5kg',
    codigo: 542,
    sku: 'SKU-ARROZ',
    ativo: true,
    fornecedorDaUltimaCompra: false,
    ...extras,
  }
}

function pagina<T>(itens: T[]): PaginaResponse<T> {
  return { itens, pagina: 0, tamanho: 25, totalItens: itens.length }
}

function SondaLista() {
  const location = useLocation()
  return <h1>Lista de fornecedores{location.search}</h1>
}

function renderPagina(caminho: string, state?: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      { path: '/produtos/fornecedores', element: <SondaLista /> },
      { path: '/produtos/fornecedores/novo', element: <FornecedorPage /> },
      { path: '/produtos/fornecedores/:id', element: <FornecedorPage /> },
    ],
    { initialEntries: [{ pathname: caminho, state }] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function renderNovo() {
  const router = renderPagina('/produtos/fornecedores/novo', { voltarPara: '/produtos/fornecedores?busca=sul' })
  await screen.findByRole('form', { name: 'Novo fornecedor' })
  return router
}

async function renderEdicao(fornecedor: Fornecedor = FORNECEDOR) {
  buscarFornecedorMock.mockResolvedValue(fornecedor)
  const router = renderPagina(`/produtos/fornecedores/${fornecedor.id}`)
  await screen.findByRole('form', { name: `Editar ${fornecedor.razaoSocial}` })
  return router
}

function botaoSalvar(): HTMLElement {
  return screen.getByRole('button', { name: /^salvar$/i })
}

/** "Nome" (PF), sem confundir com "Nome fantasia". */
function campoNomePf(): HTMLElement {
  return screen.getByRole('textbox', { name: /^Nome\s*\(obrigatório\)$/ })
}

function secao(nome: string): HTMLElement {
  return screen.getByRole('region', { name: nome })
}

function ultimoRequest(): FornecedorRequest {
  const chamada = cadastrarFornecedorMock.mock.calls.at(-1) ?? atualizarFornecedorMock.mock.calls.at(-1)
  if (!chamada) {
    throw new Error('nada foi salvo')
  }
  return chamada.length === 2 ? chamada[1] : chamada[0]
}

describe('FornecedorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
    listarMarcasMock.mockResolvedValue(MARCAS)
    listarProdutosDoFornecedorMock.mockResolvedValue(pagina([]))
    listarProdutosMock.mockResolvedValue(pagina([]))
    buscarCepMock.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('cadastro novo', () => {
    it('mostra as seções na ordem e pede para salvar antes dos produtos', async () => {
      await renderNovo()

      expect(screen.getByRole('heading', { level: 1, name: 'Novo fornecedor' })).toBeInTheDocument()
      const titulos = screen.getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent)
      expect(titulos).toEqual(['Dados', 'Endereço', 'Contato', 'Representantes', 'Marcas que vende', 'Produtos que vende'])
      expect(within(secao('Produtos que vende')).getByText('Salve o fornecedor para adicionar os produtos.')).toBeInTheDocument()
      expect(listarProdutosDoFornecedorMock).not.toHaveBeenCalled()
    })

    it('PJ/PF troca os rótulos e esconde e limpa a IE (Review Focus 4)', async () => {
      await renderNovo()

      expect(screen.getByLabelText(/^Razão social/)).toBeInTheDocument()
      expect(screen.getByLabelText('CNPJ (opcional)')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Isento' }))
      expect(screen.getByLabelText('Inscrição estadual (opcional)')).toHaveValue('ISENTO')
      fireEvent.change(screen.getByLabelText('CNPJ (opcional)'), { target: { value: '11222333000181' } })

      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
      expect(campoNomePf()).toBeInTheDocument()
      expect(screen.queryByLabelText(/^Razão social/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Inscrição estadual (opcional)')).not.toBeInTheDocument()
      expect(screen.getByLabelText('CPF (opcional)')).toHaveValue('')

      fireEvent.change(campoNomePf(), { target: { value: 'João da Silva' } })
      fireEvent.change(screen.getByLabelText('CPF (opcional)'), { target: { value: '11144477735' } })
      expect(screen.getByLabelText('CPF (opcional)')).toHaveValue('111.444.777-35')

      fireEvent.click(botaoSalvar())
      await waitFor(() => expect(cadastrarFornecedorMock).toHaveBeenCalledTimes(1))
      expect(ultimoRequest()).toMatchObject({ tipoPessoa: 'PF', documento: '11144477735', inscricaoEstadual: null })
    })

    it('mascara CNPJ e telefone e mostra as mensagens da spec', async () => {
      await renderNovo()

      fireEvent.click(botaoSalvar())
      expect(await screen.findByText('Informe a razão social.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText(/^Razão social/)).toHaveFocus())
      expect(cadastrarFornecedorMock).not.toHaveBeenCalled()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      fireEvent.change(screen.getByLabelText('CNPJ (opcional)'), { target: { value: '11222333000182' } })
      expect(screen.getByLabelText('CNPJ (opcional)')).toHaveValue('11.222.333/0001-82')
      fireEvent.change(screen.getByLabelText('Inscrição estadual (opcional)'), { target: { value: '12.3' } })
      fireEvent.change(screen.getByLabelText('Telefone (opcional)'), { target: { value: '1132104000' } })
      expect(screen.getByLabelText('Telefone (opcional)')).toHaveValue('(11) 3210-4000')
      fireEvent.change(screen.getByLabelText('E-mail (opcional)'), { target: { value: 'compras@' } })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('CNPJ inválido.')).toBeInTheDocument()
      expect(screen.getByText('Informe só números ou ISENTO.')).toBeInTheDocument()
      expect(screen.getByText('E-mail inválido.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('CNPJ (opcional)')).toHaveFocus())
      expect(cadastrarFornecedorMock).not.toHaveBeenCalled()
    })

    it('o CEP preenche logradouro, bairro, município e UF', async () => {
      buscarCepMock.mockResolvedValue({ logradouro: 'Praça da Sé', bairro: 'Sé', municipio: 'São Paulo', uf: 'SP' })
      await renderNovo()

      fireEvent.change(screen.getByLabelText('CEP (opcional)'), { target: { value: '01001000' } })

      expect(screen.getByLabelText('CEP (opcional)')).toHaveValue('01001-000')
      await waitFor(() => expect(screen.getByLabelText('Logradouro (opcional)')).toHaveValue('Praça da Sé'))
      expect(buscarCepMock).toHaveBeenCalledWith('01001000')
      expect(screen.getByLabelText('Bairro (opcional)')).toHaveValue('Sé')
      expect(screen.getByLabelText('Município (opcional)')).toHaveValue('São Paulo')
      expect(screen.getByLabelText('UF')).toHaveValue('SP')
    })

    it('avisa quando o CEP não é encontrado', async () => {
      await renderNovo()

      fireEvent.change(screen.getByLabelText('CEP (opcional)'), { target: { value: '99999999' } })

      expect(await screen.findByText('Não encontramos esse CEP. Preencha o endereço manualmente.')).toBeInTheDocument()
    })

    it('representantes: "+ Adicionar representante", remover e o limite de 10', async () => {
      await renderNovo()
      const representantes = secao('Representantes')
      expect(within(representantes).getByText('Nenhum representante cadastrado.')).toBeInTheDocument()

      fireEvent.click(within(representantes).getByRole('button', { name: 'Adicionar representante' }))
      await waitFor(() => expect(screen.getByLabelText(/^Nome do representante 1/)).toHaveFocus())
      fireEvent.change(screen.getByLabelText(/^Nome do representante 1/), { target: { value: 'Carlos' } })
      fireEvent.click(within(representantes).getByRole('button', { name: 'Adicionar representante' }))
      fireEvent.click(within(representantes).getByRole('button', { name: 'Remover o representante 2' }))
      expect(screen.queryByLabelText(/^Nome do representante 2/)).not.toBeInTheDocument()

      for (let indice = 1; indice < 10; indice += 1) {
        fireEvent.click(within(representantes).getByRole('button', { name: 'Adicionar representante' }))
      }
      expect(within(representantes).getByRole('button', { name: 'Adicionar representante' })).toBeDisabled()
      expect(within(representantes).getByText('Máximo de 10 representantes.')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      fireEvent.click(botaoSalvar())
      // Os novos estao sem nome: o primeiro com erro recebe o foco.
      expect((await screen.findAllByText('Informe o nome do representante.')).length).toBe(9)
      await waitFor(() => expect(screen.getByLabelText(/^Nome do representante 2/)).toHaveFocus())
    })

    it('marcas que vende: escolhe pela árvore, mostra o caminho como chip e remove', async () => {
      cadastrarFornecedorMock.mockResolvedValue(FORNECEDOR)
      buscarFornecedorMock.mockResolvedValue(FORNECEDOR)
      await renderNovo()

      const seletor = screen.getByRole('button', { name: /^Adicionar marca/ })
      await waitFor(() => expect(seletor).toBeEnabled())
      fireEvent.click(seletor)
      fireEvent.click(await screen.findByRole('option', { name: 'Camil › Tio João' }))
      fireEvent.click(seletor)
      // A ja escolhida nao aparece de novo; sem a opcao "Sem marca".
      const lista = await screen.findByRole('listbox', { name: 'Marcas' })
      const opcoes = within(lista).getAllByRole('option').map((opcao) => opcao.textContent)
      expect(opcoes).toEqual(['Camil', 'Golden'])
      fireEvent.click(screen.getByRole('option', { name: 'Golden' }))

      const chips = screen.getByRole('list', { name: 'Marcas escolhidas' })
      expect(within(chips).getAllByRole('listitem').map((chip) => chip.textContent)).toEqual(['Camil › Tio João', 'Golden'])
      fireEvent.click(within(chips).getByRole('button', { name: 'Remover Golden' }))

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      fireEvent.click(botaoSalvar())
      await waitFor(() => expect(cadastrarFornecedorMock).toHaveBeenCalledTimes(1))
      expect(ultimoRequest().marcaIds).toEqual(['tio-joao'])
    })

    it('salva com o request normalizado e abre o fornecedor com "Fornecedor salvo."', async () => {
      cadastrarFornecedorMock.mockResolvedValue(FORNECEDOR)
      buscarFornecedorMock.mockResolvedValue(FORNECEDOR)
      const router = await renderNovo()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: '  Distribuidora Sul Ltda ' } })
      fireEvent.change(screen.getByLabelText('CNPJ (opcional)'), { target: { value: '11222333000181' } })
      fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'RS' } })
      fireEvent.click(within(secao('Representantes')).getByRole('button', { name: 'Adicionar representante' }))
      fireEvent.change(screen.getByLabelText(/^Nome do representante 1/), { target: { value: 'Carlos Lima' } })
      fireEvent.change(screen.getAllByLabelText('Telefone (opcional)')[1], { target: { value: '11987654321' } })
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(cadastrarFornecedorMock).toHaveBeenCalledTimes(1))
      expect(ultimoRequest()).toEqual({
        tipoPessoa: 'PJ',
        documento: '11222333000181',
        razaoSocial: 'Distribuidora Sul Ltda',
        nomeFantasia: null,
        inscricaoEstadual: null,
        ...ENDERECO_VAZIO,
        uf: 'RS',
        telefone: null,
        email: null,
        observacoes: null,
        representantes: [{ nome: 'Carlos Lima', telefone: '11987654321', email: null }],
        marcaIds: [],
      })
      await waitFor(() => expect(router.state.location.pathname).toBe('/produtos/fornecedores/dist-sul'))
      expect(await screen.findByRole('form', { name: 'Editar Distribuidora Sul Ltda' })).toBeInTheDocument()
      expect(await screen.findByText('Fornecedor salvo.')).toBeInTheDocument()
      // O aviso de alteracoes nao bloqueou a saida.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('mostra o documento repetido (409) no campo', async () => {
      const mensagem = 'Já existe o fornecedor Atacadão com este CNPJ.'
      cadastrarFornecedorMock.mockRejectedValue(new HttpError(409, mensagem, { documento: mensagem }))
      await renderNovo()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      fireEvent.change(screen.getByLabelText('CNPJ (opcional)'), { target: { value: '11222333000181' } })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
      expect(screen.getByLabelText('CNPJ (opcional)')).toHaveAttribute('aria-invalid', 'true')
      await waitFor(() => expect(screen.getByLabelText('CNPJ (opcional)')).toHaveFocus())
      expect(screen.getByText('O fornecedor não foi salvo. Confira os campos destacados.')).toBeInTheDocument()
    })

    it('o erro do backend num representante aparece no campo dele', async () => {
      atualizarFornecedorMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { 'representantes[0].nome': 'Informe o nome do representante.' }),
      )
      await renderEdicao()

      fireEvent.change(screen.getByLabelText(/^Nome do representante 1/), { target: { value: 'Carlos' } })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Informe o nome do representante.')).toBeInTheDocument()
      expect(screen.getByLabelText(/^Nome do representante 1/)).toHaveAttribute('aria-invalid', 'true')
    })

    it('Ctrl+Enter salva', async () => {
      cadastrarFornecedorMock.mockResolvedValue(FORNECEDOR)
      buscarFornecedorMock.mockResolvedValue(FORNECEDOR)
      await renderNovo()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      fireEvent.keyDown(screen.getByLabelText(/^Razão social/), { key: 'Enter', ctrlKey: true })

      await waitFor(() => expect(cadastrarFornecedorMock).toHaveBeenCalledTimes(1))
    })

    it('avisa das alterações não salvas ao sair', async () => {
      await renderNovo()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      fireEvent.click(screen.getByRole('link', { name: /voltar para fornecedores/i }))

      const dialogo = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar' }))
      expect(await screen.findByRole('heading', { name: 'Lista de fornecedores?busca=sul' })).toBeInTheDocument()
    })
  })

  describe('edição', () => {
    it('carrega o fornecedor com o Nº e salva o PATCH mantendo o id do representante', async () => {
      atualizarFornecedorMock.mockResolvedValue({ ...FORNECEDOR, nomeFantasia: 'Dist Sul' })
      await renderEdicao()

      expect(screen.getByText('Nº 7')).toBeInTheDocument()
      expect(screen.getByLabelText('CNPJ (opcional)')).toHaveValue('11.222.333/0001-81')
      expect(screen.getByLabelText(/^Nome do representante 1/)).toHaveValue('Carlos Lima')
      expect(within(screen.getByRole('list', { name: 'Marcas escolhidas' })).getByText('Camil › Tio João')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Nome fantasia (opcional)'), { target: { value: 'Dist Sul' } })
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atualizarFornecedorMock).toHaveBeenCalledTimes(1))
      expect(atualizarFornecedorMock.mock.calls[0][0]).toBe('dist-sul')
      expect(ultimoRequest()).toMatchObject({
        nomeFantasia: 'Dist Sul',
        representantes: [{ id: 'rep-1', nome: 'Carlos Lima', telefone: '11987654321', email: null }],
        marcaIds: ['tio-joao'],
      })
      expect(await screen.findByText('Fornecedor salvo.')).toBeInTheDocument()
    })

    it('mostra 404 como fornecedor inexistente', async () => {
      buscarFornecedorMock.mockRejectedValue(new HttpError(404, 'Requisicao falhou (HTTP 404).'))
      renderPagina('/produtos/fornecedores/sumido')

      expect(await screen.findByText('Este fornecedor não existe ou foi excluído.')).toBeInTheDocument()
    })

    it('OPERADOR só lê: campos desabilitados, sem salvar nem adicionar produto', async () => {
      definirPerfil('OPERADOR')
      listarProdutosDoFornecedorMock.mockResolvedValue(pagina([produtoDoFornecedor()]))
      await renderEdicao()

      expect(
        screen.getByText('Somente administradores podem alterar fornecedores. Você está no modo leitura.'),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/^Razão social/)).toBeDisabled()
      expect(screen.queryByRole('button', { name: /^salvar$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Adicionar representante' })).not.toBeInTheDocument()
      expect(await screen.findByRole('link', { name: 'Arroz 5kg' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Adicionar produto')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remover Arroz 5kg' })).not.toBeInTheDocument()
    })
  })

  describe('produtos que vende', () => {
    it('busca e adiciona o produto com o feedback', async () => {
      listarProdutosMock.mockResolvedValue(pagina([produtoSimples]))
      adicionarProdutoMock.mockResolvedValue(undefined)
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await renderEdicao()

      const produtos = secao('Produtos que vende')
      expect(await within(produtos).findByText('Nenhum produto ligado a este fornecedor.')).toBeInTheDocument()
      fireEvent.change(within(produtos).getByLabelText('Adicionar produto'), { target: { value: 'simples' } })
      act(() => vi.advanceTimersByTime(300))
      fireEvent.click(await within(produtos).findByRole('button', { name: 'Adicionar Produto Simples' }))

      await waitFor(() => expect(adicionarProdutoMock).toHaveBeenCalledWith('dist-sul', produtoSimples.id))
      expect(listarProdutosMock).toHaveBeenCalledWith(expect.objectContaining({ busca: 'simples' }), expect.anything())
      expect(await screen.findByText('Produto adicionado ao fornecedor.')).toBeInTheDocument()
      // A lista do fornecedor e recarregada.
      await waitFor(() => expect(listarProdutosDoFornecedorMock.mock.calls.length).toBeGreaterThan(1))
    })

    it('remove direto o produto comum e confirma o da última compra', async () => {
      listarProdutosDoFornecedorMock.mockResolvedValue(
        pagina([
          produtoDoFornecedor(),
          produtoDoFornecedor({ id: produtoSimples.id, numero: 3, nome: 'Produto Simples', codigo: null, fornecedorDaUltimaCompra: true }),
        ]),
      )
      removerProdutoMock.mockResolvedValue(undefined)
      await renderEdicao()

      const lista = await screen.findByRole('list', { name: 'Produtos que vende' })
      expect(within(lista).getByText('Última compra')).toBeInTheDocument()
      fireEvent.click(within(lista).getByRole('button', { name: 'Remover Arroz 5kg' }))
      await waitFor(() => expect(removerProdutoMock).toHaveBeenCalledWith('dist-sul', produtoAtivo.id))
      expect(await screen.findByText('Produto removido do fornecedor.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      fireEvent.click(within(lista).getByRole('button', { name: 'Remover Produto Simples' }))
      const dialogo = await screen.findByRole('dialog', { name: 'Remover o produto do fornecedor?' })
      expect(dialogo).toHaveTextContent('Este é o fornecedor da última compra de Produto Simples. Remover mesmo assim?')
      expect(removerProdutoMock).toHaveBeenCalledTimes(1)
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Remover' }))
      await waitFor(() => expect(removerProdutoMock).toHaveBeenLastCalledWith('dist-sul', produtoSimples.id))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
  })
})
