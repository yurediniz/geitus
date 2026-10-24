package com.geitus.app.catalog.imagem;

import java.time.LocalDateTime;
import java.util.UUID;

import org.springframework.data.domain.Persistable;

import jakarta.persistence.Basic;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

/**
 * Imagem de um produto (tabela {@code produto_imagens}, V15;
 * docs/modules/produtos-imagem.md, 3), uma por produto.
 *
 * <p>Fica fora da entidade {@code Produto} de proposito: nenhuma consulta de
 * produto carrega os bytes. A PK e o id interno do produto (sem relacao JPA:
 * o catalogo so precisa do id) e a empresa e copiada dele; no banco, as FKs
 * compostas {@code (empresa_id, produto_id)} e {@code (empresa_id, usuario_id)}
 * garantem a mesma empresa (DEC-016) e a cascata na exclusao do produto.
 *
 * <p>Cada envio troca a {@code versao}, que entra na URL assinada: a URL
 * antiga deixa de achar a imagem e o navegador nunca reaproveita um cache
 * velho. Os bytes sao {@code LAZY}, mas sem enhancement do bytecode o
 * Hibernate os carrega com a entidade: as leituras usam as projecoes do
 * {@link ImagemDoProdutoRepository}, que nunca trazem os bytes junto do resumo.
 *
 * <p>A PK e atribuida (o id do produto), por isso a entidade diz ao Spring Data
 * quando e nova ({@link Persistable}): a primeira gravacao vira um
 * {@code INSERT} direto, sem o {@code SELECT} do {@code merge}.
 */
@Entity
@Table(name = "produto_imagens")
public class ImagemDoProduto implements Persistable<Long> {

    @Id
    @Column(name = "produto_id")
    private Long produtoId;

    @Column(name = "empresa_id", nullable = false, updatable = false)
    private Long empresaId;

    @Column(nullable = false, unique = true)
    private UUID versao;

    @Convert(converter = TipoDeImagemNoBanco.class)
    @Column(nullable = false, length = 20)
    private TipoDeImagem tipo;

    @Basic(fetch = FetchType.LAZY)
    @Column(nullable = false)
    private byte[] grande;

    @Column(name = "grande_largura", nullable = false)
    private short grandeLargura;

    @Column(name = "grande_altura", nullable = false)
    private short grandeAltura;

    @Basic(fetch = FetchType.LAZY)
    @Column(nullable = false)
    private byte[] miniatura;

    @Column(name = "miniatura_largura", nullable = false)
    private short miniaturaLargura;

    @Column(name = "miniatura_altura", nullable = false)
    private short miniaturaAltura;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "atualizado_em", nullable = false)
    private LocalDateTime atualizadoEm;

    @Transient
    private boolean nova = true;

    protected ImagemDoProduto() {
        // Construtor exigido pelo JPA.
    }

    /** Primeira imagem do produto (ja persistido), enviada por {@code usuarioId} em {@code agora}. */
    public ImagemDoProduto(Long empresaId, Long produtoId, ImagemConferida imagem, Long usuarioId,
            LocalDateTime agora) {
        this.empresaId = empresaId;
        this.produtoId = produtoId;
        substituir(imagem, usuarioId, agora);
    }

    /** Troca as duas versoes e gera uma {@code versao} nova (a URL muda). */
    public void substituir(ImagemConferida imagem, Long usuarioId, LocalDateTime agora) {
        this.versao = UUID.randomUUID();
        this.tipo = imagem.tipo();
        this.grande = imagem.grande().bytes();
        this.grandeLargura = (short) imagem.grande().largura();
        this.grandeAltura = (short) imagem.grande().altura();
        this.miniatura = imagem.miniatura().bytes();
        this.miniaturaLargura = (short) imagem.miniatura().largura();
        this.miniaturaAltura = (short) imagem.miniatura().altura();
        this.usuarioId = usuarioId;
        this.atualizadoEm = agora;
    }

    /** O resumo sem os bytes, com o UUID publico do produto para as URLs. */
    public ResumoDaImagem resumo(UUID produtoUuid) {
        return new ResumoDaImagem(produtoId, produtoUuid, versao, tipo, grandeLargura, grandeAltura, atualizadoEm);
    }

    @PostLoad
    @PostPersist
    void marcarComoGravada() {
        this.nova = false;
    }

    @Override
    public Long getId() {
        return produtoId;
    }

    @Override
    public boolean isNew() {
        return nova;
    }

    public Long getProdutoId() {
        return produtoId;
    }

    public Long getEmpresaId() {
        return empresaId;
    }

    public UUID getVersao() {
        return versao;
    }

    public TipoDeImagem getTipo() {
        return tipo;
    }

    /** Dimensoes da versao grande, as que a resposta do produto informa. */
    public int getGrandeLargura() {
        return grandeLargura;
    }

    public int getGrandeAltura() {
        return grandeAltura;
    }

    public LocalDateTime getAtualizadoEm() {
        return atualizadoEm;
    }
}
