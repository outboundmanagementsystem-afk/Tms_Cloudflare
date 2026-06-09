"use client"

import { useEffect } from "react"

/**
 * Stops the mouse wheel from changing the value of a focused <input type="number">.
 * Browsers increment/decrement number inputs on scroll while they're focused, which
 * silently corrupts cost/rate fields when a user scrolls the page. Blurring the input
 * on wheel removes focus so the increment never applies, while the page still scrolls.
 * Mounted once at the app root → applies everywhere.
 */
export function NoNumberScroll() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        el.tagName === "INPUT" &&
        (el as HTMLInputElement).type === "number" &&
        document.activeElement === el
      ) {
        ;(el as HTMLInputElement).blur()
      }
    }
    document.addEventListener("wheel", onWheel, { passive: true })
    return () => document.removeEventListener("wheel", onWheel)
  }, [])

  return null
}
