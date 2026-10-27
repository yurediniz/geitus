package com.geitus.app.catalog;

import java.time.LocalDateTime;

import com.geitus.app.company.Empresa;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Codigo de barras de um {@link Produto} (tabela {@code produto_codigos_barras}, V7).
 *
 * <p>Faz parte do cadastro do produto: so e criado, reposicionado ou removido
 * pelo proprio produto ({@link Produto#substituirCodigos}). A empresa e copiada
 * do produto e e imutavel; no banco, a FK composta {@code (empresa_id, produto_id)}
 * garante que o codigo pertence a mesma empresa do produto (DEC-016) e
 * {@code uq_codigo_barras_empresa} garante a unicidade por empresa.
 *
 * <p>O codigo e o formato nao mudam depois de gravados: um codigo mantido na
 * edicao preserva o formato com que foi gravado (inclusive {@code OUTRO} vindo
 * da migracao). Apenas a ordem e atualizada.
 *
 * <p>Fase B3 (V12, docs/modules/produtos.md): o codigo pode ser
 * de uma {@link ProdutoEmbalagem} do produto ({@code embalagem} preenchida) ou
 * da unidade de venda ({@code embalagem} nula). O codigo da embalagem tambem
 * guarda o produto: a FK composta {@code (empresa_id, produto_id, embalagem_id)}
 * garante que a embalagem e do mesmo produto, e {@code uq_codigo_barras_empresa}
 * vale entre unidade e embalagens. Um codigo nunca muda de dono: mover um
 * codigo e apagar a linha antiga e criar outra.
 */
@Entity
@Table(name = "produto_codigos_barras")
public class ProdutoCodigoBarras {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "empresa_id", nullable = false, updatable = false)
    private Empresa empresa;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "produto_id", nullable = false, updatable = false)
    private Produto produto;

    /** Embalagem dona do codigo; {@code null} para os codigos da unidade de venda. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "embalagem_id", updatable = false)
    private ProdutoEmbalagem embalagem;

    @Column(nullable = false, length = 50, updatable = false)
    private String codigo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10, updatable = false)
    private FormatoCodigoBarras formato;

    /** {@code SMALLINT} no banco (V7); mapeado como {@code short} para o {@code ddl-auto: validate}. */
    @Column(nullable = false)
    private short ordem;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    protected ProdutoCodigoBarras() {
        // Construtor exigido pelo JPA.
    }

    /** Codigo ja normalizado e validado; a empresa vem do produto. */
    ProdutoCodigoBarras(Produto produto, String codigo, FormatoCodigoBarras formato, int ordem) {
        this.produto = produto;
        this.empresa = produto.getEmpresa();
        this.codigo = codigo;
        this.formato = formato;
        posicionarEm(ordem);
    }

    /** Codigo de uma embalagem, ja normalizado e validado; produto e empresa vem da embalagem. */
    ProdutoCodigoBarras(ProdutoEmbalagem embalagem, String codigo, FormatoCodigoBarras formato, int ordem) {
        this(embalagem.getProduto(), codigo, formato, ordem);
        this.embalagem = embalagem;
    }

    @PrePersist
    void aoCriar() {
        this.criadoEm = LocalDateTime.now();
    }

    /** Posicao na lista do produto (0 = principal, exibido na listagem). */
    void posicionarEm(int novaOrdem) {
        this.ordem = (short) novaOrdem;
    }

    public Long getId() {
        return id;
    }

    public String getCodigo() {
        return codigo;
    }

    public FormatoCodigoBarras getFormato() {
        return formato;
    }

    public int getOrdem() {
        return ordem;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }
}
