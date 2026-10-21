import * as React from "react"

import { cn } from "@/lib/utils"

export interface SwitchProps extends Omit<React.ComponentProps<"button">, "type" | "role" | "onChange" | "value"> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/**
 * Interruptor liga/desliga no visual do shadcn/ui, sem dependencia: um
 * `button` com `role="switch"` e `aria-checked`. Clique, rotulo associado,
 * Espaco e Enter alternam (Ctrl/Cmd+Enter segue para o formulario).
 * - Alvo de toque de 44px: um pseudo-elemento invisivel amplia a area clicavel
 *   alem do trilho.
 * - Contraste de 3:1 nos dois estados: desligado tem borda e botao em
 *   `muted-foreground`; ligado, trilho ambar com borda `accent-foreground`.
 */
function Switch({ checked, onCheckedChange, onClick, onKeyDown, onKeyUp, className, disabled, ...props }: SwitchProps) {
  const alternar = () => {
    if (!disabled) {
      onCheckedChange(!checked)
    }
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          alternar()
        }
      }}
      // Espaco e Enter tratados aqui (com o clique nativo cancelado) para alternar uma vez so em todo navegador.
      onKeyDown={(event) => {
        onKeyDown?.(event)
        const atalho = event.ctrlKey || event.metaKey || event.altKey
        if (!event.defaultPrevented && !atalho && (event.key === " " || event.key === "Enter")) {
          event.preventDefault()
          alternar()
        }
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event)
        // Alguns navegadores ativam o botao no keyup do Espaco.
        if (event.key === " ") {
          event.preventDefault()
        }
      }}
      className={cn(
        "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none",
        "after:absolute after:-inset-3 after:content-['']",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-accent-foreground data-[state=checked]:bg-primary",
        "data-[state=unchecked]:border-muted-foreground data-[state=unchecked]:bg-background",
        className
      )}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        data-state={checked ? "checked" : "unchecked"}
        className="pointer-events-none block size-4 rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-background data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-muted-foreground"
      />
    </button>
  )
}

export { Switch }
