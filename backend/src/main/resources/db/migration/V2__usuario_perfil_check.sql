-- Restringe o perfil do usuario a allow-list {ADMIN, OPERADOR} (RBAC basico).
--
-- Migration aditiva sobre o baseline (V1): apenas adiciona uma CHECK constraint.
-- Os dados atuais (o admin do bootstrap, perfil 'ADMIN') sao compativeis, entao
-- a aplicacao da constraint nao quebra o baseline.
--
-- A validacao equivalente vive tambem na aplicacao (enum com.geitus.app.iam.Perfil).

ALTER TABLE usuario
    ADD CONSTRAINT ck_usuario_perfil CHECK (perfil IN ('ADMIN', 'OPERADOR'));
