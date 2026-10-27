'use client'

import * as React from 'react'
import * as LabelPrimitive from 'radix-ui/label'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const labelVariants = cva('', {
  variants: {
    variant: {
      default: '',
      settings: 'text-xs text-muted-foreground'
    }
  },
  defaultVariants: { variant: 'default' }
})

/** `sm` is the sidebar's field-label treatment, named as `SelectTrigger` names the same density. */
function Label({
  className,
  size = 'default',
  variant,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { size?: 'default' | 'sm' } & VariantProps<
    typeof labelVariants
  >) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      data-size={size}
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        'data-[size=sm]:text-[11px] data-[size=sm]:text-muted-foreground',
        labelVariants({ variant }),
        className
      )}
      {...props}
    />
  )
}

export { Label }
