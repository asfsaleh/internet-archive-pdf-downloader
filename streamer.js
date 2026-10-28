/**
 * Internet Archive PDF Downloader - Resilient Parallel Streamer Engine
 * @author Abu Saleh <https://abusaleh.pro.bd/>
 * @github https://github.com/asfsaleh
 * @copyright (c) 2026 Abu Saleh. All rights reserved.
 * Handles concurrency, rate-limiting (429/503), exponential backoff, and live metrics.
 */

class UniversalBookStreamer {
  /**
   * @param {Object} options
   * @param {Function} options.urlResolver - (leafIndex, scale) => string
   * @param {number} options.scale - Resolution scale factor (1, 2, 4)
   * @param {number} options.concurrency - Concurrent workers (default 3)
   * @param {Function} options.onProgress - (stats) => void
   * @param {Function} options.onLog - (msg, type) => void
   */
  constructor(options) {
    this.urlResolver = options.urlResolver;
    this.scale = options.scale || 2;
    this.concurrency = options.concurrency || 3;
    this.onProgress = options.onProgress || (() => {});
    this.onLog = options.onLog || (() => {});

    this.isRunning = false;
    this.isPaused = false;
    this.abortController = null;

    this.pages = [];
    this.failedLeaves = [];
    this.totalBytes = 0;
    this.startTime = 0;
  }

  /**
   * Fetches, deobfuscates, and processes a single leaf index with retry logic.
   */
  async fetchSingleLeaf(leafIndex, maxRetries = 3) {
    const url = this.urlResolver(leafIndex, this.scale);
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxRetries) {
      if (this.abortController?.signal?.aborted) {
        throw new Error('Stream cancelled');
      }

      try {
        const res = await fetch(url, {
          credentials: 'include',
          signal: this.abortController?.signal
        });

        if (res.status === 429 || res.status === 503 || res.status === 504) {
          attempt++;
          this.onLog(`[Rate-Limit] Server returned HTTP ${res.status} on leaf ${leafIndex}. Backing off for ${(delay / 1000).toFixed(1)}s...`, 'warn');
          await new Promise((r) => setTimeout(r, delay));
          delay *= 1.8;
          continue;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const rawBuffer = await res.arrayBuffer();
        if (!rawBuffer || rawBuffer.byteLength < 500) {
          throw new Error('Received empty payload');
        }

        // Automatic AES-CTR deobfuscation if header present
        const obfuscateHeader = res.headers.get('X-Obfuscate') || res.headers.get('x-obfuscate');
        const cleanBuffer = await window.deobfuscateArchiveImage(rawBuffer, obfuscateHeader, url);

        // Convert clean buffer to JPEG with target scale quality
        const result = await this.processBufferToJpeg(cleanBuffer, leafIndex);
        this.totalBytes += result.sizeBytes;
        return result;
      } catch (err) {
        if (err.name === 'AbortError' || this.abortController?.signal?.aborted) {
          throw new Error('Stream cancelled');
        }
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(`Failed after ${maxRetries} attempts: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  /**
   * Loads the decrypted ArrayBuffer into an Image and captures dimensions.
   */
  processBufferToJpeg(buffer, leafIndex) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        resolve({
          leafIndex,
          leafStr: String(leafIndex + 1).padStart(4, '0'),
          width,
          height,
          data: new Uint8Array(buffer),
          sizeBytes: buffer.byteLength
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error(`Image header decoding error on leaf ${leafIndex}`));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Runs the queue for a specified array of leaf indices.
   */
  async startStream(leafIndices) {
    this.isRunning = true;
    this.isPaused = false;
    this.abortController = new AbortController();
    this.startTime = performance.now();
    this.totalBytes = 0;

    const total = leafIndices.length;
    this.pages = new Array(total);
    this.failedLeaves = [];

    let processedCount = 0;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < total && this.isRunning) {
        while (this.isPaused && this.isRunning) {
          await new Promise((r) => setTimeout(r, 250));
        }
        if (!this.isRunning || this.abortController?.signal?.aborted) break;

        const currentIndex = nextIndex++;
        if (currentIndex >= total) break;
        const leafIndex = leafIndices[currentIndex];

        try {
          const result = await this.fetchSingleLeaf(leafIndex);
          this.pages[currentIndex] = result;
          this.onLog(`[Stream] Leaf ${leafIndex} complete (${(result.sizeBytes / 1024).toFixed(1)} KB) [${result.width}x${result.height}]`, 'success');
        } catch (err) {
          if (err.name === 'AbortError' || this.abortController?.signal?.aborted) break;
          this.onLog(`[Error] Leaf ${leafIndex}: ${err.message}`, 'error');
          this.failedLeaves.push({ leafIndex, listIndex: currentIndex, reason: err.message });
        }

        processedCount++;
        const elapsedSec = (performance.now() - this.startTime) / 1000;
        const speedMBps = elapsedSec > 0 ? this.totalBytes / (1024 * 1024) / elapsedSec : 0;
        const remainingCount = total - processedCount;
        const avgTimePerLeaf = elapsedSec / processedCount;
        const etaSec = Math.round(remainingCount * (avgTimePerLeaf / this.concurrency));

        this.onProgress({
          processedCount,
          total,
          percent: Math.round((processedCount / total) * 100),
          lastPage: this.pages[currentIndex],
          speedMBps: speedMBps.toFixed(2),
          totalMB: (this.totalBytes / (1024 * 1024)).toFixed(2),
          etaSec: etaSec > 0 ? etaSec : 0
        });
      }
    };

    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    this.isRunning = false;

    return {
      pages: this.pages.filter(Boolean),
      failedLeaves: this.failedLeaves,
      totalBytes: this.totalBytes
    };
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  cancel() {
    this.isRunning = false;
    this.isPaused = false;
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (e) {}
    }
  }
}

if (typeof window !== 'undefined') {
  window.UniversalBookStreamer = UniversalBookStreamer;
}
