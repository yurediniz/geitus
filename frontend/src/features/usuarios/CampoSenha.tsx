import type { UseFormRegisterReturn } from 'react-hook-form'

import { Input } from '@/components/ui/input'

interface CampoSenhaProps {
  id: string
  label: string
  erro?: string
  disabled?: boolean
  placeholder?: string
  autoComplete?: string
  inputProps: UseFormRegisterReturn
}

/**
 * Campo de senha reutilizavel pelos formularios de senha (redefinicao pelo
 * ADMIN e troca da propria senha). Mascara o valor e liga o erro ao input via
 * aria-describedby para acessibilidade.
 */
export function CampoSenha({
  id,
  label,
  erro,
  disabled,
  placeholder,
  autoComplete = 'new-password',
  inputProps,
}: CampoSenhaProps) {
  const erroId = `${id}-erro`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        {...inputProps}
      />
      {erro && (
        <p id={erroId} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}
