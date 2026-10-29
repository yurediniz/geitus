package com.geitus.app.inventory;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geitus.app.iam.ResolvedorDoUsuarioAutenticado;
import com.geitus.app.inventory.ConsultaDasMovimentacoes.PaginaDeMovimentacoes;
import com.geitus.app.inventory.dto.MovimentacaoDeEstoqueResponse;
import com.geitus.app.shared.paginacao.PaginaResponse;

/**
 * Movimentacoes de todos os produtos da empresa (docs/modules/estoque.md, regras
 * 26 e 27). So leitura, para qualquer usuario autenticado; a empresa vem sempre
 * do usuario (DEC-016). Produto ou usuario de outra empresa no filtro nao e 404:
 * a lista volta vazia.
 */
@Service
public class MovimentacoesDeEstoqueService {

    private final ResolvedorDoUsuarioAutenticado resolvedor;
    private final ConsultaDasMovimentacoes consulta;

    public MovimentacoesDeEstoqueService(ResolvedorDoUsuarioAutenticado resolvedor,
            ConsultaDasMovimentacoes consulta) {
        this.resolvedor = resolvedor;
        this.consulta = consulta;
    }

    @Transactional(readOnly = true)
    public PaginaResponse<MovimentacaoDeEstoqueResponse> listarParaUsuario(Long idUsuario,
            ParametrosDasMovimentacoes parametros) {
        Long empresaId = resolvedor.resolver(idUsuario).empresaId();
        PaginaDeMovimentacoes pagina = consulta.buscar(empresaId, parametros);
        return new PaginaResponse<>(pagina.linhas(), parametros.pagina(), parametros.tamanho(), pagina.total());
    }
}
