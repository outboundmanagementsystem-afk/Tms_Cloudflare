import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toTitleCase(str: string) {
  if (!str) return ""
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

// Filename for a downloaded itinerary: "Client Destination 3N-4D"
// (filesystem-safe — no slashes; the on-screen label can show "3N/4D").
export function buildItineraryFileName(itin: any): string {
  const clean = (s: any) => String(s ?? "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()
  const nights = Number(itin?.nights) || 0
  const days = Array.isArray(itin?.days) ? itin.days.length : (Number(itin?.days) || (nights ? nights + 1 : 0))
  const head = [clean(itin?.customerName) || "Itinerary", clean(itin?.destination)].filter(Boolean).join(" ")
  const dur = (nights || days) ? `${nights}N-${days}D` : ""
  return [head, dur].filter(Boolean).join(" ").trim()
}
