import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'

import { FornecedorPage } from '@/features/suppliers/FornecedorPage'
import { useAuth } from '@/hooks/useAuth'
import { consultarCep } from '@/services/cepService'
import {
  adicionarProdutoAoFornecedor,
  atualizarFornecedor,
  buscarFornecedor,
  cadastrarFornecedor,
  excluirFornecedor,
  inativarFornecedor,
  listarProdutosDoFornecedor,
  reativarFornecedor,
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
  consultarCep: vi.fn(),
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
const excluirFornecedorMock = vi.mocked(excluirFornecedor)
const inativarFornecedorMock = vi.mocked(inativarFornecedor)
const reativarFornecedorMock = vi.mocked(reativarFornecedor)
const listarProdutosMock = vi.mocked(listarProdutos)
const consultarCepMock = vi.mocked(consultarCep)
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
  const estado = location.state as { sucesso?: string } | null
  return (
    <div>
      <h1>Lista de fornecedores{location.search}</h1>
      {estado?.sucesso && <p>{estado.sucesso}</p>}
    </div>
  )
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

/** O grupo de um representante ("Representante 1"). */
function representante(numero: number): HTMLElement {
  return screen.getByRole('group', { name: `Representante ${numero}` })
}

function nomeDoRepresentante(numero: number): HTMLElement {
  return within(representante(numero)).getByLabelText(/^Nome/)
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
    consultarCepMock.mockResolvedValue({ tipo: 'nao-encontrado' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('cadastro novo', () => {
    it('mostra as seções na ordem e pede para salvar antes dos produtos', async () => {
      await renderNovo()

      expect(
        screen.getByText(
          'Só o nome é obrigatório. Os outros dados (CNPJ, endereço, representantes) você completa quando quiser, por exemplo com a nota fiscal em mãos.',
        ),
      ).toBeInTheDocument()
      const ajudaDaRazaoSocial =
        'Como aparece na nota fiscal. Se não souber, use o nome pelo qual você conhece o fornecedor.'
      expect(screen.getByLabelText(/^Razão social/)).toHaveAccessibleDescription(ajudaDaRazaoSocial)
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
      expect(campoNomePf()).not.toHaveAccessibleDescription(ajudaDaRazaoSocial)
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa jurídica' }))

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
      // A mascara tira os pontos; "isent" (ISENTO incompleto) passa pela mascara e o schema barra.
      fireEvent.change(screen.getByLabelText('Inscrição estadual (opcional)'), { target: { value: '12.3' } })
      expect(screen.getByLabelText('Inscrição estadual (opcional)')).toHaveValue('123')
      fireEvent.change(screen.getByLabelText('Inscrição estadual (opcional)'), { target: { value: 'isent' } })
      expect(screen.getByLabelText('Inscrição estadual (opcional)')).toHaveValue('ISENT')
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
      consultarCepMock.mockResolvedValue({
        tipo: 'encontrado',
        endereco: { logradouro: 'Praça da Sé', bairro: 'Sé', municipio: 'São Paulo', uf: 'SP' },
      })
      await renderNovo()

      fireEvent.change(screen.getByLabelText('CEP (opcional)'), { target: { value: '01001000' } })

      expect(screen.getByLabelText('CEP (opcional)')).toHaveValue('01001-000')
      await waitFor(() => expect(screen.getByLabelText('Logradouro (opcional)')).toHaveValue('Praça da Sé'))
      expect(consultarCepMock).toHaveBeenCalledWith('01001000')
      expect(screen.getByLabelText('Bairro (opcional)')).toHaveValue('Sé')
      expect(screen.getByLabelText('Município (opcional)')).toHaveValue('São Paulo')
      expect(screen.getByLabelText('UF')).toHaveValue('SP')
    })

    it('ignora a resposta atrasada de um CEP que não é mais o do campo', async () => {
      let responderAntigo: (valor: Awaited<ReturnType<typeof consultarCep>>) => void = () => undefined
      consultarCepMock.mockImplementation((cep) =>
        cep === '01001000'
          ? new Promise((resolver) => {
              responderAntigo = resolver
            })
          : Promise.resolve({
              tipo: 'encontrado',
              endereco: { logradouro: 'Rua Nova', bairro: 'Centro', municipio: 'Itu', uf: 'SP' },
            }),
      )
      await renderNovo()

      fireEvent.change(screen.getByLabelText('CEP (opcional)'), { target: { value: '01001000' } })
      fireEvent.change(screen.getByLabelText('CEP (opcional)'), { target: { value: '13300000' } })
      await waitFor(() => expect(screen.getByLabelText('Logradouro (opcional)')).toHaveValue('Rua Nova'))
      act(() => responderAntigo({
        tipo: 'encontrado',
        endereco: { logradouro: 'Praça da Sé', bairro: 'Sé', municipio: 'São Paulo', uf: 'SP' },
      }))

      await waitFor(() => expect(screen.getByLabelText('Município (opcional)')).toHaveValue('Itu'))
      expect(screen.getByLabelText('Logradouro (opcional)')).toHaveValue('Rua Nova')
    })

    it('o CEP genérico (sem rua nem bairro) não apaga o que já estava preenchido', async () => {
      consultarCepMock.mockResolvedValue({
        tipo: 'encontrado',
        endereco: { logradouro: '', bairro: '', municipio: 'Itu', uf: 'SP' },
      })
      await renderNovo()
      fireEvent.change(screen.getByLabelText('Logradouro (opcional)'), { target: { value: 'Rua das Flores' } })
      fireEvent.change(screen.getByLabelText('Bairro (opcional)'), { target: { value: 'Vila Nova' } })

      fireEvent.change(screen.getByLabelText('CEP (opcional)'), { target: { value: '13300000' } })

      await waitFor(() => expect(screen.getByLabelText('Município (opcional)')).toHaveValue('Itu'))
      expect(screen.getByLabelText('Logradouro (opcional)')).toHaveValue('Rua das Flores')
      expect(screen.getByLabelText('Bairro (opcional)')).toHaveValue('Vila Nova')
      expect(screen.getByLabelText('UF')).toHaveValue('SP')
    })

    it('na falha da consulta do CEP, avisa e deixa buscar de novo o mesmo CEP', async () => {
      consultarCepMock.mockResolvedValueOnce({ tipo: 'falha' })
      consultarCepMock.mockResolvedValueOnce({
        tipo: 'encontrado',
        endereco: { logradouro: 'Praça da Sé', bairro: 'Sé', municipio: 'São Paulo', uf: 'SP' },
      })
      await renderNovo()

      fireEvent.change(screen.getByLabelText('CEP (opcional)'), { target: { value: '01001000' } })

      expect(await screen.findByText('Não foi possível buscar o CEP agora. Tente de novo.')).toBeInTheDocument()
      expect(screen.queryByText(/Não encontramos esse CEP/)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

      await waitFor(() => expect(screen.getByLabelText('Logradouro (opcional)')).toHaveValue('Praça da Sé'))
      expect(consultarCepMock).toHaveBeenCalledTimes(2)
      expect(consultarCepMock).toHaveBeenLastCalledWith('01001000')
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
      await waitFor(() => expect(nomeDoRepresentante(1)).toHaveFocus())
      fireEvent.change(nomeDoRepresentante(1), { target: { value: 'Carlos' } })
      fireEvent.click(within(representantes).getByRole('button', { name: 'Adicionar representante' }))
      fireEvent.click(within(representantes).getByRole('button', { name: 'Remover representante 2' }))
      expect(screen.queryByRole('group', { name: 'Representante 2' })).not.toBeInTheDocument()

      for (let indice = 1; indice < 10; indice += 1) {
        fireEvent.click(within(representantes).getByRole('button', { name: 'Adicionar representante' }))
      }
      expect(within(representantes).getByRole('button', { name: 'Adicionar representante' })).toBeDisabled()
      expect(within(representantes).getByText('Máximo de 10 representantes.')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      // Os em branco sao descartados; o 3, com telefone e sem nome, barra o salvamento e recebe o foco.
      fireEvent.change(within(representante(3)).getByLabelText('Telefone (opcional)'), {
        target: { value: '11987654321' },
      })
      fireEvent.click(botaoSalvar())
      expect((await screen.findAllByText('Informe o nome do representante.')).length).toBe(1)
      await waitFor(() => expect(nomeDoRepresentante(3)).toHaveFocus())
      expect(cadastrarFornecedorMock).not.toHaveBeenCalled()
    })

    it('o erro do backend de um representante vai para a linha certa, mesmo com uma linha em branco antes', async () => {
      cadastrarFornecedorMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { 'representantes[0].telefone': 'Telefone inválido.' }),
      )
      await renderNovo()
      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      const representantes = secao('Representantes')
      fireEvent.click(within(representantes).getByRole('button', { name: 'Adicionar representante' }))
      fireEvent.click(within(representantes).getByRole('button', { name: 'Adicionar representante' }))
      fireEvent.change(nomeDoRepresentante(2), { target: { value: 'Ana' } })
      fireEvent.change(within(representante(2)).getByLabelText('Telefone (opcional)'), {
        target: { value: '11987654321' },
      })
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(cadastrarFornecedorMock).toHaveBeenCalledTimes(1))
      // So a Ana foi enviada (a linha 1, em branco, foi descartada): o [0] do backend e ela.
      expect(ultimoRequest().representantes).toEqual([{ nome: 'Ana', telefone: '11987654321', email: null }])
      const telefoneDaAna = within(representante(2)).getByLabelText('Telefone (opcional)')
      expect(await within(representante(2)).findByText('Telefone inválido.')).toBeInTheDocument()
      expect(telefoneDaAna).toHaveAttribute('aria-invalid', 'true')
      expect(within(representante(1)).getByLabelText(/^Nome/)).not.toHaveAttribute('aria-invalid')
    })

    it('o representante já gravado apagado até ficar em branco não é descartado: pede o nome', async () => {
      await renderEdicao()

      fireEvent.change(nomeDoRepresentante(1), { target: { value: '' } })
      fireEvent.change(within(representante(1)).getByLabelText('Telefone (opcional)'), { target: { value: '' } })
      fireEvent.click(botaoSalvar())

      expect(await within(representante(1)).findByText('Informe o nome do representante.')).toBeInTheDocument()
      expect(atualizarFornecedorMock).not.toHaveBeenCalled()
    })

    it('o representante deixado em branco é descartado ao salvar', async () => {
      cadastrarFornecedorMock.mockResolvedValue(FORNECEDOR)
      buscarFornecedorMock.mockResolvedValue(FORNECEDOR)
      await renderNovo()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: 'Distribuidora Sul' } })
      fireEvent.click(within(secao('Representantes')).getByRole('button', { name: 'Adicionar representante' }))
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(cadastrarFornecedorMock).toHaveBeenCalledTimes(1))
      expect(ultimoRequest().representantes).toEqual([])
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

    it('salva com o request normalizado e abre o fornecedor, que já pode receber os produtos', async () => {
      cadastrarFornecedorMock.mockResolvedValue(FORNECEDOR)
      buscarFornecedorMock.mockResolvedValue(FORNECEDOR)
      const router = await renderNovo()

      fireEvent.change(screen.getByLabelText(/^Razão social/), { target: { value: '  Distribuidora Sul Ltda ' } })
      fireEvent.change(screen.getByLabelText('CNPJ (opcional)'), { target: { value: '11222333000181' } })
      fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'RS' } })
      fireEvent.click(within(secao('Representantes')).getByRole('button', { name: 'Adicionar representante' }))
      fireEvent.change(nomeDoRepresentante(1), { target: { value: 'Carlos Lima' } })
      fireEvent.change(within(representante(1)).getByLabelText('Telefone (opcional)'), {
        target: { value: '11987654321' },
      })
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
      expect(
        await screen.findByText('Fornecedor salvo. Agora você pode adicionar os produtos que ele vende, no fim da página.'),
      ).toBeInTheDocument()
      expect(
        within(secao('Produtos que vende')).getByText(
          'Os produtos são ligados e removidos na hora, sem precisar salvar. É a mesma lista que aparece no cadastro do produto.',
        ),
      ).toBeInTheDocument()
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

      fireEvent.change(nomeDoRepresentante(1), { target: { value: 'Carlos' } })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Informe o nome do representante.')).toBeInTheDocument()
      expect(nomeDoRepresentante(1)).toHaveAttribute('aria-invalid', 'true')
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
      expect(nomeDoRepresentante(1)).toHaveValue('Carlos Lima')
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

  describe('tipo de pessoa (Review Focus 4)', () => {
    it('avisa o que a troca de tipo apagou', async () => {
      await renderNovo()

      // Sem nada preenchido, nao ha aviso.
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
      expect(screen.queryByText(/foi apagad|foram apagados/)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa jurídica' }))

      fireEvent.change(screen.getByLabelText('CNPJ (opcional)'), { target: { value: '11222333000181' } })
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
      expect(screen.getByText('O CNPJ foi apagado ao trocar para pessoa física.')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('CPF (opcional)'), { target: { value: '11144477735' } })
      expect(screen.queryByText(/foi apagado/)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa jurídica' }))
      expect(screen.getByText('O CPF foi apagado ao trocar para pessoa jurídica.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Isento' }))
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
      expect(screen.getByText('A inscrição estadual foi apagada ao trocar para pessoa física.')).toBeInTheDocument()
    })

    it('PJ -> PF -> PJ volta com a IE vazia', async () => {
      await renderNovo()

      fireEvent.click(screen.getByRole('button', { name: 'Isento' }))
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa jurídica' }))

      expect(screen.getByLabelText('Inscrição estadual (opcional)')).toHaveValue('')
      expect(screen.getByLabelText('CNPJ (opcional)')).toHaveValue('')
    })

    it('na edição, PJ com IE e CNPJ trocado para PF manda IE e documento nulos', async () => {
      atualizarFornecedorMock.mockResolvedValue({ ...FORNECEDOR, tipoPessoa: 'PF', documento: null })
      await renderEdicao({ ...FORNECEDOR, inscricaoEstadual: 'ISENTO' })
      expect(screen.getByLabelText('Inscrição estadual (opcional)')).toHaveValue('ISENTO')

      fireEvent.click(screen.getByRole('radio', { name: 'Pessoa física' }))
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atualizarFornecedorMock).toHaveBeenCalledTimes(1))
      expect(ultimoRequest()).toMatchObject({ tipoPessoa: 'PF', inscricaoEstadual: null, documento: null })
    })
  })

  describe('cabeçalho: status e exclusão', () => {
    const SEM_PRODUTOS: Fornecedor = { ...FORNECEDOR, quantidadeProdutos: 0 }

    function botaoExcluir(): HTMLElement {
      return screen.getByRole('button', { name: 'Excluir' })
    }

    it('inativa e reativa pelo cabeçalho', async () => {
      inativarFornecedorMock.mockResolvedValue({ ...FORNECEDOR, ativo: false })
      reativarFornecedorMock.mockResolvedValue(FORNECEDOR)
      await renderEdicao()

      fireEvent.click(screen.getByRole('button', { name: 'Inativar' }))
      await waitFor(() => expect(inativarFornecedorMock).toHaveBeenCalledWith('dist-sul'))
      expect(await screen.findByText('Fornecedor inativado.')).toBeInTheDocument()
      expect(screen.getByText('Fornecedor inativo não aparece para escolha no produto nem na entrada por compra.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))
      await waitFor(() => expect(reativarFornecedorMock).toHaveBeenCalledWith('dist-sul'))
      expect(await screen.findByText('Fornecedor reativado.')).toBeInTheDocument()
    })

    it('exclui (204) e volta para a lista com a mensagem', async () => {
      excluirFornecedorMock.mockResolvedValue(undefined)
      await renderEdicao(SEM_PRODUTOS)

      fireEvent.click(botaoExcluir())
      const dialogo = await screen.findByRole('dialog', { name: 'Excluir Distribuidora Sul Ltda?' })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

      await waitFor(() => expect(excluirFornecedorMock).toHaveBeenCalledWith('dist-sul'))
      expect(await screen.findByRole('heading', { name: 'Lista de fornecedores' })).toBeInTheDocument()
      expect(screen.getByText('Fornecedor "Distribuidora Sul Ltda" excluído.')).toBeInTheDocument()
    })

    it('com produtos ligados, abre já bloqueado e oferece inativar', async () => {
      inativarFornecedorMock.mockResolvedValue({ ...FORNECEDOR, ativo: false })
      await renderEdicao()

      fireEvent.click(botaoExcluir())
      const dialogo = await screen.findByRole('dialog', { name: 'Não é possível excluir "Distribuidora Sul Ltda"' })
      expect(dialogo).toHaveTextContent(
        'Este fornecedor tem 2 produtos ligados. Inative-o para tirá-lo das escolhas; dá para reativar depois.',
      )
      expect(within(dialogo).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar' }))

      await waitFor(() => expect(inativarFornecedorMock).toHaveBeenCalledWith('dist-sul'))
      expect(excluirFornecedorMock).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('já inativo e com produtos: diz que já está inativo e não oferece inativar', async () => {
      await renderEdicao({ ...FORNECEDOR, ativo: false })

      fireEvent.click(botaoExcluir())
      const dialogo = await screen.findByRole('dialog', { name: 'Não é possível excluir "Distribuidora Sul Ltda"' })
      expect(dialogo).toHaveTextContent('Ele já está inativo.')
      expect(within(dialogo).queryByRole('button', { name: 'Inativar' })).not.toBeInTheDocument()
      expect(within(dialogo).getAllByRole('button', { name: 'Fechar' }).length).toBeGreaterThan(0)
    })

    it('409 do backend (entradas registradas) mostra o motivo e deixa só "Inativar"', async () => {
      const mensagem = 'Não é possível excluir: o fornecedor tem 0 produto(s) ligados e 3 entrada(s) registradas. Inative-o.'
      excluirFornecedorMock.mockRejectedValue(new HttpError(409, mensagem))
      await renderEdicao(SEM_PRODUTOS)

      fireEvent.click(botaoExcluir())
      const dialogo = await screen.findByRole('dialog', { name: 'Excluir Distribuidora Sul Ltda?' })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

      expect(await within(dialogo).findByText(mensagem)).toBeInTheDocument()
      expect(within(dialogo).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
      expect(within(dialogo).getByRole('button', { name: 'Inativar' })).toBeInTheDocument()
    })

    it('OPERADOR não vê Excluir nem Inativar', async () => {
      definirPerfil('OPERADOR')
      await renderEdicao()

      expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Inativar' })).not.toBeInTheDocument()
    })
  })

  describe('erros do backend', () => {
    it('a marca recusada fica ligada ao campo "Adicionar marca"', async () => {
      atualizarFornecedorMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { 'marcaIds[0]': 'Esta marca não existe mais.' }),
      )
      await renderEdicao()

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Esta marca não existe mais.')).toBeInTheDocument()
      const seletor = screen.getByRole('button', { name: /^Adicionar marca/ })
      expect(seletor).toHaveAttribute('aria-invalid', 'true')
      expect(seletor).toHaveAccessibleDescription('Esta marca não existe mais.')
    })

    it('a mensagem do backend sem campo da tela aparece como veio', async () => {
      atualizarFornecedorMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { fornecedor: 'Não foi possível validar o fornecedor agora.' }),
      )
      await renderEdicao()

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Não foi possível validar o fornecedor agora.')).toBeInTheDocument()
    })
  })

  describe('produtos que vende', () => {
    it('fornecedor inativo: sem a busca de adicionar, com o aviso; remover continua', async () => {
      listarProdutosDoFornecedorMock.mockResolvedValue(pagina([produtoDoFornecedor()]))
      removerProdutoMock.mockResolvedValue(undefined)
      await renderEdicao({ ...FORNECEDOR, ativo: false })

      const produtos = secao('Produtos que vende')
      expect(within(produtos).getByText('Reative o fornecedor para ligar produtos.')).toBeInTheDocument()
      expect(within(produtos).queryByLabelText('Adicionar produto')).not.toBeInTheDocument()
      fireEvent.click(await within(produtos).findByRole('button', { name: 'Remover Arroz 5kg' }))
      await waitFor(() => expect(removerProdutoMock).toHaveBeenCalledWith('dist-sul', produtoAtivo.id))
    })

    it('a marca inativa já ligada aparece como chip "(inativa)" e é mantida no request', async () => {
      listarMarcasMock.mockResolvedValue([
        ...MARCAS,
        { ...MARCAS[0], id: 'antiga', nome: 'Antiga', caminho: 'Antiga', parentId: null, ativo: false, selecionavel: false },
      ])
      atualizarFornecedorMock.mockResolvedValue(FORNECEDOR)
      await renderEdicao({ ...FORNECEDOR, marcas: [{ id: 'antiga', nome: 'Antiga', caminho: 'Antiga' }] })

      const chips = screen.getByRole('list', { name: 'Marcas escolhidas' })
      await waitFor(() => expect(chips).toHaveTextContent('Antiga (inativa)'))
      fireEvent.click(botaoSalvar())
      await waitFor(() => expect(atualizarFornecedorMock).toHaveBeenCalledTimes(1))
      expect(ultimoRequest().marcaIds).toEqual(['antiga'])
    })

    it('o produto já ligado (200) avisa e fica marcado "Já ligado" na busca', async () => {
      listarProdutosMock.mockResolvedValue(pagina([produtoSimples]))
      adicionarProdutoMock.mockResolvedValue({ produto: produtoDoFornecedor({ id: produtoSimples.id }), criado: false })
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await renderEdicao()

      const produtos = secao('Produtos que vende')
      fireEvent.change(within(produtos).getByLabelText('Adicionar produto'), { target: { value: 'simples' } })
      act(() => vi.advanceTimersByTime(300))
      fireEvent.click(await within(produtos).findByRole('button', { name: 'Adicionar Produto Simples' }))

      expect(await screen.findByText('Produto Simples já estava ligado a este fornecedor.')).toBeInTheDocument()
      expect(within(produtos).getByText('Já ligado')).toBeInTheDocument()
      expect(within(produtos).queryByRole('button', { name: 'Adicionar Produto Simples' })).not.toBeInTheDocument()
      await waitFor(() => expect(within(produtos).getByLabelText('Adicionar produto')).toHaveFocus())
    })

    it('o limite de 20 fornecedores do produto (400) aparece na seção, junto da busca', async () => {
      listarProdutosMock.mockResolvedValue(pagina([produtoSimples]))
      adicionarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { produtoId: 'Este produto já tem 20 fornecedores. Tire um da lista do produto para ligar outro.' }),
      )
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await renderEdicao()

      const produtos = secao('Produtos que vende')
      fireEvent.change(within(produtos).getByLabelText('Adicionar produto'), { target: { value: 'simples' } })
      act(() => vi.advanceTimersByTime(300))
      fireEvent.click(await within(produtos).findByRole('button', { name: 'Adicionar Produto Simples' }))

      expect(await within(produtos).findByRole('alert')).toHaveTextContent('Este produto já tem 20 fornecedores. Tire um da lista do produto para ligar outro.')
      const busca = within(produtos).getByLabelText('Adicionar produto')
      await waitFor(() => expect(busca).toHaveFocus())
      expect(busca).toHaveAccessibleDescription('Este produto já tem 20 fornecedores. Tire um da lista do produto para ligar outro.')
      // Digitar de novo tira o aviso.
      fireEvent.change(busca, { target: { value: 'outro' } })
      expect(within(produtos).queryByRole('alert')).not.toBeInTheDocument()
    })

    it('remover o único item da página 2 volta para a última página válida', async () => {
      const primeiraPagina = Array.from({ length: 25 }, (_, indice) =>
        produtoDoFornecedor({ id: `p${indice}`, numero: indice + 1, nome: `Produto ${indice + 1}`, codigo: null }),
      )
      const ultimo = produtoDoFornecedor({ id: 'p25', numero: 26, nome: 'Produto 26', codigo: null })
      let total = 26
      listarProdutosDoFornecedorMock.mockImplementation(async (_, numero) => ({
        itens: numero === 1 ? primeiraPagina : total > 25 ? [ultimo] : [],
        pagina: numero - 1,
        tamanho: 25,
        totalItens: total,
      }))
      removerProdutoMock.mockImplementation(async () => {
        total = 25
      })
      await renderEdicao()

      const produtos = secao('Produtos que vende')
      fireEvent.click(await within(produtos).findByRole('button', { name: /Próxima/ }))
      fireEvent.click(await within(produtos).findByRole('button', { name: 'Remover Produto 26' }))

      expect(await within(produtos).findByRole('link', { name: 'Produto 1' })).toBeInTheDocument()
      expect(within(produtos).queryByText('Nenhum produto ligado a este fornecedor.')).not.toBeInTheDocument()
      expect(listarProdutosDoFornecedorMock).toHaveBeenLastCalledWith('dist-sul', 1)
    })

    it('depois de remover, o foco vai para a linha seguinte ou para o título da seção', async () => {
      const outro = produtoDoFornecedor({ id: produtoSimples.id, numero: 3, nome: 'Produto Simples', codigo: null })
      let ligados = [produtoDoFornecedor(), outro]
      listarProdutosDoFornecedorMock.mockImplementation(async () => pagina(ligados))
      removerProdutoMock.mockImplementation(async (_, produtoId) => {
        ligados = ligados.filter((produto) => produto.id !== produtoId)
      })
      await renderEdicao()

      const lista = await screen.findByRole('list', { name: 'Produtos que vende' })
      fireEvent.click(within(lista).getByRole('button', { name: 'Remover Arroz 5kg' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Remover Produto Simples' })).toHaveFocus())

      fireEvent.click(screen.getByRole('button', { name: 'Remover Produto Simples' }))
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Produtos que vende' })).toHaveFocus())
      expect(screen.getByText('Nenhum produto ligado a este fornecedor.')).toBeInTheDocument()
    })

    it('Cancelar na confirmação da última compra não remove', async () => {
      listarProdutosDoFornecedorMock.mockResolvedValue(pagina([produtoDoFornecedor({ fornecedorDaUltimaCompra: true })]))
      await renderEdicao()

      const lista = await screen.findByRole('list', { name: 'Produtos que vende' })
      fireEvent.click(within(lista).getByRole('button', { name: 'Remover Arroz 5kg' }))
      const dialogo = await screen.findByRole('dialog', { name: 'Remover o produto do fornecedor?' })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(removerProdutoMock).not.toHaveBeenCalled()
      expect(within(lista).getByRole('link', { name: 'Arroz 5kg' })).toBeInTheDocument()
      await waitFor(() => expect(within(lista).getByRole('button', { name: 'Remover Arroz 5kg' })).toHaveFocus())
    })

    it('busca e adiciona o produto com o feedback', async () => {
      listarProdutosMock.mockResolvedValue(pagina([produtoSimples]))
      adicionarProdutoMock.mockResolvedValue({ produto: produtoDoFornecedor({ id: produtoSimples.id }), criado: true })
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await renderEdicao()

      const produtos = secao('Produtos que vende')
      expect(await within(produtos).findByText('Nenhum produto ligado a este fornecedor.')).toBeInTheDocument()
      fireEvent.change(within(produtos).getByLabelText('Adicionar produto'), { target: { value: 'simples' } })
      act(() => vi.advanceTimersByTime(300))
      fireEvent.click(await within(produtos).findByRole('button', { name: 'Adicionar Produto Simples' }))

      await waitFor(() => expect(adicionarProdutoMock).toHaveBeenCalledWith('dist-sul', produtoSimples.id))
      expect(listarProdutosMock).toHaveBeenCalledWith(expect.objectContaining({ busca: 'simples' }), expect.anything())
      expect(await screen.findByText('"Produto Simples" adicionado ao fornecedor.')).toBeInTheDocument()
      // O foco volta a busca, com o termo, para adicionar o proximo; o adicionado fica "Já ligado".
      await waitFor(() => expect(within(produtos).getByLabelText('Adicionar produto')).toHaveFocus())
      expect(within(produtos).getByLabelText('Adicionar produto')).toHaveValue('simples')
      expect(within(produtos).getByText('Já ligado')).toBeInTheDocument()
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
