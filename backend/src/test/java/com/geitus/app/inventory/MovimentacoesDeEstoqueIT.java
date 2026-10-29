package com.geitus.app.inventory;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.geitus.app.cashier.CenarioDeCaixa;
import com.geitus.app.sales.CenarioDoPdv.EmpresaDoPdv;
import com.geitus.app.sales.CenarioDoPdv.NovoProduto;
import com.geitus.app.sales.IntegracaoDoPdv;
import com.geitus.app.supplier.FornecedorService;
import com.geitus.app.supplier.dto.FornecedorRequest;
import com.jayway.jsonpath.JsonPath;

/**
 * {@code GET /api/estoque/movimentos} de ponta a ponta, com um PostgreSQL real
 * (docs/modules/estoque.md, regras 26 e 27): autenticacao, leitura pelo
 * OPERADOR, campos da linha (produto, venda, fornecedor), cada filtro, os
 * limites do periodo, isolamento por empresa e parametros invalidos. Requer
 * Docker.
 */
class MovimentacoesDeEstoqueIT extends IntegracaoDoPdv {

    private static final String MOVIMENTOS = "/api/estoque/movimentos";

    @Autowired
    private FornecedorService fornecedorService;

    private EmpresaDoPdv empresa;

    @BeforeEach
    void criarEmpresa() {
        empresa = pdv.novaEmpresa();
    }

    @Test
    void semTokenDa401() throws Exception {
        mockMvc.perform(get(MOVIMENTOS)).andExpect(status().isUnauthorized());
    }

    @Test
    void operadorLeAVendaEOEstoqueInicialDoMaisRecenteAoMaisAntigo() throws Exception {
        UUID racao = pdv.produto(empresa, NovoProduto.de("Ração X 1kg", "UN", "10.00").comEstoque("10")).id();
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        String venda = vender(empresa.operadora(), item(racao, "2"), pagamento("DINHEIRO", "20.00"), "20.00");

        listar(empresa.operadora(), "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(2))
                .andExpect(jsonPath("$.tamanho").value(25))
                .andExpect(jsonPath("$.itens[0].tipo").value("SAIDA"))
                .andExpect(jsonPath("$.itens[0].motivo").value("VENDA"))
                .andExpect(jsonPath("$.itens[0].origem").value("VENDA"))
                .andExpect(jsonPath("$.itens[0].quantidade").value(-2.0))
                .andExpect(jsonPath("$.itens[0].saldoAnterior").value(10.0))
                .andExpect(jsonPath("$.itens[0].saldoNovo").value(8.0))
                .andExpect(jsonPath("$.itens[0].usuarioNome").value(CenarioDeCaixa.NOME_DA_OPERADORA))
                .andExpect(jsonPath("$.itens[0].produto.id").value(racao.toString()))
                .andExpect(jsonPath("$.itens[0].produto.nome").value("Ração X 1kg"))
                .andExpect(jsonPath("$.itens[0].produto.numero").value(1))
                .andExpect(jsonPath("$.itens[0].produto.unidade.sigla").value("UN"))
                .andExpect(jsonPath("$.itens[0].produto.unidade.fracionada").value(false))
                .andExpect(jsonPath("$.itens[0].venda.id").value(venda))
                .andExpect(jsonPath("$.itens[0].venda.numero").value(1))
                .andExpect(jsonPath("$.itens[0].empresaId").doesNotExist())
                .andExpect(jsonPath("$.itens[1].motivo").value("ESTOQUE_INICIAL"))
                .andExpect(jsonPath("$.itens[1].venda").value(nullValue()))
                .andExpect(jsonPath("$.itens[1].fornecedor").value(nullValue()))
                .andExpect(jsonPath("$.itens[1].embalagem").value(nullValue()));
    }

    @Test
    void entradaPorCompraTrazCustoEFornecedor() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "8.00")).id();
        UUID central = fornecedorService.cadastrarParaUsuario(empresa.admin(), new FornecedorRequest(null, null,
                "Distribuidora Central", null, null, null, null, null, null, null, null, null, null, null, null, null,
                null)).id();
        ajustar(arroz, "{\"tipo\":\"ENTRADA\",\"quantidade\":5,\"motivo\":\"COMPRA\",\"custo\":4.50,"
                + "\"fornecedorId\":\"" + central + "\",\"observacao\":\"NF 123\"");

        listar(empresa.admin(), "")
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].motivo").value("COMPRA"))
                .andExpect(jsonPath("$.itens[0].observacao").value("NF 123"))
                .andExpect(jsonPath("$.itens[0].custoInformado").value(4.5))
                .andExpect(jsonPath("$.itens[0].fornecedor.id").value(central.toString()))
                .andExpect(jsonPath("$.itens[0].fornecedor.nome").value("Distribuidora Central"))
                .andExpect(jsonPath("$.itens[0].usuarioNome").value(CenarioDeCaixa.NOME_DO_ADMIN));
    }

    @Test
    void filtraPorProdutoTipoMotivoEUsuario() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "8.00").comEstoque("10")).id();
        UUID feijao = pdv.produto(empresa, NovoProduto.de("Feijão", "UN", "9.00").comEstoque("10")).id();
        ajustar(feijao, "{\"tipo\":\"SAIDA\",\"quantidade\":1,\"motivo\":\"PERDA_AVARIA\"");
        abrirCaixa(empresa.operadora(), empresa.ponto(), "100.00");
        vender(empresa.operadora(), item(arroz, "1"), pagamento("PIX", "8.00"), "8.00");

        listar(empresa.admin(), "produto=" + arroz).andExpect(jsonPath("$.totalItens").value(2));
        listar(empresa.admin(), "tipo=SAIDA").andExpect(jsonPath("$.totalItens").value(2));
        listar(empresa.admin(), "tipo=SAIDA&motivo=PERDA_AVARIA")
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].produto.nome").value("Feijão"));
        listar(empresa.admin(), "motivo=ESTOQUE_INICIAL").andExpect(jsonPath("$.totalItens").value(2));
        // Motivo de outro tipo nao e erro: a lista volta vazia.
        listar(empresa.admin(), "tipo=SAIDA&motivo=COMPRA").andExpect(jsonPath("$.totalItens").value(0));
        listar(empresa.admin(), "usuario=" + empresa.operadora())
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].motivo").value("VENDA"));
    }

    @Test
    void periodoIncluiODiaInteiroDasDuasDatas() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "8.00")).id();
        LocalDate dia = LocalDate.now().minusDays(40);
        String primeira = ajustar(arroz, "{\"tipo\":\"ENTRADA\",\"quantidade\":1,\"motivo\":\"DEVOLUCAO_CLIENTE\"");
        String ultima = ajustar(arroz, "{\"tipo\":\"ENTRADA\",\"quantidade\":1,\"motivo\":\"DEVOLUCAO_CLIENTE\"");
        String seguinte = ajustar(arroz, "{\"tipo\":\"ENTRADA\",\"quantidade\":1,\"motivo\":\"DEVOLUCAO_CLIENTE\"");
        String anterior = ajustar(arroz, "{\"tipo\":\"ENTRADA\",\"quantidade\":1,\"motivo\":\"DEVOLUCAO_CLIENTE\"");
        carimbar(primeira, dia.atStartOfDay());
        carimbar(ultima, dia.plusDays(1).atTime(23, 59, 59));
        carimbar(seguinte, dia.plusDays(2).atStartOfDay());
        carimbar(anterior, dia.minusDays(1).atTime(23, 59, 59));

        listar(empresa.admin(), "de=" + dia + "&ate=" + dia.plusDays(1))
                .andExpect(jsonPath("$.totalItens").value(2))
                .andExpect(jsonPath("$.itens[0].id").value(ultima))
                .andExpect(jsonPath("$.itens[1].id").value(primeira));
        // O padrao sao os ultimos 30 dias: nada de 40 dias atras.
        listar(empresa.admin(), "").andExpect(jsonPath("$.totalItens").value(0));
    }

    @Test
    void paginaDesempataPeloIdEAlemDoFimVemVaziaComOTotal() throws Exception {
        UUID arroz = pdv.produto(empresa, NovoProduto.de("Arroz", "UN", "8.00")).id();
        String primeiro = ajustar(arroz, "{\"tipo\":\"ENTRADA\",\"quantidade\":1,\"motivo\":\"DEVOLUCAO_CLIENTE\"");
        String segundo = ajustar(arroz, "{\"tipo\":\"ENTRADA\",\"quantidade\":1,\"motivo\":\"DEVOLUCAO_CLIENTE\"");
        LocalDateTime mesmoInstante = LocalDate.now().atTime(8, 0);
        carimbar(primeiro, mesmoInstante);
        carimbar(segundo, mesmoInstante);

        // Mesmo carimbo: o gravado depois (id maior) vem primeiro.
        listar(empresa.admin(), "tamanho=1")
                .andExpect(jsonPath("$.totalItens").value(2))
                .andExpect(jsonPath("$.itens[0].id").value(segundo));
        listar(empresa.admin(), "tamanho=1&pagina=1")
                .andExpect(jsonPath("$.pagina").value(1))
                .andExpect(jsonPath("$.itens[0].id").value(primeiro));
        listar(empresa.admin(), "tamanho=1&pagina=2")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(2))
                .andExpect(jsonPath("$.itens").isEmpty());
    }

    @Test
    void outraEmpresaNaoApareceEFiltroDelaDaListaVazia() throws Exception {
        EmpresaDoPdv outra = pdv.novaEmpresa();
        UUID daOutra = pdv.produto(outra, NovoProduto.de("Da outra", "UN", "1.00").comEstoque("3")).id();
        pdv.produto(empresa, NovoProduto.de("Minha", "UN", "1.00").comEstoque("3"));

        listar(empresa.admin(), "")
                .andExpect(jsonPath("$.totalItens").value(1))
                .andExpect(jsonPath("$.itens[0].produto.nome").value("Minha"));
        listar(empresa.admin(), "produto=" + daOutra).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(0));
        listar(empresa.admin(), "usuario=" + outra.admin()).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItens").value(0));
    }

    @Test
    void parametrosInvalidosDao400ComOCampo() throws Exception {
        LocalDate hoje = LocalDate.now();
        campoInvalido("de=" + hoje + "&ate=" + hoje.minusDays(1), "de");
        campoInvalido("de=" + hoje.minusDays(366) + "&ate=" + hoje, "ate");
        campoInvalido("de=27/10/2026", "de");
        campoInvalido("ate=ontem", "ate");
        campoInvalido("tipo=entrada", "tipo");
        campoInvalido("motivo=QUEBRA", "motivo");
        listar(empresa.admin(), "tamanho=101").andExpect(status().isBadRequest());
        // Um ano inteiro (366 dias com as duas datas) ainda vale.
        listar(empresa.admin(), "de=" + hoje.minusDays(365) + "&ate=" + hoje).andExpect(status().isOk());
    }

    private ResultActions listar(Long usuario, String consulta) throws Exception {
        return mockMvc.perform(get(MOVIMENTOS + (consulta.isEmpty() ? "" : "?" + consulta))
                .header("Authorization", cenario.token(usuario)));
    }

    private void campoInvalido(String consulta, String campo) throws Exception {
        listar(empresa.admin(), consulta)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.campos[0].campo").value(campo));
    }

    /** Ajuste pelo ADMIN; {@code inicio} e o JSON sem a chave e sem o fecho. Devolve o UUID do movimento. */
    private String ajustar(UUID produto, String inicio) throws Exception {
        String corpo = mockMvc.perform(post("/api/produtos/" + produto + "/estoque/ajustes")
                        .header("Authorization", cenario.token(empresa.admin()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(inicio + ",\"chave\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(corpo, "$.id");
    }

    /** Muda a hora do movimento manual (so os de venda sao imutaveis no banco). */
    private void carimbar(String movimento, LocalDateTime quando) {
        jdbcTemplate.update("UPDATE movimentos_estoque SET criado_em = ? WHERE uuid = ?", quando,
                UUID.fromString(movimento));
    }
}
