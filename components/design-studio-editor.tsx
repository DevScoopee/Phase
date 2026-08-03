"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { useLang } from "@/components/lang-context"
import { pickCopy } from "@/lib/phase-copy"
import { cn } from "@/lib/utils"

export const STUDIO_W = 1024
export const STUDIO_H = 768
const BG = "#000000"
const UNDO_MAX = 18

export type StudioTool =
  | "pencil"
  | "brush"
  | "eraser"
  | "airbrush"
  | "bucket"
  | "line"
  | "rect"
  | "ellipse"
  | "polygon"
  | "text"
  | "select"

/** Paleta “seguridad” PHASE: negros, grises, verdes, cianes */
export const PHASE_STUDIO_PALETTE: readonly string[] = [
  "#000000",
  "#0a0a0a",
  "#1a1a1a",
  "#333333",
  "#555555",
  "#777777",
  "#999999",
  "#aaaaaa",
  "#001a0d",
  "#00331a",
  "#006633",
  "#009944",
  "#00cc55",
  "#00ff66",
  "#00ff88",
  "#00ffaa",
  "#002222",
  "#004444",
  "#006666",
  "#008888",
  "#00aaaa",
  "#00cccc",
  "#00ffff",
  "#66ffff",
  "#aaffff",
]

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "")
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  }
}

function floodFill(ctx: CanvasRenderingContext2D, x0: number, y0: number, fillHex: string) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const ix = Math.floor(x0)
  const iy = Math.floor(y0)
  if (ix < 0 || iy < 0 || ix >= w || iy >= h) return
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const start = (iy * w + ix) * 4
  const { r: fr, g: fg, b: fb } = hexToRgb(fillHex)
  const fa = 255
  const tr = d[start]
  const tg = d[start + 1]
  const tb = d[start + 2]
  const ta = d[start + 3]
  if (tr === fr && tg === fg && tb === fb && ta === fa) return
  const stack: [number, number][] = [[ix, iy]]
  const vis = new Uint8Array(w * h)
  const match = (di: number) =>
    d[di] === tr && d[di + 1] === tg && d[di + 2] === tb && d[di + 3] === ta
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const idx = y * w + x
    if (vis[idx]) continue
    const di = idx * 4
    if (!match(di)) continue
    vis[idx] = 1
    d[di] = fr
    d[di + 1] = fg
    d[di + 2] = fb
    d[di + 3] = fa
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  ctx.putImageData(img, 0, 0)
}

export type DesignStudioEditorHandle = {
  exportPngBlob: () => Promise<Blob | null>
  clear: () => void
  undo: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  closePolygon: () => void
}

type Props = { className?: string }

function normRect(ax: number, ay: number, bx: number, by: number) {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  }
}

export const DesignStudioEditor = forwardRef<DesignStudioEditorHandle, Props>(function DesignStudioEditor(
  { className },
  ref,
) {
  const { lang } = useLang()
  const se = pickCopy(lang).studioEditor

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const undoStack = useRef<ImageData[]>([])
  /** Copia del lienzo al inicio de un arrastre de forma (línea/rect/elipse). */
  const shapeBaseRef = useRef<ImageData | null>(null)

  const cloneImageData = (src: ImageData): ImageData =>
    new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)

  const [tool, setTool] = useState<StudioTool>("pencil")
  const [color, setColor] = useState("#00ff66")
  const [brushSize, setBrushSize] = useState(6)
  const [zoom, setZoom] = useState(1)
  const [polyPoints, setPolyPoints] = useState<[number, number][]>([])
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [textDraft, setTextDraft] = useState<{ x: number; y: number } | null>(null)
  const [textValue, setTextValue] = useState("")

  const dragRef = useRef<{
    kind: "draw" | "shape" | "select"
    start: [number, number]
    last?: [number, number]
  } | null>(null)

  const pushUndo = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    const snap = ctx.getImageData(0, 0, STUDIO_W, STUDIO_H)
    undoStack.current.push(snap)
    if (undoStack.current.length > UNDO_MAX) undoStack.current.shift()
  }, [])

  const initCanvas = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, STUDIO_W, STUDIO_H)
    undoStack.current = []
  }, [])

  useEffect(() => {
    initCanvas()
  }, [initCanvas])

  const clientToCanvas = useCallback((clientX: number, clientY: number): [number, number] => {
    const c = canvasRef.current
    if (!c) return [0, 0]
    const r = c.getBoundingClientRect()
    const x = ((clientX - r.left) / r.width) * STUDIO_W
    const y = ((clientY - r.top) / r.height) * STUDIO_H
    return [Math.max(0, Math.min(STUDIO_W - 1, x)), Math.max(0, Math.min(STUDIO_H - 1, y))]
  }, [])

  const undo = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const prev = undoStack.current.pop()
    if (!prev) return
    ctx.putImageData(prev, 0, 0)
  }, [])

  const clear = useCallback(() => {
    initCanvas()
    setPolyPoints([])
    setSelection(null)
    setTextDraft(null)
    setTextValue("")
  }, [initCanvas])

  const closePolygon = useCallback(() => {
    if (polyPoints.length < 2) {
      setPolyPoints([])
      return
    }
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    pushUndo()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(polyPoints[0][0], polyPoints[0][1])
    for (let i = 1; i < polyPoints.length; i++) {
      ctx.lineTo(polyPoints[i][0], polyPoints[i][1])
    }
    ctx.closePath()
    ctx.stroke()
    setPolyPoints([])
  }, [color, polyPoints, pushUndo])

  const deleteSelection = useCallback(() => {
    if (!selection || selection.w < 1 || selection.h < 1) return
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    pushUndo()
    ctx.fillStyle = BG
    ctx.fillRect(selection.x, selection.y, selection.w, selection.h)
    setSelection(null)
  }, [selection, pushUndo])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (textDraft) return
        if (tool === "polygon" && polyPoints.length > 0 && e.key === "Backspace") {
          e.preventDefault()
          setPolyPoints((p) => p.slice(0, -1))
          return
        }
        if (selection) {
          e.preventDefault()
          deleteSelection()
        }
      }
      if (e.key === "Enter" && tool === "polygon" && !textDraft) {
        closePolygon()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selection, deleteSelection, tool, polyPoints.length, textDraft, closePolygon])

  const spray = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      const { r, g, b } = hexToRgb(color)
      const radius = Math.max(4, brushSize * 2)
      const n = 10 + brushSize
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const rad = Math.random() * radius
        const px = Math.floor(x + Math.cos(a) * rad)
        const py = Math.floor(y + Math.sin(a) * rad)
        if (px < 0 || py < 0 || px >= STUDIO_W || py >= STUDIO_H) continue
        const al = 0.08 + Math.random() * 0.12
        ctx.fillStyle = `rgba(${r},${g},${b},${al})`
        ctx.fillRect(px, py, 1, 1)
      }
    },
    [color, brushSize],
  )

  const drawSegment = useCallback(
    (from: [number, number], to: [number, number], ctx: CanvasRenderingContext2D) => {
      if (tool === "eraser") {
        ctx.strokeStyle = BG
        ctx.globalCompositeOperation = "source-over"
        ctx.lineWidth = brushSize
        ctx.lineCap = "round"
      } else if (tool === "pencil") {
        ctx.strokeStyle = color
        ctx.globalCompositeOperation = "source-over"
        ctx.lineWidth = 1
        ctx.lineCap = "round"
      } else if (tool === "brush") {
        ctx.strokeStyle = color
        ctx.globalCompositeOperation = "source-over"
        ctx.lineWidth = brushSize
        ctx.lineCap = "round"
      }
      ctx.beginPath()
      let fx = from[0]
      let fy = from[1]
      let tx = to[0]
      let ty = to[1]
      if (tool === "brush") {
        fx += (Math.random() - 0.5) * 2
        fy += (Math.random() - 0.5) * 2
        tx += (Math.random() - 0.5) * 2
        ty += (Math.random() - 0.5) * 2
      }
      ctx.moveTo(fx, fy)
      ctx.lineTo(tx, ty)
      ctx.stroke()
    },
    [tool, color, brushSize],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    c.setPointerCapture(e.pointerId)
    const [x, y] = clientToCanvas(e.clientX, e.clientY)

    if (textDraft) return

    if (tool === "text") {
      setTextDraft({ x, y })
      setTextValue("")
      return
    }

    if (tool === "polygon") {
      setPolyPoints((p) => [...p, [x, y]])
      return
    }

    if (tool === "bucket") {
      pushUndo()
      floodFill(ctx, x, y, color)
      return
    }

    if (tool === "select") {
      dragRef.current = { kind: "select", start: [x, y] }
      setSelection(null)
      return
    }

    if (tool === "line" || tool === "rect" || tool === "ellipse") {
      pushUndo()
      const snap = ctx.getImageData(0, 0, STUDIO_W, STUDIO_H)
      shapeBaseRef.current = cloneImageData(snap)
      dragRef.current = { kind: "shape", start: [x, y] }
      return
    }

    pushUndo()
    dragRef.current = { kind: "draw", start: [x, y], last: [x, y] }
    ctx.save()
    if (tool === "airbrush") {
      ctx.globalCompositeOperation = "source-over"
      spray(ctx, x, y)
    } else {
      drawSegment([x, y], [x, y], ctx)
    }
    ctx.restore()
  }

  const redrawShapePreview = (sx: number, sy: number, ex: number, ey: number) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx || !dragRef.current || dragRef.current.kind !== "shape") return
    const base = shapeBaseRef.current
    if (base) ctx.putImageData(base, 0, 0)
    const { x, y, w, h } = normRect(sx, sy, ex, ey)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.globalCompositeOperation = "source-over"
    if (tool === "line") {
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(ex, ey)
      ctx.stroke()
    } else if (tool === "rect") {
      ctx.strokeRect(x, y, w, h)
    } else if (tool === "ellipse") {
      const cx = x + w / 2
      const cy = y + h / 2
      const rx = w / 2
      const ry = h / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    const [x, y] = clientToCanvas(e.clientX, e.clientY)
    const d = dragRef.current

    if (!d) return

    if (d.kind === "select" && d.start) {
      const { x: rx, y: ry, w, h } = normRect(d.start[0], d.start[1], x, y)
      setSelection({ x: rx, y: ry, w, h })
      return
    }

    if (d.kind === "shape") {
      redrawShapePreview(d.start[0], d.start[1], x, y)
      return
    }

    if (d.kind === "draw" && d.last) {
      if (tool === "airbrush") {
        spray(ctx, x, y)
      } else {
        drawSegment(d.last, [x, y], ctx)
      }
      d.last = [x, y]
    }
  }

  const commitShape = (sx: number, sy: number, ex: number, ey: number) => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    const base = shapeBaseRef.current
    if (base) ctx.putImageData(base, 0, 0)
    const { x, y, w, h } = normRect(sx, sy, ex, ey)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    if (tool === "line") {
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(ex, ey)
      ctx.stroke()
    } else if (tool === "rect") {
      ctx.strokeRect(x, y, w, h)
    } else if (tool === "ellipse") {
      const cx = x + w / 2
      const cy = y + h / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    shapeBaseRef.current = null
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const c = canvasRef.current
    if (!c) return
    try {
      c.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const [x, y] = clientToCanvas(e.clientX, e.clientY)
    const d = dragRef.current
    dragRef.current = null

    if (!d) return

    if (d.kind === "shape") {
      commitShape(d.start[0], d.start[1], x, y)
      return
    }

    if (d.kind === "draw") {
      /* stroke already applied */
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      exportPngBlob: () =>
        new Promise((resolve) => {
          const c = canvasRef.current
          if (!c) {
            resolve(null)
            return
          }
          c.toBlob((b) => resolve(b), "image/png")
        }),
      clear,
      undo,
      zoomIn: () => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100)),
      zoomOut: () => setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100)),
      zoomReset: () => setZoom(1),
      closePolygon,
    }),
    [clear, undo, closePolygon],
  )

  const commitText = () => {
    if (!textDraft || !textValue.trim()) {
      setTextDraft(null)
      setTextValue("")
      return
    }
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return
    pushUndo()
    ctx.save()
    ctx.font = `${Math.max(12, brushSize * 2)}px "IBM Plex Mono", ui-monospace, monospace`
    ctx.fillStyle = color
    ctx.textBaseline = "top"
    ctx.fillText(textValue.trim(), textDraft.x, textDraft.y)
    ctx.restore()
    setTextDraft(null)
    setTextValue("")
  }

  const toolBtn = (t: StudioTool, label: string, ascii: string) => (
    <button
      key={t}
      type="button"
      onClick={() => {
        setTool(t)
        setPolyPoints([])
        if (t !== "text") setTextDraft(null)
      }}
      className={cn(
        "flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 border-2 px-1 py-2 font-mono text-[8px] font-semibold uppercase leading-tight tracking-wider",
        tool === t
          ? "border-cyan-400 bg-cyan-500/20 text-cyan-50 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
          : "border-cyan-700/50 bg-[#0a1412] text-cyan-200/90 hover:border-cyan-400/60 hover:text-cyan-50",
      )}
    >
      <span className="text-[11px] leading-none">{ascii}</span>
      <span className="opacity-90">{label}</span>
    </button>
  )

  const zPct = Math.round(zoom * 100)

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2 md:flex-row", className)}>
      <aside className="flex w-full shrink-0 flex-row flex-wrap gap-1 border-4 border-double border-cyan-500/45 bg-[#0a1210] p-2 md:w-[118px] md:flex-col md:flex-nowrap">
        <p className="hidden w-full font-mono text-[8px] font-semibold uppercase tracking-widest text-cyan-300/90 md:block">
          {se.tools}
        </p>
        {toolBtn("pencil", se.pencil, "✎")}
        {toolBtn("brush", se.brush, "▓")}
        {toolBtn("airbrush", se.airbrush, "∴")}
        {toolBtn("eraser", se.eraser, "⌧")}
        {toolBtn("bucket", se.bucket, "▣")}
        {toolBtn("line", se.line, "─")}
        {toolBtn("rect", se.rect, "▭")}
        {toolBtn("ellipse", se.ellipse, "◯")}
        {toolBtn("polygon", se.polygon, "◇")}
        {toolBtn("text", se.text, "T")}
        {toolBtn("select", se.select, "⎕")}
        <div className="mt-1 w-full border-t border-cyan-700/35 pt-2">
          <label className="font-mono text-[8px] font-semibold uppercase text-cyan-300/80">{se.thickness}</label>
          <input
            type="range"
            min={1}
            max={32}
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
            className="mt-1 w-full accent-[#00ffff]"
          />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="relative min-h-[200px] flex-1 overflow-auto border-4 border-double border-emerald-500/45 bg-[#050808]"
          style={{ maxHeight: "min(62vh, 640px)" }}
        >
          <div
            className="relative inline-block"
            style={{
              width: STUDIO_W * zoom,
              height: STUDIO_H * zoom,
            }}
          >
            <canvas
              ref={canvasRef}
              width={STUDIO_W}
              height={STUDIO_H}
              className="block cursor-crosshair touch-none"
              style={{
                width: STUDIO_W * zoom,
                height: STUDIO_H * zoom,
                imageRendering: "pixelated",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={(e) => onPointerUp(e)}
              onDoubleClick={() => {
                if (tool === "polygon" && polyPoints.length >= 2) closePolygon()
              }}
            />
            {selection && selection.w > 0 && selection.h > 0 && (
              <div
                className="pointer-events-none absolute border border-dashed border-[#00ffff] bg-[#00ffff]/5"
                style={{
                  left: selection.x * zoom,
                  top: selection.y * zoom,
                  width: selection.w * zoom,
                  height: selection.h * zoom,
                  boxShadow: "0 0 0 1px rgba(0,255,0,0.35)",
                }}
              />
            )}
            {tool === "polygon" && polyPoints.length > 0 && (
              <svg
                className="pointer-events-none absolute inset-0 overflow-visible"
                width={STUDIO_W * zoom}
                height={STUDIO_H * zoom}
                viewBox={`0 0 ${STUDIO_W} ${STUDIO_H}`}
                preserveAspectRatio="none"
              >
                <polyline
                  fill="none"
                  stroke="#00ffff"
                  strokeWidth={2 / zoom}
                  points={polyPoints.map((p) => `${p[0]},${p[1]}`).join(" ")}
                />
              </svg>
            )}
            {textDraft && (
              <input
                autoFocus
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onBlur={() => commitText()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    commitText()
                  }
                }}
                className="absolute z-10 min-w-[120px] border-2 border-[#00ffff] bg-black/90 px-1 font-mono text-sm text-[#00ff88] outline-none"
                style={{
                  left: textDraft.x * zoom,
                  top: textDraft.y * zoom,
                  fontSize: Math.max(12, brushSize * 2),
                }}
                placeholder={se.textPlaceholder}
              />
            )}
          </div>
        </div>

        <div className="shrink-0 border-4 border-double border-t-0 border-cyan-600/40 bg-[#0a1010] p-2 md:border-t-4">
          <p className="mb-2 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-200/90">
            {se.paletteTitle}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PHASE_STUDIO_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                title={hex}
                onClick={() => setColor(hex)}
                className={cn(
                  "size-8 border-2 shadow-inner transition-transform hover:scale-110",
                  color === hex ? "border-cyan-300 ring-2 ring-cyan-400/50" : "border-zinc-600",
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <p className="mt-2 font-mono text-[9px] leading-relaxed text-cyan-300/85">
            {se.hint.replace("{w}", String(STUDIO_W)).replace("{h}", String(STUDIO_H)).replace("{z}", String(zPct))}
          </p>
        </div>
      </div>
    </div>
  )
})
