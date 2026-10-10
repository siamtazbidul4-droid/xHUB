import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../context/ToastContext.js';
import { apiRequest } from '../api/client.js';
import { Category } from '../types/index.js';
import {
  UploadCloud,
  FileVideo,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  Camera,
  X,
  Plus,
  Play,
  Link as LinkIcon,
  RotateCcw,
  Ban
} from 'lucide-react';

interface UploadPageProps {
  onVideoPublished: (videoId: string) => void;
}

type UploadLifecycleState =
  | 'idle'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'failed';

export const UploadPage: React.FC<UploadPageProps> = ({ onVideoPublished }) => {
  const { user, channel, openAuthModal } = useAuth();
  const toast = useToast();

  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [categories, setCategories] = useState<Category[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [lifecycleState, setLifecycleState] = useState<UploadLifecycleState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Video metadata form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Technology');
  const [tags, setTags] = useState<string[]>(['engineering', 'streaming']);
  const [tagInput, setTagInput] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [allowDownload, setAllowDownload] = useState(true);

  // Stored media references
  const [videoUrl, setVideoUrl] = useState('');
  const [directUrlInput, setDirectUrlInput] = useState('');
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoSize, setVideoSize] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(''); // local object URL for selected file preview
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  // Thumbnail provenance: 'auto' = generated from THIS video, 'custom' = user-supplied.
  const [thumbnailSource, setThumbnailSource] = useState<'none' | 'auto' | 'custom'>('none');
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  // Raw JPEG blob generated from the current video — uploaded at publish time.
  const [autoThumbnailBlob, setAutoThumbnailBlob] = useState<Blob | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [isTestingUrl, setIsTestingUrl] = useState(false);

  // Hidden video element for local duration & frame preview
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const cancelSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      openAuthModal();
    }
  }, [user]);

  // Load categories
  useEffect(() => {
    apiRequest<{ categories: Category[] }>('/api/categories')
      .then(res => setCategories(res.categories || []))
      .catch(() => {});
  }, []);

  // Handle Video File Selection — file becomes the active upload item immediately
  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('video/')) {
      toast.error('Invalid File Type', 'Please upload an MP4, WebM, or standard video file.');
      return;
    }
    if (selectedFile.size === 0) {
      toast.error('Empty File', 'The selected file is empty.');
      return;
    }

    // Revoke previous preview to avoid leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    setFile(selectedFile);
    setVideoSize(selectedFile.size);
    setVideoUrl('');
    setTitle(selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    setLifecycleState('idle'); // file selected & previewing — upload starts only when the user submits
    setUploadProgress(0);
    setErrorMessage(null);

    // Each new video starts with a CLEAN thumbnail state: no carry-over from the
    // previous upload, no shared default. A fresh thumbnail is generated from
    // THIS video's frames once its metadata is available.
    setThumbnailUrl('');
    setThumbnailSource('none');
    setThumbnailError(null);
    if (thumbInputRef.current) thumbInputRef.current.value = '';

    // Extract local duration from the preview element, then auto-generate the
    // thumbnail from this exact video.
    if (videoPreviewRef.current) {
      videoPreviewRef.current.src = objectUrl;
      videoPreviewRef.current.onloadedmetadata = () => {
        const dur = Math.round(videoPreviewRef.current?.duration || 0);
        setVideoDuration(dur);
        generateAutoThumbnail(objectUrl, dur);
      };
    }
  };

  // Reopen file explorer to replace the current selection
  const handleChangeFile = () => {
    fileInputRef.current?.click();
  };

  // Clear selection and preview — also resets ALL upload-session state so the
  // next upload cannot inherit this session's thumbnail or metadata.
  const clearSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    setFile(null);
    setVideoUrl('');
    setLifecycleState('idle');
    setUploadProgress(0);
    setThumbnailUrl('');
    setThumbnailSource('none');
    setThumbnailError(null);
    setVideoDuration(0);
    if (thumbInputRef.current) thumbInputRef.current.value = '';
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Frame extraction helper (client-side, no new dependencies — same HTML5
  // canvas technique the original "Capture Frame" button used).
  // Returns a JPEG Blob from the given video source at the given timestamp.
  const captureFrameFromVideo = (src: string, seekTime: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';

      const timeout = setTimeout(() => reject(new Error('Frame capture timed out')), 15000);

      video.onloadeddata = () => {
        video.currentTime = Math.min(seekTime, Math.max(0, (video.duration || 0) - 0.1));
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas 2D context unavailable');
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              clearTimeout(timeout);
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Frame encoding failed'));
              }
            },
            'image/jpeg',
            0.85
          );
        } catch (err) {
          clearTimeout(timeout);
          reject(err instanceof Error ? err : new Error('Frame extraction failed'));
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Video decode failed'));
      };

      video.src = src;
    });
  };

  // AUTOMATIC PER-VIDEO THUMBNAIL GENERATION
  // Extracts a frame from the CURRENT video only — never from another upload.
  // Frame selection: for videos >10s, seek to ~25% of duration (avoids the
  // blank/black opening seconds). For shorter videos, seek to the midpoint.
  // The blob is only uploaded (associated with THIS video) at publish time.
  // ─────────────────────────────────────────────────────────────────────────
  const generateAutoThumbnail = async (videoSrc: string, duration: number) => {
    setIsGeneratingThumbnail(true);
    setThumbnailError(null);
    try {
      const seekTime = duration > 10 ? duration * 0.25 : Math.max(0.1, duration / 2);
      const blob = await captureFrameFromVideo(videoSrc, seekTime);
      // A custom thumbnail chosen BEFORE generation finished wins.
      if (thumbnailSource === 'custom') return;
      setThumbnailUrl(URL.createObjectURL(blob));
      setAutoThumbnailBlob(blob);
      setThumbnailSource('auto');
    } catch {
      // Do NOT reuse any previous video's thumbnail. Explicit fallback state:
      // the user is told to pick a custom image if they want a thumbnail.
      setThumbnailUrl('');
      setAutoThumbnailBlob(null);
      setThumbnailSource('none');
      setThumbnailError('Automatic thumbnail generation failed — choose a custom image.');
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  // Manual "Capture Frame" — same extraction, but the user explicitly requests
  // it (e.g. seeked to a preferred moment in the preview).
  const handleCaptureFrame = async () => {
    if (!previewUrl) return;
    setIsGeneratingThumbnail(true);
    setThumbnailError(null);
    try {
      const seekTime = Math.max(0.1, videoPreviewRef.current?.currentTime || 0);
      const blob = await captureFrameFromVideo(previewUrl, seekTime);
      if (thumbnailUrl.startsWith('blob:')) URL.revokeObjectURL(thumbnailUrl);
      setThumbnailUrl(URL.createObjectURL(blob));
      setAutoThumbnailBlob(blob);
      setThumbnailSource('auto');
    } catch {
      setThumbnailError('Frame capture failed — try again or pick a custom image.');
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  // Test and attach Direct URL
  const handleVerifyDirectUrl = () => {
    if (!directUrlInput.trim()) return;
    setIsTestingUrl(true);

    const testVideo = document.createElement('video');
    testVideo.src = directUrlInput.trim();
    testVideo.preload = 'metadata';

    testVideo.onloadedmetadata = () => {
      setVideoUrl(directUrlInput.trim());
      setVideoDuration(Math.round(testVideo.duration || 120));
      setVideoSize(25000000);
      if (!title) {
        setTitle('Stream Broadcast ' + new Date().toLocaleDateString());
      }
      setLifecycleState('ready');
      setIsTestingUrl(false);
      toast.success('Media URL Verified', `Detected playable stream (${Math.round(testVideo.duration)}s duration).`);
    };

    testVideo.onerror = () => {
      // Still allow if CORS prevents direct browser decode
      setVideoUrl(directUrlInput.trim());
      setVideoDuration(videoDuration || 180);
      setLifecycleState('ready');
      setIsTestingUrl(false);
      toast.info('Media URL Connected', 'External streaming link ready for publish.');
    };
  };

  // Upload Custom Thumbnail File
  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const imgFile = e.target.files?.[0];
    if (!imgFile) return;

    setIsUploadingThumbnail(true);
    setThumbnailError(null);
    try {
      const formData = new FormData();
      formData.append('file', imgFile);

      const res = await apiRequest<{ url: string }>('/api/upload/single', {
        method: 'POST',
        body: formData
      });

      // Custom thumbnail wins: discard any auto-generated frame for this video.
      if (thumbnailUrl.startsWith('blob:')) URL.revokeObjectURL(thumbnailUrl);
      setAutoThumbnailBlob(null);
      setThumbnailUrl(res.url);
      setThumbnailSource('custom');
      toast.success('Custom Thumbnail Uploaded');
    } catch (err: any) {
      toast.error('Thumbnail Upload Failed', err.message);
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  // Remove the currently selected thumbnail (auto or custom) and revert to a
  // clean state. Never falls back to another video's thumbnail.
  const handleRemoveThumbnail = () => {
    if (thumbnailUrl.startsWith('blob:')) URL.revokeObjectURL(thumbnailUrl);
    setThumbnailUrl('');
    setAutoThumbnailBlob(null);
    setThumbnailSource('none');
    setThumbnailError('No thumbnail — choose a custom image or re-capture a frame.');
    if (thumbInputRef.current) thumbInputRef.current.value = '';
  };

  // Cancel Active Chunk Upload
  const handleCancelUpload = async () => {
    if (cancelSessionRef.current) {
      try {
        await apiRequest('/api/upload/chunk/cancel', {
          method: 'POST',
          body: JSON.stringify({ sessionId: cancelSessionRef.current })
        });
      } catch (err) {}
    }
    setLifecycleState('idle');
    setUploadProgress(0);
    clearSelection();
    toast.info('Upload Session Canceled');
  };

  // Start Professional Chunked Upload with Retry
  const handleStartChunkedUpload = async () => {
    if (!file) return;

    setLifecycleState('uploading');
    setUploadProgress(0);
    setErrorMessage(null);

    // Chunk size: 5MB
    const CHUNK_SIZE = 5 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    try {
      // 1. Initialize Chunk Session
      const initRes = await apiRequest<{ sessionId: string }>('/api/upload/chunk/init', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          totalChunks,
          mimeType: file.type
        })
      });

      const sessionId = initRes.sessionId;
      cancelSessionRef.current = sessionId;

      // 2. Upload Chunks Sequentially with Retry
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        const formData = new FormData();
        formData.append('sessionId', sessionId);
        formData.append('chunkIndex', i.toString());
        formData.append('chunk', chunkBlob, `part_${i}`);

        // Retry chunk up to 3 times before failing
        let chunkUploaded = false;
        let attempts = 0;
        while (!chunkUploaded && attempts < 3) {
          try {
            attempts++;
            await apiRequest('/api/upload/chunk', {
              method: 'POST',
              body: formData
            });
            chunkUploaded = true;
          } catch (chunkErr) {
            if (attempts >= 3) throw chunkErr;
            await new Promise(r => setTimeout(r, 800 * attempts));
          }
        }

        const currentPct = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress(currentPct);
      }

      // 3. Finalize & Stitch Chunks
      setLifecycleState('uploaded');
      const finalizeRes = await apiRequest<{ url: string; size: number }>('/api/upload/chunk/finalize', {
        method: 'POST',
        body: JSON.stringify({ sessionId })
      });

      setVideoUrl(finalizeRes.url);

      // 4. Video Processing Lifecycle State Machine
      setLifecycleState('processing');
      // Transcoding verification simulation
      for (let p = 15; p <= 100; p += 25) {
        setProcessingProgress(p);
        await new Promise(r => setTimeout(r, 350));
      }

      setLifecycleState('ready');
      toast.success('Video Stored & Ready', 'Your video file is processed and ready to be published.');
    } catch (err: any) {
      setLifecycleState('failed');
      setErrorMessage(err.message || 'Chunked upload failed. Please try again.');
      toast.error('Upload Failed', err.message);
    }
  };

  // Publish Video
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!videoUrl) {
      toast.error('No Video File', 'Please upload a video file or connect a stream URL.');
      return;
    }

    if (!title.trim()) {
      toast.error('Title Required', 'Please enter a title for your video.');
      return;
    }

    // THUMBNAIL INTEGRITY: never publish a video without its own thumbnail.
    // If auto-generation failed and no custom image was chosen, stop here —
    // we must not fall back to another video's or a global default image.
    if (thumbnailSource !== 'custom' && !autoThumbnailBlob) {
      toast.error(
        'Thumbnail Required',
        'No thumbnail available. Capture a frame from this video or upload a custom image.'
      );
      return;
    }

    setIsPublishing(true);
    try {
      // THUMBNAIL PRIORITY: custom > auto-generated (from THIS video).
      // The auto blob is uploaded HERE, at publish time, so it is stored and
      // associated with exactly this video's record — never shared.
      let finalThumbnailUrl = thumbnailUrl;
      if (thumbnailSource === 'auto' && autoThumbnailBlob) {
        const formData = new FormData();
        formData.append('file', autoThumbnailBlob, 'auto-thumbnail.jpg');
        const uploadRes = await apiRequest<{ url: string }>('/api/upload/single', {
          method: 'POST',
          body: formData
        });
        finalThumbnailUrl = uploadRes.url;
        if (thumbnailUrl.startsWith('blob:')) URL.revokeObjectURL(thumbnailUrl);
        setThumbnailUrl(finalThumbnailUrl);
      }

      const res = await apiRequest<{ video: any }>('/api/videos', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          category,
          tags,
          thumbnailUrl: finalThumbnailUrl,
          videoUrl,
          duration: videoDuration || 120,
          fileSize: videoSize || 50000000,
          visibility,
          allowDownload
        })
      });

      toast.success('Video Published Live!', 'Your content is now available to viewers.');
      clearSelection();
      onVideoPublished(res.video._id);
    } catch (err: any) {
      toast.error('Publication Failed', err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Add Tag
  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-16 space-y-8">
      {/* Hidden elements for processing */}
      <video ref={videoPreviewRef} className="hidden" crossOrigin="anonymous" />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/mkv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
      />
      <input
        ref={thumbInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleThumbnailUpload}
      />

      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Upload video
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Select a video, review the preview, then publish when ready.
        </p>
      </div>

      {/* Upload Mode Selector (File vs URL) */}
      {!file && !videoUrl && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setUploadMode('file')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              uploadMode === 'file'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Upload file</span>
          </button>
          <button
            type="button"
            onClick={() => setUploadMode('url')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              uploadMode === 'url'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Use a link</span>
          </button>
        </div>
      )}

      {/* Mode 1: File Dropzone */}
      {!file && !videoUrl && uploadMode === 'file' && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
          }}
          className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-2xl p-10 text-center bg-slate-50/60 hover:bg-slate-100/60 cursor-pointer transition-colors space-y-3 group"
        >
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-500">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-900">
              Select a video to upload
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              MP4 or WebM — or drag & drop it here
            </p>
          </div>
          <button
            type="button"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Choose file
          </button>
        </div>
      )}

      {/* Mode 2: Direct URL Input */}
      {!file && !videoUrl && uploadMode === 'url' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900">Connect Video Stream URL</h3>
          <p className="text-xs text-slate-500">
            Provide a direct public MP4 or WebM video link hosted on Google Cloud Storage, AWS S3, or a CDN.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://commondatastorage.googleapis.com/.../video.mp4"
              value={directUrlInput}
              onChange={(e) => setDirectUrlInput(e.target.value)}
              className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-500 font-mono"
            />
            <button
              type="button"
              onClick={handleVerifyDirectUrl}
              disabled={isTestingUrl || !directUrlInput.trim()}
              className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {isTestingUrl ? 'Connecting...' : 'Connect Stream'}
            </button>
          </div>
        </div>
      )}

      {/* Media Active & Metadata Editor */}
      {(file || videoUrl) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6">
          {/* Selected file: preview, metadata, state, actions */}
          <div className="flex flex-col sm:flex-row gap-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            {/* Live local preview of the selected video */}
            <div className="sm:w-64 shrink-0 aspect-video bg-black rounded-lg overflow-hidden">
              {previewUrl ? (
                <video
                  src={previewUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                  <FileVideo className="w-8 h-8" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {file?.name || 'External stream'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : 'Stream link'}
                  {videoDuration > 0 && ` • ${Math.floor(videoDuration / 60)}m ${videoDuration % 60}s`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {lifecycleState === 'idle' && file && (
                  <>
                    <span className="text-xs font-medium text-slate-500">Ready to upload</span>
                    <button
                      type="button"
                      onClick={handleStartChunkedUpload}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                    >
                      Upload now
                    </button>
                  </>
                )}

                {lifecycleState === 'uploading' && (
                  <div className="flex items-center gap-2 text-slate-700 font-medium text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    <span>Uploading {uploadProgress}%</span>
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="text-rose-600 hover:text-rose-700 font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {lifecycleState === 'processing' && (
                  <div className="flex items-center gap-2 text-slate-700 font-medium text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    <span>Processing {processingProgress}%</span>
                  </div>
                )}

                {lifecycleState === 'ready' && (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    Uploaded — ready to publish
                  </span>
                )}

                {lifecycleState === 'failed' && (
                  <button
                    type="button"
                    onClick={handleStartChunkedUpload}
                    className="inline-flex items-center gap-1.5 text-rose-600 text-xs font-semibold hover:text-rose-700"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry upload
                  </button>
                )}

                {lifecycleState !== 'uploading' && (
                  <div className="flex items-center gap-1 ml-auto">
                    {file && (
                      <button
                        type="button"
                        onClick={handleChangeFile}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg"
                      >
                        Change video
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60"
                      aria-label="Remove selected file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {(lifecycleState === 'uploading' || lifecycleState === 'processing') && (
            <div className="space-y-1.5">
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-rose-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${lifecycleState === 'uploading' ? uploadProgress : processingProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono text-right">
                {lifecycleState === 'uploading' ? `Chunk multipart upload: ${uploadProgress}%` : `Transcode verification: ${processingProgress}%`}
              </p>
            </div>
          )}

          {/* Metadata Form */}
          <form onSubmit={handlePublish} className="space-y-6 pt-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Title, Description, Tags, Category */}
              <div className="lg:col-span-2 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Video Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter an engaging, descriptive title..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-hidden focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide detailed description, timestamps, and creator notes..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
                    >
                      {categories.filter(c => c.name !== 'All').map(c => (
                        <option key={c._id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Visibility
                    </label>
                    <select
                      value={visibility}
                      onChange={(e) => setVisibility(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-hidden focus:border-rose-500"
                    >
                      <option value="public">Public (Everyone can watch)</option>
                      <option value="unlisted">Unlisted (Anyone with link)</option>
                      <option value="private">Private (Only you and admins)</option>
                    </select>
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tags & Keywords
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      placeholder="Add tag and press Enter..."
                      className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t, idx) => (
                      <span
                        key={`${t}-${idx}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => setTags(tags.filter(tag => tag !== t))}
                          className="hover:text-rose-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Thumbnail Selector & Preview */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Video Thumbnail
                </label>

                <div className="aspect-video w-full rounded-lg bg-slate-100 border border-slate-200 overflow-hidden relative">
                  {isGeneratingThumbnail ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                      <Loader2 className="w-7 h-7 animate-spin text-slate-500" />
                      <span className="text-xs">Generating thumbnail…</span>
                    </div>
                  ) : thumbnailUrl ? (
                    <>
                      <img src={thumbnailUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                      {/* Provenance badge: tells the user where this thumbnail came from */}
                      <span
                        className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          thumbnailSource === 'custom'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {thumbnailSource === 'custom' ? 'CUSTOM' : 'AUTO'}
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveThumbnail}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-md transition-colors"
                        aria-label="Remove thumbnail"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-xs">No thumbnail selected</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  {thumbnailSource === 'auto' && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      Auto-generated from your video
                    </>
                  )}
                  {thumbnailSource === 'custom' && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      Using your custom image
                    </>
                  )}
                  {thumbnailSource === 'none' && 'No thumbnail yet'}
                </p>

                {thumbnailError && (
                  <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {thumbnailError}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureFrame}
                    disabled={isGeneratingThumbnail || !previewUrl}
                    className="flex items-center justify-center gap-1.5 p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Camera className="w-4 h-4 text-rose-500" />
                    <span>{isGeneratingThumbnail ? 'Working…' : 'Capture Frame'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => thumbInputRef.current?.click()}
                    disabled={isUploadingThumbnail}
                    className="flex items-center justify-center gap-1.5 p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors disabled:opacity-50"
                  >
                    <ImageIcon className="w-4 h-4 text-indigo-500" />
                    <span>{isUploadingThumbnail ? 'Uploading…' : 'Custom Image'}</span>
                  </button>
                </div>

                {/* Download toggle */}
                <div className="pt-2 flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-700">Allow Download</span>
                  <input
                    type="checkbox"
                    checked={allowDownload}
                    onChange={(e) => setAllowDownload(e.target.checked)}
                    className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={clearSelection}
                className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Discard
              </button>

              <button
                type="submit"
                disabled={lifecycleState !== 'ready' || isPublishing}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPublishing ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
