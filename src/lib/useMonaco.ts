import { useEffect, useState } from 'react'
import { loadMonaco, type Monaco } from './monaco'

export function useMonaco(): Monaco | null {
  const [monaco, setMonaco] = useState<Monaco | null>(null)

  useEffect(() => {
    let active = true
    loadMonaco()
      .then((m) => {
        if (active) {
          setMonaco(m)
        }
      })
      .catch((err) => {
        console.error('Failed to load Monaco editor:', err)
      })

    return () => {
      active = false
    }
  }, [])

  return monaco
}
