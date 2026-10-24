import { useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { Info, Loader2 } from 'lucide-react'

import { NativeSelect } from '@/components/ui/native-select'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import type { FornecedorFormValues } from '@/features/suppliers/fornecedorFormulario'
import { CampoComMascara, CampoDeTexto, SecaoDoFornecedor } from '@/features/suppliers/secoes/CamposDoFornecedor'
import { UFS, apenasDigitos, mascararCep } from '@/lib/documentos'
import { buscarCep } from '@/services/cepService'

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
    clearErrors,
    formState: { errors },
  } = useFormContext<FornecedorFormValues>()
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const cepBuscadoRef = useRef<string | null>(null)

  const aoMudarCep = async (valor: string) => {
    const digitos = apenasDigitos(valor)
    setAviso(null)
    if (digitos.length !== 8 || digitos === cepBuscadoRef.current) {
      return
    }
    cepBuscadoRef.current = digitos
    setBuscando(true)
    try {
      const endereco = await buscarCep(digitos)
      if (endereco) {
        const opcoes = { shouldDirty: true, shouldValidate: true }
        setValue('logradouro', endereco.logradouro, opcoes)
        setValue('bairro', endereco.bairro, opcoes)
        setValue('municipio', endereco.municipio, opcoes)
        setValue('uf', endereco.uf, opcoes)
        clearErrors(['logradouro', 'bairro', 'municipio', 'uf'])
      } else {
        setAviso('Não encontramos esse CEP. Preencha o endereço manualmente.')
      }
    } finally {
      setBuscando(false)
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
                <span role="status" className="inline-flex items-center gap-1">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  {aviso}
                </span>
              ) : (
                'Com o CEP, o endereço é preenchido sozinho.'
              )
            }
            desabilitado={desabilitado}
            aoAlterar={aoAlterarCampo}
            aoMudarValor={(formatado) => void aoMudarCep(formatado)}
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
