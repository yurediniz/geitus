package com.geitus.app.sales;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;

import com.geitus.app.cashier.IntegracaoDoCaixa;

/**
 * Base dos testes de integracao do PDV: a mesma do caixa (container unico,
 * contexto reaproveitado entre as classes do PDV, MockMvc e sem
 * {@code @Transactional}), com o {@link CenarioDoPdv}. Requer Docker.
 */
@Import(CenarioDoPdv.class)
public abstract class IntegracaoDoPdv extends IntegracaoDoCaixa {

    @Autowired
    protected CenarioDoPdv pdv;
}
