"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  busy: boolean;
  busyLabel: string | null;
  compact?: boolean;
}

export function UploadDropzone({
  onFiles,
  busy,
  busyLabel,
  compact = false,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "rounded-2xl border-2 border-dashed transition-colors",
        dragging ? "border-primary bg-accent" : "border-border bg-card",
        busy && "opacity-70",
      )}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-3 rounded-2xl px-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "py-6" : "py-14",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-secondary text-secondary-foreground",
            compact ? "size-10" : "size-14",
          )}
        >
          {busy ? (
            <Loader2 className={cn("animate-spin", compact ? "size-5" : "size-6")} />
          ) : (
            <Upload className={cn(compact ? "size-5" : "size-6")} />
          )}
        </span>

        <span>
          <span
            className={cn(
              "font-heading block font-semibold",
              compact ? "text-base" : "text-lg",
            )}
          >
            {busy ? (busyLabel ?? "Procesando…") : "Subí un libro"}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {busy
              ? "No cierres esta pantalla"
              : "Arrastralo acá o tocá para elegirlo — PDF o EPUB"}
          </span>
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.epub,application/pdf,application/epub+zip"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
