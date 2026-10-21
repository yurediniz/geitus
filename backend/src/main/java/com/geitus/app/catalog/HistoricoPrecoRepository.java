package com.geitus.app.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

/** Acesso ao historico de precos do produto (tabela so de insercao, V8). */
public interface HistoricoPrecoRepository extends JpaRepository<HistoricoPreco, Long> {
}
