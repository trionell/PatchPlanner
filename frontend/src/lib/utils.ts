import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Parses a select/input value into a number, or undefined for empty/invalid. */
export function toOptionalNumber(value: string): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Formats a DMX address range, e.g. start 1 + 16 channels → "1–16". */
export function formatDMXRange(start?: number, count?: number): string {
  if (!start) return '—'
  const safeCount = count && count > 0 ? count : 1
  const end = start + safeCount - 1
  return safeCount > 1 ? `${start}–${end}` : `${start}`
}

/** Parses "12/6" or "16/8" style in/out counts from an inventory item description. */
export function parseInOut(description: string): { inputs: number; outputs: number } | null {
  const match = description.match(/(\d+)\s*\/\s*(\d+)/)
  if (match) return { inputs: parseInt(match[1]), outputs: parseInt(match[2]) }
  return null
}

/** Parses a channel count from an item description: "N/M" (larger wins) or "N ch"/"N kanal". */
export function parseChannels(description: string): number | null {
  const inOut = parseInOut(description)
  if (inOut) return Math.max(inOut.inputs, inOut.outputs) || inOut.inputs
  const chMatch = description.match(/(\d+)\s*(?:ch|kanal)/i)
  if (chMatch) return parseInt(chMatch[1])
  return null
}

/**
 * Display label for a catalog item: name plus the distinguishing
 * description ("Mikrofonkabel — 4m") — many items share a bare name.
 */
export function itemLabel(item: { name: string; description?: string }): string {
  return item.description ? `${item.name} — ${item.description}` : item.name
}

/** Legacy pre-catalog cable display: vocabulary label plus typed length. */
export function legacyCableText(cableType: string, lengthM: number | undefined, labelFor: (value: string) => string): string {
  const base = labelFor(cableType)
  return lengthM && lengthM > 0 ? `${base} ${lengthM} m` : base
}

/**
 * Inline style tinting a badge with a channel-strip color; undefined for
 * uncolored so the element keeps its default look. Dark text keeps every
 * palette color readable.
 */
export function busTint(color?: string): { backgroundColor: string; color: string } | undefined {
  return color ? { backgroundColor: color, color: '#18181b' } : undefined
}
