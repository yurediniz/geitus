import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `<select>` nativo com o visual do `Input` (bordas, foco e `aria-invalid`).
 * Nativo de proposito: teclado, leitor de tela e mobile funcionam sem esforco
 * extra; aceita `ref` (React 19) para o `register` do React Hook Form.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { NativeSelect }
