package com.geitus.app.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Properties;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.FileSystemResource;

/**
 * Le o {@code application.yml} PRINCIPAL direto do disco: no classpath dos
 * testes ele e substituido pelo de teste, entao os ITs nao exercitam estes
 * valores de producao (Fase F, docs/modules/produtos-imagem.md, 4.1 e 6).
 */
class ConfiguracaoDoApplicationYmlTest {

    private static final String APPLICATION_YML_PRINCIPAL = "src/main/resources/application.yml";

    @Test
    void limitesDoMultipartESegredoDasImagens() {
        Properties propriedades = propriedades();

        assertThat(propriedades.getProperty("spring.servlet.multipart.max-file-size")).isEqualTo("512KB");
        assertThat(propriedades.getProperty("spring.servlet.multipart.max-request-size")).isEqualTo("1MB");
        assertThat(propriedades.getProperty("geitus.imagens.segredo")).isEqualTo("${GEITUS_IMAGEM_SEGREDO:}");
    }

    /** A senha do banco nao tem valor padrao: sem POSTGRES_PASSWORD a aplicacao nao sobe. */
    @Test
    void senhaDoBancoSemValorPadrao() {
        assertThat(propriedades().getProperty("spring.datasource.password")).isEqualTo("${POSTGRES_PASSWORD}");
    }

    private static Properties propriedades() {
        FileSystemResource arquivo = new FileSystemResource(APPLICATION_YML_PRINCIPAL);
        assertThat(arquivo.exists()).as("rodar a partir de backend/").isTrue();
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(arquivo);
        return yaml.getObject();
    }
}
