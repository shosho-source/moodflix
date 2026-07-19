"use client";

import { useCallback, useEffect } from "react";

interface TrailerModalProps {
  trailerKey: string;
  onClose: () => void;
}

export default function TrailerModal({ trailerKey, onClose }: TrailerModalProps) {
  const handleClose = useCallback(() => onClose(), [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="relative w-full max-w-5xl aspect-video bg-black rounded-[var(--md-shape-xl)] overflow-hidden shadow-2xl ring-1 ring-white/10">
        <div className="absolute top-4 right-4 z-10 bg-black/40 hover:bg-black/80 rounded-full backdrop-blur-md transition-colors text-white">
          <md-icon-button onClick={handleClose}>
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>
        <iframe
          src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
          title="Trailer"
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
