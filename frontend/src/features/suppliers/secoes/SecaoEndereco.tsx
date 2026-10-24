import { useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { Info, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { NativeSelect } from '@/components/ui/native-select'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import type { FornecedorFormValues } from '@/features/suppliers/fornecedorFormulario'
import { CampoComMascara, CampoDeTexto, SecaoDoFornecedor } from '@/features/suppliers/secoes/CamposDoFornecedor'
import { UFS, apenasDigitos, mascararCep } from '@/lib/documentos'
import { consultarCep } from '@/services/cepService'

const MENSAGEM_CEP_NAO_ENCONTRADO = 'Não encontramos esse CEP. Preencha o endereço manualmente.'
const MENSAGEM_FALHA_NO_CEP = 'Não foi possível buscar o CEP agora. Tente de novo.'

/** Campos que a busca de CEP preenche (o numero e o complemento ficam com o usuario). */
const CAMPOS_DO_CEP = ['logradouro', 'bairro', 'municipio', 'uf'] as const

interface SecaoEnderecoProps {
  desabilitado: boolean
  aoAlterarCampo: () => void
}

/**
 * Endereco (spec B5 §8.3, secao 2), todo opcional. Ao completar os 8 digitos
 * do CEP, a busca de CEP de Empresa preenche logradouro, bairro, municipio e
 * UF; se o CEP nao for encontrado, o endereco e digitado a mao.
 */
export function SecaoEndereco({ desabilitado, aoAlterarCampo }: SecaoEnderecoProps) {
  const {
    register,
    setValue,
    getValues,
    clearErrors,
    formState: { errors },
  } = useFormContext<FornecedorFormValues>()
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  // Na falha da consulta, o botao "Tentar de novo" repete a busca do mesmo CEP.
  const [falhou, setFalhou] = useState(false)
  // Ultimo CEP buscado com resposta (nao repete a busca a cada tecla) e o CEP que esta no campo agora.
  const cepBuscadoRef = useRef<string | null>(null)
  const cepAtualRef = useRef<string>('')

  const buscar = async (digitos: string) => {
    cepBuscadoRef.current = digitos
    setFalhou(false)
    setBuscando(true)
    const resultado = await consultarCep(digitos)
    // Resposta atrasada de um CEP que ja nao e o do campo: ignorada.
    if (cepAtualRef.current !== digitos) {
      return
    }
    setBuscando(false)
    if (resultado.tipo === 'encontrado') {
      const opcoes = { shouldDirty: true, shouldValidate: true }
      for (const campo of CAMPOS_DO_CEP) {
        // CEP generico (de cidade) vem sem logradouro e bairro: o que ja estava preenchido fica.
        const valor = resultado.endereco[campo]
        if (valor.trim() !== '' || getValues(campo).trim() === '') {
          setValue(campo, valor, opcoes)
        }
      }
      clearErrors([...CAMPOS_DO_CEP])
    } else if (resultado.tipo === 'falha') {
      cepBuscadoRef.current = null
      setFalhou(true)
      setAviso(MENSAGEM_FALHA_NO_CEP)
    } else {
      setAviso(MENSAGEM_CEP_NAO_ENCONTRADO)
    }
  }

  const aoMudarCep = (valor: string) => {
    const digitos = apenasDigitos(valor)
    cepAtualRef.current = digitos
    setAviso(null)
    setFalhou(false)
    if (digitos.length !== 8) {
      setBuscando(false)
      return
    }
    if (digitos !== cepBuscadoRef.current) {
      void buscar(digitos)
    }
  }

  return (
    <SecaoDoFornecedor id="secao-endereco" titulo="Endereço">
      <div className="grid gap-4 md:grid-cols-6">
        <div className="md:col-span-2">
          <CampoComMascara
            nome="cep"
            rotulo="CEP (opcional)"
            placeholder="00000-000"
            mascara={mascararCep}
            autoComplete="postal-code"
            erro={errors.cep?.message}
            ajuda={
              buscando ? (
                <span role="status" className="inline-flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Buscando endereço...
                </span>
              ) : aviso ? (
                <span role="status" className="inline-flex flex-wrap items-center gap-1">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  {aviso}
                  {falhou && !desabilitado && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs pointer-coarse:min-h-11"
                      onClick={() => void buscar(cepAtualRef.current)}
                    >
                      Tentar de novo
                    </Button>
                  )}
                </span>
              ) : (
                'Com o CEP, o endereço é preenchido sozinho.'
              )
            }
            desabilitado={desabilitado}
            aoAlterar={aoAlterarCampo}
            aoMudarValor={aoMudarCep}
          />
        </div>
        <div className="md:col-span-4">
          <CampoDeTexto
            nome="logradouro"
            rotulo="Logradouro (opcional)"
            maxLength={180}
            autoComplete="address-line1"
            erro={errors.logradouro?.message}
            desabilitado={desabilitado}
            aoAlterar={aoAlterarCampo}
          />
        </div>
        <div className="md:col-span-2">
          <CampoDeTexto
            nome="numeroEndereco"
            rotulo="Número (opcional)"
            maxLength={20}
            erro={errors.numeroEndereco?.message}
            desabilitado={desabilitado}
            aoAlterar={aoAlterarCampo}
          />
        </div>
        <div className="md:col-span-4">
          <CampoDeTexto
            nome="complemento"
            rotulo="Complemento (opcional)"
            maxLength={120}
            erro={errors.complemento?.message}
            desabilitado={desabilitado}
            aoAlterar={aoAlterarCampo}
          />
        </div>
        <div className="md:col-span-2">
          <CampoDeTexto
            nome="bairro"
            rotulo="Bairro (opcional)"
            maxLength={120}
            erro={errors.bairro?.message}
            desabilitado={desabilitado}
            aoAlterar={aoAlterarCampo}
          />
        </div>
        <div className="md:col-span-3">
          <CampoDeTexto
            nome="municipio"
            rotulo="Município (opcional)"
            maxLength={120}
            autoComplete="address-level2"
            erro={errors.municipio?.message}
            desabilitado={desabilitado}
            aoAlterar={aoAlterarCampo}
          />
        </div>
        <div className="space-y-1.5 md:col-span-1">
          <label htmlFor="uf" className="text-sm font-medium">
            UF
          </label>
          <NativeSelect
            id="uf"
            disabled={desabilitado}
            aria-invalid={errors.uf ? true : undefined}
            aria-describedby={errors.uf ? 'uf-erro' : undefined}
            {...register('uf', { onChange: aoAlterarCampo })}
          >
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </NativeSelect>
          <ErroDoCampo id="uf-erro" mensagem={errors.uf?.message} />
        </div>
      </div>
    </SecaoDoFornecedor>
  )
}
