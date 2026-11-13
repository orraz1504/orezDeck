import { useEffect } from 'react'

/**
 * On-screen keyboard awareness (iOS Safari and Android Chrome resize only the
 * *visual* viewport, so position: fixed / sticky UI would end up under the keyboard).
 *
 * Publishes on <html>:
 *   --kb      height of the keyboard (0 when closed)
 *   --vv-top  how far the browser panned the page to keep the field visible
 *   .kb-open  class while the keyboard is open
 * and keeps the focused field in view when the keyboard opens.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let open = false
    const update = () => {
      // Pinch-zoom also shrinks the visual viewport: only count it as a keyboard at normal zoom.
      const zoomed = Math.abs(vv.scale - 1) > 0.01
      const kb = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      root.style.setProperty('--kb', `${kb}px`)
      root.style.setProperty('--vv-top', `${zoomed ? 0 : Math.max(0, Math.round(vv.offsetTop))}px`)
      const nowOpen = kb > 80
      root.classList.toggle('kb-open', nowOpen)
      if (nowOpen && !open) {
        const el = document.activeElement as HTMLElement | null
        if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
          requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }))
        }
      }
      open = nowOpen
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
}
