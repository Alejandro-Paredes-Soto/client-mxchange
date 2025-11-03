import * as React from "react"
import { cn } from "@/lib/utils"

const NumberInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { 
    allowNegative?: boolean;
    decimals?: number;
  }
>(({ className, allowNegative = false, decimals = undefined, ...props }, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Allow empty value
    if (value === '') {
      e.target.value = '';
      props.onChange?.(e);
      return;
    }

    // Remove non-numeric characters except minus and decimal point
    let filtered = value.replace(/[^\d.-]/g, '');

    // Handle minus sign
    if (!allowNegative && filtered.includes('-')) {
      filtered = filtered.replace(/-/g, '');
    } else if (allowNegative && filtered.includes('-')) {
      // Only allow one minus sign at the start
      const minusCount = (filtered.match(/-/g) || []).length;
      if (minusCount > 1) {
        filtered = '-' + filtered.replace(/-/g, '');
      }
      if (filtered.indexOf('-') !== 0 && filtered.indexOf('-') !== -1) {
        filtered = filtered.replace(/-/g, '');
      }
    }

    // Handle decimal point
    if (decimals !== undefined) {
      const parts = filtered.split('.');
      if (parts.length > 2) {
        // Only allow one decimal point
        filtered = parts[0] + '.' + parts.slice(1).join('');
      }
      if (parts.length === 2 && parts[1].length > decimals) {
        // Limit decimal places
        filtered = parts[0] + '.' + parts[1].substring(0, decimals);
      }
    } else if (filtered.includes('.')) {
      // If decimals not specified, only allow trailing decimals without limit
      const parts = filtered.split('.');
      if (parts.length > 2) {
        filtered = parts[0] + '.' + parts.slice(1).join('');
      }
    }

    e.target.value = filtered;
    props.onChange?.(e);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={cn(
        "flex file:bg-transparent disabled:opacity-50 px-3 py-2 border border-input file:border-0 rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ring-offset-background focus-visible:ring-offset-2 w-full h-10 file:font-medium placeholder:text-muted-foreground file:text-foreground md:text-sm file:text-sm text-base disabled:cursor-not-allowed",
        className
      )}
      ref={ref}
      onChange={handleChange}
      {...props}
    />
  )
})
NumberInput.displayName = "NumberInput"

export { NumberInput }
