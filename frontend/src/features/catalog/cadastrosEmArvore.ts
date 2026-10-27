import type { QueryKey } from '@tanstack/react-query'

import {
  CATEGORIAS_QUERY_KEY,
  FORNECEDORES_QUERY_KEY,
  MARCAS_QUERY_KEY,
  PRODUTOS_QUERY_KEY,
  TODAS_CATEGORIAS_QUERY_KEY,
  TODAS_MARCAS_QUERY_KEY,
} from '@/features/catalog/catalogoQuery'
import type { Contagem } from '@/features/catalog/textosCatalogo'
import {
  atualizarCategoria,
  cadastrarCategoria,
  excluirCategoria,
  inativarCategoria,
  listarCategorias,
  reativarCategoria,
} from '@/services/categoriaService'
import {
  atualizarMarca,
  cadastrarMarca,
  excluirMarca,
  inativarMarca,
  listarMarcas,
  reativarMarca,
} from '@/services/marcaService'
import type { Categoria, ItemDaArvore, ItemDaArvoreRequest, Marca } from '@/types/catalogo'

/**
 * Cadastros em arvore do catalogo (Categorias e Fabricantes/marcas, spec de
 * Fornecedores e marcas): o mesmo modelo, as mesmas regras e as mesmas telas, trocando os
 * textos e o servico. Os componentes da arvore recebem uma destas configuracoes.
 */
export type TipoDaArvore = 'categoria' | 'marca'

/** Chamadas HTTP do cadastro (o `id` e o UUID publico). */
export interface ServicoDaArvore<T extends ItemDaArvore> {
  listar: () => Promise<T[]>
  cadastrar: (dados: ItemDaArvoreRequest) => Promise<T>
  atualizar: (id: string, dados: ItemDaArvoreRequest) => Promise<T>
  inativar: (id: string) => Promise<T>
  reativar: (id: string) => Promise<T>
  excluir: (id: string) => Promise<void>
}

/**
 * Palavras de que os textos da arvore sao montados. Categoria e marca sao
 * femininas: os textos ("Nova ...", "inativada", "Ela ...") servem as duas.
 */
export interface TextosDaArvore {
  /** "categoria" */
  singular: string
  /** "categorias" */
  plural: string
  /** "subcategoria" */
  sub: string
  /** "subcategorias" */
  subPlural: string
  /** Nome da aba e da lista ("Categorias", "Marcas"). */
  aba: string
  /** Titulo da tela. */
  titulo: string
  /** Subtitulo da tela. */
  descricao: string
  /** Exemplo do campo de nome do item principal ("Ex.: Mercearia"). */
  exemploPrincipal: string
  /** Orientacao da arvore vazia para quem pode criar. */
  orientacaoVazia: string
  /** Onde o item inativo deixa de aparecer ("no cadastro de produtos"). */
  ondeAparece: string
  /** Quem continua com o item inativo ("produtos"). */
  usadoPor: string
  /** Textos do item do primeiro nivel (categoria principal, fabricante). */
  principal: TextosDoPrincipal
  /** Textos do item criado dentro de outro (subcategoria; marca ou linha). */
  filho: TextosDoFilho
}

/** O item criado dentro de outro. */
export interface TextosDoFilho {
  /** Dica do botao do no: "Adicionar subcategoria". */
  acao: string
  /** Nome acessivel do botao do no: "Adicionar subcategoria em Ração". */
  acaoEm: (nomeDoPai: string) => string
  /** Mensagem depois de criar: 'Subcategoria "Filhote" criada em "Ração › Seca".' */
  criado: (nome: string, caminhoDoPai: string) => string
}

/** O primeiro nivel da arvore: "categoria principal" nas categorias, "fabricante" nas marcas. */
export interface TextosDoPrincipal {
  /** Botao e titulo do cartao: "Nova categoria principal". */
  novo: string
  /** Botao de salvar e do estado vazio: "Criar categoria". */
  criar: string
  /** Rotulo do campo: "Nome da nova categoria principal". */
  rotuloDoNome: string
  /** Descricao do cartao de criacao. */
  descricaoDoNovo: string
  /** Destino raiz do "Mover": "Tornar categoria principal". */
  tornar: string
  /** Mensagem depois de mover para a raiz. */
  virou: (nome: string) => string
  /** Opcao sem pai do mini-formulario do seletor: "Nenhuma — criar como categoria principal". */
  semPai: string
}

export interface ConfiguracaoDaArvore<T extends ItemDaArvore> {
  tipo: TipoDaArvore
  textos: TextosDaArvore
  /** Rota da tela do cadastro. */
  rota: string
  /** Prefixo do cache: invalidar atualiza a tela e os seletores. */
  chave: QueryKey
  /** Lista completa (ativas e inativas), compartilhada pela tela e pelos seletores. */
  chaveDaLista: QueryKey
  /** Caches que exibem o caminho do item: renomear ou mover os desatualiza. */
  chavesQueExibemOCaminho: readonly QueryKey[]
  servico: ServicoDaArvore<T>
  /** Ligacoes diretas que impedem a exclusao, na ordem da mensagem. */
  vinculos: (item: T) => Contagem[]
  /** Contagens diretas mostradas na arvore depois dos produtos da subarvore (ex.: fornecedores da marca). */
  contagensExtras: (item: T) => Contagem[]
}

// Chamadas adiadas: o modulo do servico so e lido ao usar (os testes simulam so parte dele).
export const CONFIGURACAO_CATEGORIAS: ConfiguracaoDaArvore<Categoria> = {
  tipo: 'categoria',
  textos: {
    singular: 'categoria',
    plural: 'categorias',
    sub: 'subcategoria',
    subPlural: 'subcategorias',
    aba: 'Categorias',
    titulo: 'Categorias',
    descricao: 'Organize os produtos em categorias e subcategorias, como Ração › Úmida › Sachê.',
    exemploPrincipal: 'Ex.: Mercearia',
    orientacaoVazia: 'Crie a primeira categoria, como Mercearia ou Ração, e organize os produtos por ela.',
    ondeAparece: 'no cadastro de produtos',
    usadoPor: 'produtos',
    principal: {
      novo: 'Nova categoria principal',
      criar: 'Criar categoria',
      rotuloDoNome: 'Nome da nova categoria principal',
      descricaoDoNovo: 'Ela fica no topo da árvore; depois você pode adicionar subcategorias dentro dela.',
      tornar: 'Tornar categoria principal',
      virou: (nome) => `"${nome}" agora é uma categoria principal.`,
      semPai: 'Nenhuma — criar como categoria principal',
    },
    filho: {
      acao: 'Adicionar subcategoria',
      acaoEm: (nome) => `Adicionar subcategoria em ${nome}`,
      criado: (nome, caminho) => `Subcategoria "${nome}" criada em "${caminho}".`,
    },
  },
  rota: '/produtos/categorias',
  chave: CATEGORIAS_QUERY_KEY,
  chaveDaLista: TODAS_CATEGORIAS_QUERY_KEY,
  chavesQueExibemOCaminho: [PRODUTOS_QUERY_KEY],
  servico: {
    listar: () => listarCategorias(),
    cadastrar: (dados) => cadastrarCategoria(dados),
    atualizar: (id, dados) => atualizarCategoria(id, dados),
    inativar: (id) => inativarCategoria(id),
    reativar: (id) => reativarCategoria(id),
    excluir: (id) => excluirCategoria(id),
  },
  vinculos: (categoria) => [
    { quantidade: categoria.quantidadeSubcategorias, singular: 'subcategoria', plural: 'subcategorias' },
    { quantidade: categoria.quantidadeProdutos, singular: 'produto', plural: 'produtos' },
  ],
  contagensExtras: () => [],
}

export const CONFIGURACAO_MARCAS: ConfiguracaoDaArvore<Marca> = {
  tipo: 'marca',
  textos: {
    singular: 'marca',
    plural: 'marcas',
    sub: 'submarca',
    subPlural: 'submarcas',
    aba: 'Marcas',
    titulo: 'Fabricantes e marcas',
    descricao:
      'Cadastre os fabricantes e, dentro deles, as marcas e linhas, como Boehringer › Nexgard › Nexgard Combo.',
    exemploPrincipal: 'Ex.: Boehringer',
    orientacaoVazia: 'Crie o primeiro fabricante, como Boehringer ou Nestlé, e as marcas dentro dele.',
    ondeAparece: 'nos cadastros de produtos e fornecedores',
    usadoPor: 'produtos e fornecedores',
    principal: {
      novo: 'Novo fabricante',
      criar: 'Criar fabricante',
      rotuloDoNome: 'Nome do novo fabricante',
      descricaoDoNovo: 'Ele fica no primeiro nível da árvore; depois você pode adicionar as marcas e linhas dele.',
      tornar: 'Mover para o primeiro nível (fabricante)',
      virou: (nome) => `"${nome}" agora está no primeiro nível (fabricante).`,
      semPai: 'Nenhum — no primeiro nível (fabricante)',
    },
    filho: {
      acao: 'Adicionar marca ou linha',
      acaoEm: (nome) => `Adicionar marca ou linha em ${nome}`,
      criado: (nome, caminho) => `"${nome}" criada dentro de "${caminho}".`,
    },
  },
  rota: '/produtos/marcas',
  chave: MARCAS_QUERY_KEY,
  chaveDaLista: TODAS_MARCAS_QUERY_KEY,
  // O produto e o fornecedor mostram o caminho da marca.
  chavesQueExibemOCaminho: [PRODUTOS_QUERY_KEY, FORNECEDORES_QUERY_KEY],
  servico: {
    listar: () => listarMarcas(),
    cadastrar: (dados) => cadastrarMarca(dados),
    atualizar: (id, dados) => atualizarMarca(id, dados),
    inativar: (id) => inativarMarca(id),
    reativar: (id) => reativarMarca(id),
    excluir: (id) => excluirMarca(id),
  },
  vinculos: (marca) => [
    { quantidade: marca.quantidadeSubmarcas, singular: 'submarca', plural: 'submarcas' },
    { quantidade: marca.quantidadeProdutos, singular: 'produto', plural: 'produtos' },
    { quantidade: marca.quantidadeFornecedores, singular: 'fornecedor', plural: 'fornecedores' },
  ],
  contagensExtras: (marca) => [
    { quantidade: marca.quantidadeFornecedores, singular: 'fornecedor', plural: 'fornecedores' },
  ],
}
