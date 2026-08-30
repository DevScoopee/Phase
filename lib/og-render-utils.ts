/**
 * Shared OG image rendering utilities for app/api/og/* route handlers.
 *
 * Extracts the duplicated image-composition + error-handling logic shared by
 * the chamber and profile renderers into a single typed, well-tested module.
 * All pixel-affecting constants come from the design-token registry
 * (lib/og-design-tokens) — routes should never hardcode a color/geometry.
 */
import path from "node:path"
import { existsSync } from "node:fs"
import sharp from "sharp"
import {
  escapeMarkup,
  sanitizeForSharp,
  type OgTheme,
} from "@/lib/og-design-tokens"

export const NOTO_SANS_TTF = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf")

// ─── Template resolution (preserves public/og-template.png wiring) ───────────

export interface OgTemplateResolution {
  path: string
  name: "og-template.png" | "og-monitor.png"
}

/** Prefer og-template.png, fall back to og-monitor.png (legacy, no regression). */
export function resolveOgTemplatePath(): string {
  const template = path.join(process.cwd(), "public", "og-template.png")
  if (existsSync(template)) return template
  return path.join(process.cwd(), "public", "og-monitor.png")
}

export function templateName(filePath: string): OgTemplateResolution["name"] {
  return filePath.endsWith("og-template.png") ? "og-template.png" : "og-monitor.png"
}

// ─── Remote image fetching ────────────────────────────────────────────────────

export async function fetchImageBuffer(url: string, timeoutMs = 7000): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

// ─── Text overlays (sharp Pango renderer, bundled NotoSans TTF) ───────────────

export interface TextLayerOptions {
  left: number
  top: number
  width: number
  fontSize: number
  color: string
  align?: "left" | "center" | "right"
  height?: number
  letterSpacing?: number
}

/**
 * Render text as a PNG overlay using sharp's native Pango text input. Font is
 * the bundled NotoSans TTF so it works on Vercel (Amazon Linux 2) without any
 * system font. Center/right alignment measures natural width then offsets.
 */
export async function textLayer(
  text: string,
  opts: TextLayerOptions,
  fontfile = NOTO_SANS_TTF,
): Promise<sharp.OverlayOptions | null> {
  try {
    const align = opts.align ?? "left"
    const pango = `<span foreground="${opts.color}">${escapeMarkup(text)}</span>`
    const textBuf = await sharp({
      text: {
        text: pango,
        fontfile,
        font: `Noto Sans ${opts.fontSize}`,
        rgba: true,
        dpi: 72,
      },
    })
      .png()
      .toBuffer()

    let finalLeft = opts.left
    if (align === "center" || align === "right") {
      const { width: textW = 0 } = await sharp(textBuf).metadata()
      if (align === "center") finalLeft = Math.max(0, Math.round((opts.width - textW) / 2))
      else finalLeft = Math.max(0, opts.left + opts.width - textW)
    }

    return { input: textBuf, left: finalLeft, top: opts.top }
  } catch {
    return null
  }
}

/**
 * Build a display name safe for Pango:
 *   - cap at theme max chars (with ellipsis)
 *   - strip non-printable ASCII with a themed fallback
 */
export function safeDisplayName(
  raw: string,
  fallback: string,
  theme: OgTheme,
  uppercase = true,
): string {
  const clean = sanitizeForSharp(raw, fallback)
  const max = theme.dimensions.maxNameChars
  const capped = clean.length > max ? clean.slice(0, max) + "…" : clean
  return uppercase ? capped.toUpperCase() : capped
}

// ─── Error boundary ───────────────────────────────────────────────────────────

export type OgRenderOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown }

/**
 * Generic error boundary for OG renderers. Converts any thrown error during
 * image assembly into a typed result so route handlers never leak unhandled
 * exceptions to production logs.
 */
export async function withOgErrorBoundary<T>(
  fn: () => Promise<T>,
  onError?: (err: unknown) => void,
): Promise<OgRenderOutcome<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    if (onError) onError(err)
    return { ok: false, error: err }
  }
}

// ─── Canvas builders ──────────────────────────────────────────────────────────

/** Create a solid-color RGBA PNG buffer (used for canvases and accent strips). */
export async function solidPng(
  width: number,
  height: number,
  background: { r: number; g: number; b: number; alpha: number },
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer()
}
