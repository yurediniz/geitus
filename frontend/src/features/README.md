# features/

Cada módulo do Geitus tem sua própria pasta aqui, reunindo as páginas,
componentes e testes específicos daquele domínio:

- `auth/` — tela de login.
- `company/` — cadastro da empresa (`/empresa`).
- `usuarios/` — gestão de usuários (`/usuarios`) e troca de senha.
- `products/` — cadastro de produtos (`/produtos`) e seletores de categoria.
- `catalog/` — categorias e marcas em árvore (`/produtos/categorias`, `/produtos/marcas`), unidades de medida (`/produtos/unidades`) e a etiqueta de balança (`/configuracoes/balanca`).
- Navegação: seções do menu lateral em `components/layout/Navegacao.tsx` (DEC-049).
- `customers/` — cadastro de clientes (`/clientes`).

Os próximos módulos (ex.: `pdv/`, `cash-register/`, `finance/`)
ganham a sua pasta quando entrarem em desenvolvimento, conforme o CLAUDE.md.
