// Notification chime via the Web Audio API — no asset file needed.
//
// Browsers start an AudioContext "suspended" until the user interacts with the page, and
// our chime fires on a poll timer (not a click) — that's why nothing was audible. We keep
// ONE shared context and resume it on the first user gesture (initNotificationSound), so
// later programmatic chimes play. playNotificationSound also best-effort resumes.

let ctx: AudioContext | null = null
let unlockBound = false

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!ctx) {
    const Ctx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return null
    try { ctx = new Ctx() } catch { return null }
  }
  return ctx
}

/** Call once on mount. Resumes the audio context on the first user gesture. */
export function initNotificationSound() {
  if (typeof window === "undefined" || unlockBound) return
  unlockBound = true
  const unlock = () => {
    const c = getCtx()
    if (c && c.state === "suspended") c.resume().catch(() => {})
    window.removeEventListener("pointerdown", unlock)
    window.removeEventListener("keydown", unlock)
    window.removeEventListener("touchstart", unlock)
  }
  window.addEventListener("pointerdown", unlock)
  window.addEventListener("keydown", unlock)
  window.addEventListener("touchstart", unlock)
}

/** Play a short two-tone chime. */
export function playNotificationSound() {
  try {
    const c = getCtx()
    if (!c) return
    if (c.state === "suspended") c.resume().catch(() => {})
    const beep = (freq: number, start: number, dur: number) => {
      const o = c.createOscillator()
      const g = c.createGain()
      o.connect(g)
      g.connect(c.destination)
      o.type = "sine"
      o.frequency.value = freq
      const t0 = c.currentTime + start
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      o.start(t0)
      o.stop(t0 + dur + 0.02)
    }
    beep(880, 0, 0.18)
    beep(1175, 0.16, 0.22)
  } catch {
    /* audio unavailable — ignore */
  }
}
