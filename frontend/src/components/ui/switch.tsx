import * as React from "react"

import { cn } from "@/lib/utils"

export interface SwitchProps extends Omit<React.ComponentProps<"button">, "type" | "role" | "onChange" | "value"> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

/**
 * Interruptor liga/desliga no visual do shadcn/ui, sem dependencia: um
 * `button` com `role="switch"` e `aria-checked` (Espaco e Enter alternam, e o
 * `label` associado tambem). O alvo de toque fica no rotulo; o trilho mantem o
 * tamanho padrao.
 */
function Switch({ checked, onCheckedChange, onClick, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) {
          onCheckedChange(!checked)
        }
      }}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-colors outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5"
        data-state={checked ? "checked" : "unchecked"}
      />
    </button>
  )
}

export { Switch }
