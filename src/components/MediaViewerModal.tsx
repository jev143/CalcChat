import React, { useState } from 'react';
import {
  X,
  Download,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import { MessageType } from '../types';

interface MediaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaType: MessageType;
  fileName?: string;
  senderName?: string;
  fileSize?: number;
  timestamp?: number;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  onClose,
  mediaUrl,
  mediaType,
  fileName,
  senderName,
  fileSize,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!isOpen || !mediaUrl) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(3, prev + 0.25));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.5, prev - 0.25));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Create blob anchor for reliable download
      const response = await fetch(mediaUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || (mediaType === 'image' ? 'photo.jpg' : mediaType === 'video' ? 'video.mp4' : 'document');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback
      window.open(mediaUrl, '_blank');
    }
  };

  return (
    <div
      id="media-viewer-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      {/* Viewer Shell */}
      <div
        id="media-viewer-card"
        className="relative max-w-5xl max-h-[92vh] w-full flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Controls */}
        <div className="w-full flex items-center justify-between py-2 px-3 text-neutral-300 bg-neutral-900/70 backdrop-blur-md rounded-t-2xl border-t border-x border-neutral-800">
          <div className="flex items-center gap-2 text-xs truncate max-w-md">
            <span className="font-semibold text-neutral-100 truncate">
              {fileName || (mediaType === 'image' ? 'Photo' : mediaType === 'video' ? 'Video' : 'Document')}
            </span>
            {senderName && (
              <span className="text-neutral-400">
                • Sent by <strong className="text-neutral-200">{senderName}</strong>
              </span>
            )}
            {fileSize && (
              <span className="text-neutral-500 font-mono">({formatFileSize(fileSize)})</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {mediaType === 'image' && (
              <>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
                  title="Rotate"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleDownload}
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Download File"
            >
              <Download className="w-4 h-4" />
            </button>

            <a
              href={mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-red-400 transition-colors"
              title="Close viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media Preview Box */}
        <div className="w-full min-h-[360px] max-h-[78vh] flex items-center justify-center overflow-auto rounded-b-2xl border border-neutral-800 bg-neutral-950/90 shadow-2xl p-4">
          {mediaType === 'image' && (
            <div className="flex items-center justify-center w-full h-full overflow-hidden">
              <img
                src={mediaUrl}
                alt={fileName || 'Image'}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-lg"
              />
            </div>
          )}

          {mediaType === 'video' && (
            <div className="flex items-center justify-center w-full">
              <video
                src={mediaUrl}
                controls
                autoPlay
                className="max-h-[70vh] max-w-full rounded-xl shadow-lg"
              />
            </div>
          )}

          {mediaType === 'file' && (
            <div className="py-12 px-6 flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-xl">
                <FileText className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-neutral-100">{fileName || 'Document File'}</h3>
                {fileSize && (
                  <p className="text-xs text-neutral-400 font-mono">
                    Size: {formatFileSize(fileSize)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleDownload}
                className="mt-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-950 hover:scale-105"
              >
                <Download className="w-4 h-4" />
                <span>Download Attachment</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
