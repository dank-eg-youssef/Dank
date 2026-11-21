import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  ImagePlus,
  Loader2,
  Move,
  Paintbrush,
  Send,
  Sparkles,
  Type,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { saveUserSticker } from '../services/chatService';
import { uploadToCloudinary } from '../utils/mediaStorage';

type CropShape = 'circle' | 'oval' | 'square' | 'full';
type BrushMode = 'move' | 'erase' | 'restore';
type TextPosition = 'top' | 'center' | 'bottom';

const TEXT_COLORS = ['#FFFFFF', '#1DB954', '#FACC15', '#EC4899', '#38BDF8', '#111111'];
const CANVAS_SIZE = 512;

interface StickerMakerModalProps {
  currentUid: string;
  onClose: () => void;
  onSaved: (opts: {
    stickerDocId: string;
    imageUrl: string;
    label: string;
    andSend: boolean;
  }) => void;
  onNotify: (msg: string) => void;
}

export const StickerMakerModal: React.FC<StickerMakerModalProps> = ({
  currentUid,
  onClose,
  onSaved,
  onNotify,
}) => {
  const { t } = useLanguage();

  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [cropShape, setCropShape] = useState<CropShape>('circle');
  const [zoom, setZoom] = useState(1.1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [bgRemoved, setBgRemoved] = useState(false);
  const [tolerance, setTolerance] = useState(34);
  const [brushMode, setBrushMode] = useState<BrushMode>('move');
  const [brushSize, setBrushSize] = useState(28);
  const [whiteBorder, setWhiteBorder] = useState(true);

  const [overlayText, setOverlayText] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textSize, setTextSize] = useState(52);
  const [textPos, setTextPos] = useState<TextPosition>('bottom');

  const [savingMode, setSavingMode] = useState<'save' | 'send' | null>(null);
  const [undoCount, setUndoCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const pointerStateRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
  }>({ active: false, lastX: 0, lastY: 0 });

  const ensureOffscreenCanvases = () => {
    if (!maskCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_SIZE;
      c.height = CANVAS_SIZE;
      maskCanvasRef.current = c;
    }
    if (!baseCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_SIZE;
      c.height = CANVAS_SIZE;
      baseCanvasRef.current = c;
    }
  };

  const resetMaskWhite = useCallback(() => {
    ensureOffscreenCanvases();
    const mask = maskCanvasRef.current!;
    const ctx = mask.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    undoStackRef.current = [];
    setUndoCount(0);
    setBgRemoved(false);
  }, []);

  const drawCropClipPath = (ctx: CanvasRenderingContext2D, shape: CropShape) => {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, 232, 0, Math.PI * 2);
    } else if (shape === 'oval') {
      ctx.ellipse(CANVAS_SIZE / 2, CANVAS_SIZE / 2, 185, 234, 0, 0, Math.PI * 2);
    } else if (shape === 'square') {
      const p = 24;
      const w = CANVAS_SIZE - p * 2;
      const r = 64;
      ctx.moveTo(p + r, p);
      ctx.lineTo(p + w - r, p);
      ctx.quadraticCurveTo(p + w, p, p + w, p + r);
      ctx.lineTo(p + w, p + w - r);
      ctx.quadraticCurveTo(p + w, p + w, p + w - r, p + w);
      ctx.lineTo(p + r, p + w);
      ctx.quadraticCurveTo(p, p + w, p, p + w - r);
      ctx.lineTo(p, p + r);
      ctx.quadraticCurveTo(p, p, p + r, p);
    } else {
      ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
    ctx.closePath();
  };

  const renderBasePhoto = useCallback(() => {
    ensureOffscreenCanvases();
    const base = baseCanvasRef.current!;
    const ctx = base.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (!sourceImg) return;

    ctx.save();
    drawCropClipPath(ctx, cropShape);
    ctx.clip();

    const coverScale = Math.max(CANVAS_SIZE / sourceImg.width, CANVAS_SIZE / sourceImg.height);
    const drawW = sourceImg.width * coverScale * zoom;
    const drawH = sourceImg.height * coverScale * zoom;
    const dx = (CANVAS_SIZE - drawW) / 2 + pan.x;
    const dy = (CANVAS_SIZE - drawH) / 2 + pan.y;
    ctx.drawImage(sourceImg, dx, dy, drawW, drawH);
    ctx.restore();
  }, [sourceImg, cropShape, zoom, pan.x, pan.y]);

  const composeStickerCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement) => {
      ensureOffscreenCanvases();
      renderBasePhoto();
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      const temp = document.createElement('canvas');
      temp.width = CANVAS_SIZE;
      temp.height = CANVAS_SIZE;
      const tCtx = temp.getContext('2d');
      if (!tCtx) return;

      tCtx.drawImage(baseCanvasRef.current!, 0, 0);
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(maskCanvasRef.current!, 0, 0);
      tCtx.globalCompositeOperation = 'source-over';

      if (whiteBorder) {
        // Multi-directional die-cut sticker white outline around non-transparent pixels
        const outline = document.createElement('canvas');
        outline.width = CANVAS_SIZE;
        outline.height = CANVAS_SIZE;
        const oCtx = outline.getContext('2d');
        if (oCtx) {
          const solidWhite = document.createElement('canvas');
          solidWhite.width = CANVAS_SIZE;
          solidWhite.height = CANVAS_SIZE;
          const swCtx = solidWhite.getContext('2d');
          if (swCtx) {
            swCtx.drawImage(temp, 0, 0);
            swCtx.globalCompositeOperation = 'source-in';
            swCtx.fillStyle = '#FFFFFF';
            swCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

            const radius = 8;
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
              oCtx.drawImage(
                solidWhite,
                Math.cos(angle) * radius,
                Math.sin(angle) * radius
              );
            }
            ctx.drawImage(outline, 0, 0);
          }
        }
      }

      ctx.drawImage(temp, 0, 0);

      // Draw text overlay with crisp stroke
      const cleanText = overlayText.trim();
      if (cleanText) {
        ctx.save();
        ctx.font = `800 ${textSize}px Cairo, Poppins, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.lineWidth = Math.max(6, Math.round(textSize * 0.18));
        ctx.strokeStyle = textColor === '#111111' ? '#FFFFFF' : '#000000';
        ctx.fillStyle = textColor;

        const y =
          textPos === 'top'
            ? 72
            : textPos === 'center'
            ? CANVAS_SIZE / 2
            : CANVAS_SIZE - 68;
        ctx.strokeText(cleanText, CANVAS_SIZE / 2, y, CANVAS_SIZE - 48);
        ctx.fillText(cleanText, CANVAS_SIZE / 2, y, CANVAS_SIZE - 48);
        ctx.restore();
      }
    },
    [renderBasePhoto, whiteBorder, overlayText, textSize, textColor, textPos]
  );

  useEffect(() => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    composeStickerCanvas(canvas);
  }, [composeStickerCanvas, sourceImg, undoCount, bgRemoved]);

  const handlePickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setSourceImg(img);
      setZoom(1.1);
      setPan({ x: 0, y: 0 });
      resetMaskWhite();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const pushUndoSnapshot = () => {
    ensureOffscreenCanvases();
    const mask = maskCanvasRef.current!;
    const ctx = mask.getContext('2d');
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    undoStackRef.current = [...undoStackRef.current.slice(-11), snap];
    setUndoCount(undoStackRef.current.length);
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0 || !maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;
    const last = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    ctx.putImageData(last, 0, 0);
    setUndoCount(undoStackRef.current.length);
  };

  // Free client-side background removal: border-seeded BFS flood fill on perceptual color similarity + edge feather
  const runAutoRemoveBackground = (tolValue: number) => {
    if (!sourceImg) return;
    ensureOffscreenCanvases();
    renderBasePhoto();

    const baseCtx = baseCanvasRef.current!.getContext('2d');
    const maskCtx = maskCanvasRef.current!.getContext('2d');
    if (!baseCtx || !maskCtx) return;

    pushUndoSnapshot();

    const baseData = baseCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const pixels = baseData.data;
    const total = CANVAS_SIZE * CANVAS_SIZE;
    const visited = new Uint8Array(total);
    const toErase = new Uint8Array(total);
    const queue = new Int32Array(total);
    let qHead = 0;
    let qTail = 0;

    // Sample average background color from opaque border pixels of cropped image
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    let sampleCount = 0;

    const trySeed = (x: number, y: number) => {
      const idx = y * CANVAS_SIZE + x;
      if (visited[idx]) return;
      const p = idx * 4;
      if (pixels[p + 3] < 20) {
        visited[idx] = 1;
        toErase[idx] = 1;
        queue[qTail++] = idx;
        return;
      }
      // Seed if on outer ring or near crop edge
      bgR += pixels[p];
      bgG += pixels[p + 1];
      bgB += pixels[p + 2];
      sampleCount += 1;
      visited[idx] = 1;
      queue[qTail++] = idx;
    };

    for (let x = 0; x < CANVAS_SIZE; x += 2) {
      trySeed(x, 0);
      trySeed(x, CANVAS_SIZE - 1);
    }
    for (let y = 0; y < CANVAS_SIZE; y += 2) {
      trySeed(0, y);
      trySeed(CANVAS_SIZE - 1, y);
    }

    // Also sample points inside the cropped shape perimeter so Circle/Oval crops find the background edge
    for (let y = 16; y < CANVAS_SIZE - 16; y += 12) {
      for (let x = 16; x < CANVAS_SIZE - 16; x += 12) {
        const idx = y * CANVAS_SIZE + x;
        if (pixels[idx * 4 + 3] < 10) {
          // Transparent crop exterior: seed neighboring opaque pixels as background
          const neighbors = [
            [x + 4, y],
            [x - 4, y],
            [x, y + 4],
            [x, y - 4],
          ];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < CANVAS_SIZE && ny >= 0 && ny < CANVAS_SIZE) {
              const nIdx = ny * CANVAS_SIZE + nx;
              if (pixels[nIdx * 4 + 3] > 20 && !visited[nIdx]) {
                trySeed(nx, ny);
              }
            }
          }
        }
      }
    }

    if (sampleCount > 0) {
      bgR /= sampleCount;
      bgG /= sampleCount;
      bgB /= sampleCount;
    }

    const maxDist = tolValue * 2.55;
    const softDist = maxDist * 1.25;

    while (qHead < qTail) {
      const idx = queue[qHead++];
      const x = idx % CANVAS_SIZE;
      const y = (idx / CANVAS_SIZE) | 0;
      const p = idx * 4;
      const alpha = pixels[p + 3];

      if (alpha < 20) {
        toErase[idx] = 1;
      } else {
        const dr = pixels[p] - bgR;
        const dg = pixels[p + 1] - bgG;
        const db = pixels[p + 2] - bgB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist > maxDist) {
          continue;
        }
        toErase[idx] = 1;
      }

      if (x > 0) {
        const n = idx - 1;
        if (!visited[n]) {
          visited[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (x < CANVAS_SIZE - 1) {
        const n = idx + 1;
        if (!visited[n]) {
          visited[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (y > 0) {
        const n = idx - CANVAS_SIZE;
        if (!visited[n]) {
          visited[n] = 1;
          queue[qTail++] = n;
        }
      }
      if (y < CANVAS_SIZE - 1) {
        const n = idx + CANVAS_SIZE;
        if (!visited[n]) {
          visited[n] = 1;
          queue[qTail++] = n;
        }
      }
    }

    // Build clean alpha mask with subtle edge feathering
    const maskImg = maskCtx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    const md = maskImg.data;
    for (let i = 0; i < total; i += 1) {
      const o = i * 4;
      if (toErase[i]) {
        md[o] = 0;
        md[o + 1] = 0;
        md[o + 2] = 0;
        md[o + 3] = 0;
      } else {
        const dr = pixels[o] - bgR;
        const dg = pixels[o + 1] - bgG;
        const db = pixels[o + 2] - bgB;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        let a = 255;
        if (dist < softDist && dist > maxDist) {
          a = Math.round(((dist - maxDist) / (softDist - maxDist)) * 255);
        }
        md[o] = 255;
        md[o + 1] = 255;
        md[o + 2] = 255;
        md[o + 3] = a;
      }
    }
    maskCtx.putImageData(maskImg, 0, 0);
    setBgRemoved(true);
    if (brushMode === 'move') setBrushMode('erase');
    composeStickerCanvas(displayCanvasRef.current!);
  };

  const paintBrushAt = (clientX: number, clientY: number) => {
    const canvas = displayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!canvas || !mask) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * CANVAS_SIZE;
    const y = ((clientY - rect.top) / rect.height) * CANVAS_SIZE;
    const ctx = mask.getContext('2d');
    if (!ctx) return;

    ctx.save();
    if (brushMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFFFFF';
    }
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    composeStickerCanvas(canvas);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sourceImg) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStateRef.current = {
      active: true,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    if (brushMode === 'erase' || brushMode === 'restore') {
      pushUndoSnapshot();
      paintBrushAt(e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerStateRef.current.active || !sourceImg) return;
    if (brushMode === 'move') {
      const canvas = displayCanvasRef.current;
      const scaleFactor = canvas ? CANVAS_SIZE / canvas.getBoundingClientRect().width : 1;
      const dx = (e.clientX - pointerStateRef.current.lastX) * scaleFactor;
      const dy = (e.clientY - pointerStateRef.current.lastY) * scaleFactor;
      pointerStateRef.current.lastX = e.clientX;
      pointerStateRef.current.lastY = e.clientY;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      paintBrushAt(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = () => {
    pointerStateRef.current.active = false;
  };

  const handleExportAndSave = async (andSend: boolean) => {
    if (!sourceImg || savingMode) return;
    setSavingMode(andSend ? 'send' : 'save');
    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = CANVAS_SIZE;
      exportCanvas.height = CANVAS_SIZE;
      composeStickerCanvas(exportCanvas);

      const blob = await new Promise<Blob>((resolve, reject) => {
        exportCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not export sticker PNG'))),
          'image/png'
        );
      });

      const imageUrl = await uploadToCloudinary(blob, `era_sticker_${Date.now()}.png`);
      const label = overlayText.trim().slice(0, 80) || 'Custom Sticker';
      const stickerDocId = await saveUserSticker(currentUid, {
        source: 'custom',
        imageUrl,
        label,
      });

      onNotify(t.stickers.stickerCreated);
      onSaved({ stickerDocId, imageUrl, label, andSend });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.stickers.stickerFailed);
    } finally {
      setSavingMode(null);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[94dvh] rounded-t-3xl sm:rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] text-[var(--era-text)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--era-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--era-accent)]" />
            <h3 className="text-base font-bold">{t.stickers.makerTitle}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-9 h-9 rounded-full hover:bg-[var(--era-hover)] flex items-center justify-center text-[var(--era-muted)] hover:text-[var(--era-text)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickPhoto}
            className="hidden"
          />

          {/* Canvas Preview Area */}
          <div className="flex flex-col items-center gap-2.5">
            {!sourceImg ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-60 h-60 rounded-3xl border-2 border-dashed border-[var(--era-accent-border)] bg-[var(--era-canvas)] hover:bg-[var(--era-hover)] flex flex-col items-center justify-center gap-3 p-5 text-center transition-colors cursor-pointer"
              >
                <div className="w-14 h-14 rounded-2xl bg-[var(--era-accent-soft)] text-[var(--era-accent)] flex items-center justify-center">
                  <ImagePlus className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--era-text)]">{t.stickers.pickPhoto}</p>
                  <p className="mt-1 text-xs text-[var(--era-muted)] leading-relaxed">
                    {t.stickers.pickPhotoHint}
                  </p>
                </div>
              </button>
            ) : (
              <div className="relative flex flex-col items-center gap-2">
                <div
                  className="w-60 h-60 sm:w-64 sm:h-64 rounded-3xl overflow-hidden border border-[var(--era-border)] shadow-xl touch-none"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)',
                    backgroundSize: '20px 20px',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                  }}
                >
                  <canvas
                    ref={displayCanvasRef}
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className={`w-full h-full touch-none ${
                      brushMode === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-3 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                    {t.stickers.changePhoto}
                  </button>
                  {undoCount > 0 && (
                    <button
                      type="button"
                      onClick={handleUndo}
                      className="h-8 px-3 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Undo2 className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                      {t.stickers.undoBrush}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {sourceImg && (
            <div className="space-y-3.5">
              {/* Crop Shape & Zoom */}
              <div className="rounded-2xl bg-[var(--era-canvas)] border border-[var(--era-border)] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--era-muted)]">{t.stickers.cropShape}</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {(
                      [
                        ['circle', t.stickers.cropCircle],
                        ['oval', t.stickers.cropOval],
                        ['square', t.stickers.cropSquare],
                        ['full', t.stickers.cropFull],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setCropShape(id)}
                        className={`h-7 px-2.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                          cropShape === id
                            ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                            : 'bg-[var(--era-elevated)] text-[var(--era-text)] hover:bg-[var(--era-hover)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--era-muted)] w-14 shrink-0">
                    {t.stickers.zoom}
                  </span>
                  <input
                    type="range"
                    min={0.7}
                    max={2.6}
                    step={0.05}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 accent-[var(--era-accent)]"
                  />
                </div>
              </div>

              {/* Remove Background + Brush Tools */}
              <div className="rounded-2xl bg-[var(--era-canvas)] border border-[var(--era-border)] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => runAutoRemoveBackground(tolerance)}
                    className="h-9 px-3.5 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>{t.stickers.removeBg}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWhiteBorder((v) => !v)}
                    className={`h-8 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                      whiteBorder
                        ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)] text-[var(--era-accent)]'
                        : 'bg-[var(--era-elevated)] border-[var(--era-border)] text-[var(--era-muted)]'
                    }`}
                  >
                    {whiteBorder && <Check className="w-3.5 h-3.5" />}
                    <span>{t.stickers.whiteBorder}</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--era-muted)] shrink-0">
                    {t.stickers.bgTolerance}
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={85}
                    step={2}
                    value={tolerance}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTolerance(val);
                    }}
                    className="flex-1 accent-[var(--era-accent)]"
                  />
                  <span className="text-xs font-bold tabular-nums w-7 text-end">{tolerance}</span>
                </div>

                {/* Manual Mode Selector */}
                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                  <span className="text-xs font-bold text-[var(--era-muted)]">{t.stickers.brushMode}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setBrushMode('move')}
                      className={`h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                        brushMode === 'move'
                          ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                          : 'bg-[var(--era-elevated)] text-[var(--era-text)]'
                      }`}
                    >
                      <Move className="w-3.5 h-3.5" />
                      <span>{t.stickers.brushMove}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrushMode('erase')}
                      className={`h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                        brushMode === 'erase'
                          ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                          : 'bg-[var(--era-elevated)] text-[var(--era-text)]'
                      }`}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      <span>{t.stickers.brushErase}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrushMode('restore')}
                      className={`h-8 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                        brushMode === 'restore'
                          ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                          : 'bg-[var(--era-elevated)] text-[var(--era-text)]'
                      }`}
                    >
                      <Paintbrush className="w-3.5 h-3.5" />
                      <span>{t.stickers.brushRestore}</span>
                    </button>
                  </div>
                </div>

                {brushMode !== 'move' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[var(--era-muted)] shrink-0">
                      {t.stickers.textSize}
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={64}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="flex-1 accent-[var(--era-accent)]"
                    />
                  </div>
                )}
              </div>

              {/* Add Text Overlay */}
              <div className="rounded-2xl bg-[var(--era-canvas)] border border-[var(--era-border)] p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4 text-[var(--era-accent)] shrink-0" />
                  <span className="text-xs font-bold text-[var(--era-text)]">{t.stickers.addText}</span>
                </div>
                <input
                  type="text"
                  dir="auto"
                  maxLength={32}
                  value={overlayText}
                  onChange={(e) => setOverlayText(e.target.value)}
                  placeholder={t.stickers.textPlaceholder}
                  className="w-full h-10 px-3.5 rounded-xl bg-[var(--era-elevated)] border border-[var(--era-border)] text-sm text-[var(--era-text)] placeholder:text-[var(--era-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
                />

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTextColor(c)}
                        className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${
                          textColor === c ? 'scale-115 border-[var(--era-accent)]' : 'border-white/30'
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    {(
                      [
                        ['top', t.stickers.posTop],
                        ['center', t.stickers.posCenter],
                        ['bottom', t.stickers.posBottom],
                      ] as const
                    ).map(([pos, label]) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setTextPos(pos)}
                        className={`h-7 px-2.5 rounded-full text-[11px] font-bold cursor-pointer ${
                          textPos === pos
                            ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                            : 'bg-[var(--era-elevated)] text-[var(--era-muted)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {overlayText.trim() && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[var(--era-muted)] shrink-0">
                      {t.stickers.textSize}
                    </span>
                    <input
                      type="range"
                      min={28}
                      max={88}
                      value={textSize}
                      onChange={(e) => setTextSize(Number(e.target.value))}
                      className="flex-1 accent-[var(--era-accent)]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-[var(--era-border)] bg-[var(--era-surface)] flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={!sourceImg || savingMode !== null}
            onClick={() => void handleExportAndSave(false)}
            className="flex-1 h-11 rounded-full bg-[var(--era-elevated)] hover:bg-[var(--era-hover)] text-[var(--era-text)] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
          >
            {savingMode === 'save' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 text-[var(--era-accent)]" />
            )}
            <span>{savingMode === 'save' ? t.stickers.savingSticker : t.stickers.saveSticker}</span>
          </button>
          <button
            type="button"
            disabled={!sourceImg || savingMode !== null}
            onClick={() => void handleExportAndSave(true)}
            className="flex-1 h-11 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
          >
            {savingMode === 'send' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>{savingMode === 'send' ? t.stickers.savingSticker : t.stickers.saveAndSend}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
