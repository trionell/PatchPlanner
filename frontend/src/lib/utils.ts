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
