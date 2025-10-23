import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    if (typeof globalThis.matchMedia !== 'undefined') {
      // `globalThis` es un objeto accesible en todos los entornos
      const mql = globalThis.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

      const onChange = () => {
        setIsMobile(mql.matches)
      }

      // Configurar el listener de cambios en el mql
      mql.addEventListener("change", onChange)

      // Establecer el estado inicial
      setIsMobile(mql.matches)

      return () => {
        mql.removeEventListener("change", onChange)
      }
    }
  }, [])

  return !!isMobile
}
