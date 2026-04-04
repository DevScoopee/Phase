/**
 * Sello visual PHASE en esquina (garantía de Forja) antes de subir a IPFS.
 * Solo cliente (canvas + createImageBitmap).
 */

const SEAL_LABEL = "PHASE"
const SEAL_SUB = "FORGE"

function drawPhaseForgeSeal(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
  const m = Math.max(6, Math.round(Math.min(canvasW, canvasH) * 0.018))
  const sealH = Math.max(28, Math.round(Math.min(canvasW, canvasH) * 0.072))
  const sealW = Math.round(sealH * 3.1)
  const x = canvasW - sealW - m
  const y = canvasH - sealH - m
  const r = Math.max(4, Math.round(sealH * 0.2))

  ctx.save()
  ctx.fillStyle = "rgba(0,0,0,0.62)"
  ctx.strokeStyle = "rgba(34,211,238,0.85)"
  ctx.lineWidth = Math.max(1, Math.round(sealH / 28))

  ctx.beginPath()
  const rr = (px: number, py: number, rw: number, rh: number, rad: number) => {
    ctx.moveTo(px + rad, py)
    ctx.lineTo(px + rw - rad, py)
    ctx.quadraticCurveTo(px + rw, py, px + rw, py + rad)
    ctx.lineTo(px + rw, py + rh - rad)
    ctx.quadraticCurveTo(px + rw, py + rh, px + rw - rad, py + rh)
    ctx.lineTo(px + rad, py + rh)
    ctx.quadraticCurveTo(px, py + rh, px, py + rh - rad)
    ctx.lineTo(px, py + rad)
    ctx.quadraticCurveTo(px, py, px + rad, py)
  }
  rr(x, y, sealW, sealH, r)
  ctx.fill()
  ctx.stroke()

  // Marca geométrica mínima (diamante PHASE)
  const gx = x + sealH * 0.35
  const gy = y + sealH * 0.5
  const gs = sealH * 0.22
  ctx.fillStyle = "rgba(34,211,238,0.95)"
  ctx.beginPath()
  ctx.moveTo(gx, gy - gs)
  ctx.lineTo(gx + gs, gy)
  ctx.lineTo(gx, gy + gs)
  ctx.lineTo(gx - gs, gy)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = "rgba(220,252,255,0.95)"
  ctx.font = `bold ${Math.round(sealH * 0.38)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(SEAL_LABEL, x + sealH * 0.62, y + sealH * 0.42)

  ctx.fillStyle = "rgba(34,211,238,0.75)"
  ctx.font = `${Math.round(sealH * 0.24)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
  ctx.fillText(SEAL_SUB, x + sealH * 0.62, y + sealH * 0.72)

  ctx.restore()
}

/**
 * Dibuja el sello de garantía y devuelve PNG. Si falla (formato, memoria), devuelve el blob original.
 */
export async function composeImageWithPhaseForgeSeal(input: Blob | File): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return input instanceof File ? input : input.slice(0, input.size, input.type)
  }

  try {
    const bmp = await createImageBitmap(input)
    const w = bmp.width
    const h = bmp.height
    if (w < 8 || h < 8 || w > 8192 || h > 8192) {
      bmp.close()
      return input instanceof File ? input : input.slice(0, input.size, input.type)
    }

    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      bmp.close()
      return input instanceof File ? input : input.slice(0, input.size, input.type)
    }

    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    drawPhaseForgeSeal(ctx, w, h)

    const out = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png")
    })
    return out ?? (input instanceof File ? input : input.slice(0, input.size, input.type))
  } catch {
    return input instanceof File ? input : input.slice(0, input.size, input.type)
  }
}
