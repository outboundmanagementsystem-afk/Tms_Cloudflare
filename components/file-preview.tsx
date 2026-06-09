"use client"

import { FileText, X } from "lucide-react"

/** True if the URL points at an image we can show inline. */
export function isImageUrl(url: string): boolean {
  if (!url) return false
  const clean = url.split("?")[0].toLowerCase()
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/.test(clean)
}

export function filenameFromUrl(url: string): string {
  try { return decodeURIComponent(url.split("?")[0].split("/").pop() || "file") } catch { return "file" }
}

/**
 * Inline document tile: shows a small image thumbnail when the file is an image, otherwise
 * a file chip. Clicking opens the full file in a new tab. Optional delete (trash) button.
 */
export function FilePreview({ url, onDelete, size = 64 }: { url: string; onDelete?: () => void; size?: number }) {
  const name = filenameFromUrl(url)
  const img = isImageUrl(url)
  return (
    <div className="group relative inline-flex flex-col items-center" style={{ width: size + 16 }}>
      <button
        type="button"
        onClick={() => window.open(url, "_blank")}
        title={name}
        className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50 hover:border-emerald-400 transition-colors flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <FileText className="w-7 h-7 text-gray-400" />
        )}
      </button>
      <span className="mt-1 w-full truncate text-center font-sans text-[9px] text-gray-500" title={name}>{name}</span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute -top-1.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
          title="Remove"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
