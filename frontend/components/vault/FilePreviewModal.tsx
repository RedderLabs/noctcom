'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Download, Loader2, AlertTriangle,
  File, FileText, Image, Video, Music, Archive, FileCode,
  ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { useVault, type DecryptedNode } from '@/lib/vault-store';
import { cn } from '@/lib/utils';
import {
  classifyFile, getLanguageLabel, isEditable,
  LARGE_FILE_THRESHOLD, MAX_TEXT_PREVIEW_SIZE, type PreviewType,
} from '@/lib/file-preview-utils';

function fileIcon(mime?: string) {
  if (!mime) return File;
  if (mime.startsWith('image/')) return Image;
  if (mime.startsWith('video/')) return Video;
  if (mime.startsWith('audio/')) return Music;
  if (mime.includes('zip') || mime.includes('archive')) return Archive;
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text')) return FileText;
  if (mime.includes('code') || mime.includes('json')) return FileCode;
  return File;
}

function formatSize(bytes?: number) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  node: DecryptedNode | null;
}

export function FilePreviewModal({ open, onClose, node }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>('unknown');
  const [confirmLarge, setConfirmLarge] = useState(false);
  const nodeIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setTextContent(null);
    setError(null);
    setLoading(false);
    setConfirmLarge(false);
    nodeIdRef.current = null;
  }, [blobUrl]);

  useEffect(() => {
    if (!open || !node) {
      cleanup();
      return;
    }

    const type = classifyFile(node.mimeType, node.name);
    setPreviewType(type);

    if (!node.currentVersionId) {
      setError('Este archivo no se subio correctamente. Eliminalo y vuelve a subirlo.');
      return;
    }

    if (node.size > LARGE_FILE_THRESHOLD) {
      setConfirmLarge(true);
      return;
    }

    loadPreview(node, type);

    return () => {
      nodeIdRef.current = null;
    };
  }, [open, node?.id]);

  async function loadPreview(target: DecryptedNode, type: PreviewType) {
    setLoading(true);
    setError(null);
    nodeIdRef.current = target.id;

    try {
      const blob = await useVault.getState().getFileBlob(target);
      if (nodeIdRef.current !== target.id) return;

      if (type === 'text') {
        if (blob.size <= MAX_TEXT_PREVIEW_SIZE) {
          setTextContent(await blob.text());
        } else {
          const partial = await blob.slice(0, MAX_TEXT_PREVIEW_SIZE).text();
          setTextContent(partial + '\n\n--- Archivo truncado (' + formatSize(blob.size) + ') ---');
        }
      }

      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch (err: any) {
      if (nodeIdRef.current === target.id) {
        setError(err.message || 'Error al descifrar archivo');
      }
    } finally {
      if (nodeIdRef.current === target.id) setLoading(false);
    }
  }

  function handleDownload() {
    if (!node) return;
    useVault.getState().downloadFile(node);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !node) return null;

  const FileIcon = fileIcon(node.mimeType);

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />

      {/* Content */}
      <div className="relative flex flex-col h-full m-3 rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] shadow-[var(--shadow-modal)] overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-[var(--color-border-faint)] shrink-0">
          <div className="size-8 rounded-lg bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)] grid place-items-center shrink-0">
            <FileIcon className="size-4 text-[var(--color-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium truncate">{node.name}</h2>
            <p className="text-[10px] text-[var(--color-text-tertiary)]">
              {formatSize(node.size)}
              {node.mimeType && <span className="ml-2 font-mono">{node.mimeType}</span>}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            <Download className="size-3.5 mr-1" /> Descargar
          </Button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-bg-surface-2)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {confirmLarge && (
            <LargeFileWarning
              size={node.size}
              onConfirm={() => {
                setConfirmLarge(false);
                loadPreview(node, previewType);
              }}
              onCancel={onClose}
            />
          )}

          {loading && (
            <div className="h-full grid place-items-center">
              <div className="text-center space-y-3">
                <Loader2 className="size-8 text-violet-400 animate-spin mx-auto" />
                <p className="text-sm text-[var(--color-text-tertiary)]">Descifrando archivo...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="h-full grid place-items-center">
              <div className="text-center space-y-3">
                <AlertTriangle className="size-8 text-red-400 mx-auto" />
                <p className="text-sm text-red-300">{error}</p>
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  Descargar en su lugar
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && !confirmLarge && blobUrl && (
            <>
              {previewType === 'image' && <ImagePreview url={blobUrl} />}
              {previewType === 'video' && <VideoPreview url={blobUrl} />}
              {previewType === 'audio' && <AudioPreview url={blobUrl} name={node.name} />}
              {previewType === 'pdf' && <PdfPreview url={blobUrl} />}
              {previewType === 'text' && <TextPreview content={textContent} name={node.name} />}
              {previewType === 'office' && <NotPreviewable name={node.name} onDownload={handleDownload} message="Los archivos de Office no se pueden previsualizar en el navegador" />}
              {previewType === 'unknown' && <NotPreviewable name={node.name} onDownload={handleDownload} message="Este tipo de archivo no tiene previsualizacion disponible" />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function LargeFileWarning({ size, onConfirm, onCancel }: { size: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center space-y-4 max-w-sm">
        <AlertTriangle className="size-10 text-amber-400 mx-auto" />
        <div>
          <h3 className="text-sm font-medium mb-1">Archivo grande ({formatSize(size)})</h3>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Descifrar este archivo en memoria puede ser lento y consumir bastante RAM.
          </p>
        </div>
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>Continuar</Button>
        </div>
      </div>
    </div>
  );
}

function ImagePreview({ url }: { url: string }) {
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale((s) => Math.max(0.1, Math.min(10, s - e.deltaY * 0.001)));
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--color-border-faint)] shrink-0">
        <button onClick={() => setScale((s) => Math.min(10, s * 1.25))} className="p-1.5 rounded hover:bg-[var(--color-bg-surface-2)] text-[var(--color-text-tertiary)]" title="Zoom in">
          <ZoomIn className="size-4" />
        </button>
        <button onClick={() => setScale((s) => Math.max(0.1, s / 1.25))} className="p-1.5 rounded hover:bg-[var(--color-bg-surface-2)] text-[var(--color-text-tertiary)]" title="Zoom out">
          <ZoomOut className="size-4" />
        </button>
        <button onClick={() => setScale(1)} className="p-1.5 rounded hover:bg-[var(--color-bg-surface-2)] text-[var(--color-text-tertiary)]" title="Reset">
          <RotateCcw className="size-4" />
        </button>
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] ml-2">{Math.round(scale * 100)}%</span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto grid place-items-center p-4" onWheel={handleWheel}>
        <img
          src={url}
          alt="Preview"
          className="max-w-none transition-transform duration-100"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
        />
      </div>
    </div>
  );
}

function VideoPreview({ url }: { url: string }) {
  return (
    <div className="h-full grid place-items-center p-4 bg-black">
      <video src={url} controls autoPlay className="max-h-full max-w-full rounded-lg" />
    </div>
  );
}

function AudioPreview({ url, name }: { url: string; name: string }) {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center space-y-6 p-8">
        <div className="size-24 rounded-2xl bg-violet-500/10 border border-violet-500/20 grid place-items-center mx-auto">
          <Music className="size-10 text-violet-300" />
        </div>
        <h3 className="text-sm font-medium">{name}</h3>
        <audio src={url} controls autoPlay className="w-80" />
      </div>
    </div>
  );
}

function PdfPreview({ url }: { url: string }) {
  return (
    <iframe src={url} className="w-full h-full border-0" title="PDF Preview" />
  );
}

function TextPreview({ content, name }: { content: string | null; name: string }) {
  if (!content) return null;
  const lang = getLanguageLabel(name);
  const editable = isEditable(name);
  const lines = content.split('\n');

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border-faint)] shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-wider text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded">
          {lang}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {lines.length} lineas
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {editable ? (
          <textarea
            defaultValue={content}
            readOnly
            className="w-full h-full p-4 bg-transparent text-sm font-mono text-[var(--color-text-secondary)] leading-relaxed resize-none focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <div className="flex text-sm font-mono leading-relaxed">
            <div className="shrink-0 py-4 pl-4 pr-3 text-right select-none border-r border-[var(--color-border-faint)]">
              {lines.map((_, i) => (
                <div key={i} className="text-[var(--color-text-muted)] text-xs">{i + 1}</div>
              ))}
            </div>
            <pre className="flex-1 p-4 overflow-x-auto">
              <code className="text-[var(--color-text-secondary)]">{content}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function NotPreviewable({ name, onDownload, message }: { name: string; onDownload: () => void; message: string }) {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center space-y-4 max-w-sm">
        <div className="size-16 rounded-2xl bg-[var(--color-bg-surface-2)] border border-[var(--color-border-faint)] grid place-items-center mx-auto">
          <File className="size-7 text-[var(--color-text-tertiary)]" />
        </div>
        <div>
          <h3 className="text-sm font-medium mb-1">{name}</h3>
          <p className="text-xs text-[var(--color-text-tertiary)]">{message}</p>
        </div>
        <Button variant="primary" size="sm" onClick={onDownload}>
          <Download className="size-3.5 mr-1" /> Descargar archivo
        </Button>
      </div>
    </div>
  );
}
