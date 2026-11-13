import * as Mp4Muxer from 'mp4-muxer';
import * as WebMMuxer from 'webm-muxer';

export const MAX_STORY_VIDEO_SECONDS = 120;
export const MAX_STORY_BASE64_CHARS = 7_500_000;

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export interface CompressedVideoResult {
  dataUrl: string;
  blob: Blob;
  duration: number;
  originalBytes: number;
  compressedBytes: number;
}

export function formatVideoDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read video data.'));
    };
    reader.onerror = () => reject(new Error('Could not read video data.'));
    reader.readAsDataURL(blob);
  });
}

export async function readVideoMetadata(file: File): Promise<VideoMetadata> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
      };
      video.onloadedmetadata = () => {
        cleanup();
        resolve();
      };
      video.onerror = () => {
        cleanup();
        reject(new Error('Unsupported or corrupted video file.'));
      };
      video.src = objectUrl;
    });

    let duration = video.duration;
    // Some WebM files report Infinity until seeked to the end
    if (!Number.isFinite(duration) || duration <= 0) {
      await new Promise<void>((resolve) => {
        const done = () => {
          video.ontimeupdate = null;
          video.onseeked = null;
          resolve();
        };
        const timer = window.setTimeout(done, 1500);
        video.onseeked = () => {
          window.clearTimeout(timer);
          done();
        };
        video.ontimeupdate = () => {
          window.clearTimeout(timer);
          done();
        };
        video.currentTime = 1e101;
      });
      duration = video.duration;
      video.currentTime = 0;
    }

    return {
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
      width: video.videoWidth || 720,
      height: video.videoHeight || 1280,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function makeEven(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.005 && video.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      window.clearTimeout(timeoutId);
      resolve();
    };
    const onSeeked = () => finish();
    const timeoutId = window.setTimeout(finish, 300);
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = time;
  });
}

async function compressWithWebCodecs(
  file: File,
  meta: VideoMetadata,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('WebCodecs unavailable');
  }

  const duration = Math.min(meta.duration, MAX_STORY_VIDEO_SECONDS);
  const maxDim = duration <= 30 ? 720 : duration <= 75 ? 540 : 480;
  const scale = Math.min(1, maxDim / Math.max(meta.width, meta.height));
  const targetWidth = makeEven(meta.width * scale);
  const targetHeight = makeEven(meta.height * scale);
  const fps = duration <= 30 ? 24 : duration <= 75 ? 20 : 16;
  const videoBitrate = duration <= 20 ? 750_000 : duration <= 60 ? 450_000 : 280_000;

  let container: 'mp4' | 'webm' | null = null;
  let videoCodecString = '';

  for (const avcCandidate of ['avc1.42001E', 'avc1.42E01E', 'avc1.4D401E']) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: avcCandidate,
        width: targetWidth,
        height: targetHeight,
        bitrate: videoBitrate,
        framerate: fps,
      });
      if (support.supported) {
        container = 'mp4';
        videoCodecString = avcCandidate;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  if (!container) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: 'vp8',
        width: targetWidth,
        height: targetHeight,
        bitrate: videoBitrate,
        framerate: fps,
      });
      if (support.supported) {
        container = 'webm';
        videoCodecString = 'vp8';
      }
    } catch {
      // unavailable
    }
  }

  if (!container) {
    throw new Error('No supported WebCodecs video encoder found');
  }

  onProgress?.(4);

  // Try decoding audio offscreen in one fast pass
  let decodedAudio: AudioBuffer | null = null;
  let audioCodecString = '';
  if (typeof AudioEncoder !== 'undefined' && typeof AudioContext !== 'undefined') {
    try {
      const arrayBuf = await file.arrayBuffer();
      const audioCtx = new AudioContext();
      try {
        decodedAudio = await audioCtx.decodeAudioData(arrayBuf);
      } finally {
        await audioCtx.close().catch(() => {});
      }

      if (decodedAudio) {
        const candidateAudioCodec = container === 'mp4' ? 'mp4a.40.2' : 'opus';
        const channels = Math.min(2, decodedAudio.numberOfChannels);
        const audioSupport = await AudioEncoder.isConfigSupported({
          codec: candidateAudioCodec,
          numberOfChannels: channels,
          sampleRate: decodedAudio.sampleRate,
          bitrate: container === 'mp4' ? 64_000 : 48_000,
        });
        if (audioSupport.supported) {
          audioCodecString = candidateAudioCodec;
        } else {
          decodedAudio = null;
        }
      }
    } catch {
      decodedAudio = null;
    }
  }

  const audioChannels = decodedAudio ? Math.min(2, decodedAudio.numberOfChannels) : 0;

  let encoderFailure: Error | null = null;

  const mp4Muxer =
    container === 'mp4'
      ? new Mp4Muxer.Muxer({
          target: new Mp4Muxer.ArrayBufferTarget(),
          video: {
            codec: 'avc',
            width: targetWidth,
            height: targetHeight,
            frameRate: fps,
          },
          audio:
            decodedAudio && audioCodecString
              ? {
                  codec: 'aac',
                  numberOfChannels: audioChannels,
                  sampleRate: decodedAudio.sampleRate,
                }
              : undefined,
          fastStart: 'in-memory',
        })
      : null;

  const webmMuxer =
    container === 'webm'
      ? new WebMMuxer.Muxer({
          target: new WebMMuxer.ArrayBufferTarget(),
          video: {
            codec: 'V_VP8',
            width: targetWidth,
            height: targetHeight,
            frameRate: fps,
          },
          audio:
            decodedAudio && audioCodecString
              ? {
                  codec: 'A_OPUS',
                  numberOfChannels: audioChannels,
                  sampleRate: decodedAudio.sampleRate,
                }
              : undefined,
        })
      : null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, metaChunk) => {
      mp4Muxer?.addVideoChunk(chunk, metaChunk);
      webmMuxer?.addVideoChunk(chunk, metaChunk);
    },
    error: (err) => {
      encoderFailure = err instanceof Error ? err : new Error(String(err));
    },
  });

  videoEncoder.configure({
    codec: videoCodecString,
    width: targetWidth,
    height: targetHeight,
    bitrate: videoBitrate,
    framerate: fps,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (decodedAudio && audioCodecString) {
    audioEncoder = new AudioEncoder({
      output: (chunk, metaChunk) => {
        mp4Muxer?.addAudioChunk(chunk, metaChunk);
        webmMuxer?.addAudioChunk(chunk, metaChunk);
      },
      error: (err) => {
        console.warn('Audio compression warning:', err);
      },
    });
    audioEncoder.configure({
      codec: audioCodecString,
      numberOfChannels: audioChannels,
      sampleRate: decodedAudio.sampleRate,
      bitrate: container === 'mp4' ? 64_000 : 48_000,
    });
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Could not initialize video compression canvas.');
  }

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode video frames.'));
      video.src = objectUrl;
    });

    const totalFrames = Math.max(1, Math.floor(duration * fps));
    const frameDurationUs = Math.round(1_000_000 / fps);

    for (let i = 0; i < totalFrames; i += 1) {
      if (encoderFailure) throw encoderFailure;
      const t = Math.min(i / fps, Math.max(0, duration - 0.02));
      await seekVideoTo(video, t);
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i / fps) * 1_000_000),
        duration: frameDurationUs,
      });

      while (videoEncoder.encodeQueueSize > 6) {
        await sleep(5);
      }

      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      onProgress?.(Math.min(88, 5 + Math.round(((i + 1) / totalFrames) * 83)));
    }

    if (audioEncoder && decodedAudio) {
      const sampleRate = decodedAudio.sampleRate;
      const maxAudioSamples = Math.min(decodedAudio.length, Math.floor(duration * sampleRate));
      const chunkFrames = Math.min(sampleRate, 16384);
      for (let offset = 0; offset < maxAudioSamples; offset += chunkFrames) {
        const len = Math.min(chunkFrames, maxAudioSamples - offset);
        const planar = new Float32Array(len * audioChannels);
        for (let ch = 0; ch < audioChannels; ch += 1) {
          const channelSlice = decodedAudio.getChannelData(ch).subarray(offset, offset + len);
          planar.set(channelSlice, ch * len);
        }
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: len,
          numberOfChannels: audioChannels,
          timestamp: Math.round((offset / sampleRate) * 1_000_000),
          data: planar,
        });
        while (audioEncoder.encodeQueueSize > 8) {
          await sleep(5);
        }
        audioEncoder.encode(audioData);
        audioData.close();
      }
      await audioEncoder.flush();
      audioEncoder.close();
      onProgress?.(94);
    }

    await videoEncoder.flush();
    videoEncoder.close();
    if (encoderFailure) throw encoderFailure;

    if (mp4Muxer) {
      mp4Muxer.finalize();
      onProgress?.(98);
      return new Blob([mp4Muxer.target.buffer], { type: 'video/mp4' });
    }
    if (webmMuxer) {
      webmMuxer.finalize();
      onProgress?.(98);
      return new Blob([webmMuxer.target.buffer], { type: 'video/webm' });
    }

    throw new Error('Muxer finalization failed');
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressStoryVideo(
  file: File,
  options: {
    metadata: VideoMetadata;
    maxSeconds?: number;
    onProgress?: (pct: number) => void;
  }
): Promise<CompressedVideoResult> {
  const { metadata, maxSeconds = MAX_STORY_VIDEO_SECONDS, onProgress } = options;
  const duration = Math.min(metadata.duration, maxSeconds);

  // Fast-pass if already very small and within 720p
  if (file.size <= 520 * 1024 && Math.max(metadata.width, metadata.height) <= 720) {
    onProgress?.(60);
    const dataUrl = await blobToDataUrl(file);
    onProgress?.(100);
    return {
      dataUrl,
      blob: file,
      duration,
      originalBytes: file.size,
      compressedBytes: file.size,
    };
  }

  let outputBlob: Blob = file;
  try {
    const compressedBlob = await compressWithWebCodecs(
      file,
      { ...metadata, duration },
      onProgress
    );
    if (compressedBlob.size > 0 && (compressedBlob.size < file.size || file.size > 5 * 1024 * 1024)) {
      outputBlob = compressedBlob;
    }
  } catch (err) {
    console.warn('WebCodecs compression fallback to direct upload:', err);
  }

  onProgress?.(99);
  const dataUrl = await blobToDataUrl(outputBlob);
  if (dataUrl.length > MAX_STORY_BASE64_CHARS) {
    throw new Error(
      'Compressed video is still too large to store. Please choose a shorter or lower-resolution clip.'
    );
  }

  onProgress?.(100);
  return {
    dataUrl,
    blob: outputBlob,
    duration,
    originalBytes: file.size,
    compressedBytes: outputBlob.size,
  };
}
