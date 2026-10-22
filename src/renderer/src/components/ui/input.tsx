import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { ImeInput } from '@/lib/ime-text-field'

const inputVariants = cva('', {
  variants: {
    density: {
      default: '',
      compact: 'h-7 border-border bg-input/50 px-2 text-xs shadow-none md:text-xs'
    }
  },
  defaultVariants: { density: 'default' }
})

/**
 * `size="sm"` is the 32px density `SelectTrigger` already spells that way, at the matching text
 * ramp. A number keeps the native character-count attribute expressible: it is forwarded to the
 * element and leaves `data-size` at `default`.
 */
const Input = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'size'> & { size?: number | 'default' | 'sm' } & VariantProps<
      typeof inputVariants
    >
>(({ className, type, size = 'default', density, ...props }, ref) => {
  return (
    <ImeInput
      ref={ref}
      type={type}
      data-slot="input"
      data-size={size === 'sm' ? 'sm' : 'default'}
      size={typeof size === 'number' ? size : undefined}
      className={cn(
        'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        // Why the attribute selector, not a conditional class: it outranks any unmodified base
        // utility on specificity, so adding one later cannot silently unstyle this density.
        'data-[size=sm]:h-8 data-[size=sm]:text-xs',
        inputVariants({ density }),
        className
      )}
      {...props}
    />
  )
})

Input.displayName = 'Input'

export { Input }
