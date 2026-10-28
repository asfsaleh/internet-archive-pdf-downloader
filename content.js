/**
 * Internet Archive PDF Downloader - Content & UI Controller v3.4
 * @author Abu Saleh <https://abusaleh.pro.bd/>
 * @github https://github.com/asfsaleh
 * @copyright (c) 2026 Abu Saleh. All rights reserved.
 */
(function () {
  if (window.__universalBrPdfExporterLoaded) return;
  window.__universalBrPdfExporterLoaded = true;

  console.log('%c⚡ Internet Archive PDF Downloader v3.4 | Developed by Abu Saleh (https://abusaleh.pro.bd/)', 'color: #38bdf8; font-weight: bold; font-size: 11px;');

  let isMounted = false;
  let book = null;
  let selectedScale = 2; // Default: Balanced (Scale 2 - Super HD)
  let activeStreamer = null;
  let downloadedPages = [];

  let launcher = null;
  let panel = null;

  // Mount UI onto the current page
  function mountUI(detectedBook) {
    if (isMounted) return;
    book = detectedBook;

    // 1. Inject Sleek Minimal Floating Launcher
    launcher = document.createElement('div');
    launcher.id = 'br-pro-launcher';
    launcher.innerHTML = `
      <span class="br-status-dot"></span>
      <span>⚡ Export Book to PDF</span>
    `;
    document.body.appendChild(launcher);

    // 2. Inject Clean Minimal Panel
    panel = document.createElement('div');
    panel.id = 'br-pro-panel';
    panel.style.display = 'none';

    panel.innerHTML = `
      <div class="br-header">
        <div class="br-header-title">
          <h3 id="br-title-display">${book.title}</h3>
          <span id="br-author-display">${book.author}${book.date ? ' (' + book.date + ')' : ''}</span>
        </div>
        <button class="br-close-btn" id="br-close-btn" title="Close">&times;</button>
      </div>

      <div class="br-body">
        <!-- One-Line Resolution Selector (Low, Balanced, High) -->
        <div class="br-field-group">
          <label>
            <span>Resolution / Quality</span>
            <span style="font-size: 10px; color: #60a5fa; text-transform: none;">Hover for pixel info</span>
          </label>
          <div class="br-res-row">
            <button type="button" class="br-res-btn" data-scale="4" title="Scale 4 • ~1200px width • Quick mobile reading">
              <div class="br-res-title">Low</div>
              <div class="br-res-size" id="size-est-low">~35 MB</div>
            </button>
            <button type="button" class="br-res-btn active" data-scale="2" title="Scale 2 • ~2400px width • Super HD crystal clear text (Recommended)">
              <div class="br-res-title">Balanced</div>
              <div class="br-res-size" id="size-est-balanced">~95 MB</div>
            </button>
            <button type="button" class="br-res-btn" data-scale="1" title="Scale 1 • ~3600px width • Original RAW archival scan">
              <div class="br-res-title">High</div>
              <div class="br-res-size" id="size-est-high">~280 MB</div>
            </button>
          </div>
        </div>

        <!-- Compact One-Line Page Range -->
        <div class="br-field-group">
          <label>
            <span>Page Range</span>
            <span id="br-total-badge" style="font-size: 10px; color: #34d399; font-weight: 600;">(${book.totalLeaves} pages)</span>
          </label>
          <div class="br-range-bar">
            <div class="br-range-inputs">
              <span style="color: #94a3b8; font-size: 11px;">From</span>
              <input type="number" id="br-input-start" class="br-input-sm" value="0" min="0">
              <span style="color: #94a3b8; font-size: 11px;">to</span>
              <input type="number" id="br-input-end" class="br-input-sm" value="${book.totalLeaves - 1}" min="0">
            </div>
            <button type="button" id="br-btn-reset-range" class="br-btn-secondary" style="padding: 3px 8px; font-size: 11px; border-radius: 4px; background: none; border: 1px solid #334155; cursor: pointer; color: #94a3b8;">Full Book</button>
          </div>
        </div>

        <!-- Minimal Live Card & Telemetry -->
        <div class="br-reading-card">
          <div class="br-preview-box" id="br-preview-box">
            <span style="font-size: 20px;">📄</span>
          </div>
          <div class="br-reading-info">
            <div class="br-telemetry">
              <span id="br-progress-count">Ready</span>
              <span id="br-speed-metric"><strong>0.00</strong> MB/s</span>
            </div>
            <div class="br-progress-track">
              <div class="br-progress-fill" id="br-progress-fill"></div>
            </div>
            <div class="br-telemetry">
              <span id="br-eta-metric">ETA: --</span>
              <span id="br-percent-metric" style="font-weight: 700; color: #60a5fa;">0%</span>
            </div>
          </div>
        </div>

        <!-- Action Buttons Row 1: Run, Pause, Cancel -->
        <div class="br-btn-row">
          <button id="br-btn-run" class="br-btn br-btn-primary">⚡ Start Download</button>
          <button id="br-btn-pause" class="br-btn br-btn-secondary" disabled>⏸️ Pause</button>
          <button id="br-btn-cancel" class="br-btn br-btn-danger" disabled>⏹️ Cancel</button>
        </div>

        <!-- Action Buttons Row 2: Save Partial & Test Ping -->
        <div class="br-btn-row">
          <button id="br-btn-save-partial" class="br-btn br-btn-success" disabled>💾 Save PDF Now</button>
          <button id="br-btn-test" class="br-btn br-btn-secondary" title="Verify first leaf connection">🧪 Test Ping</button>
        </div>

        <!-- Collapsible Minimal Diagnostics -->
        <div>
          <div class="br-drawer-toggle" id="br-drawer-toggle">
            <span>Diagnostics & Logs</span>
            <span id="br-drawer-icon">▼</span>
          </div>
          <div class="br-log-box" id="br-log-box">
            <div class="br-log-item success">[Ready] Universal Detector Active.</div>
          </div>
        </div>

        <!-- Creator Signature Footer -->
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b;">
          <span>v3.4 Production</span>
          <a href="https://abusaleh.pro.bd/" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: none; font-weight: 600;">Developed by Abu Saleh ↗</a>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // 3. Bind UI Elements & Events
    bindPanelEvents();
    isMounted = true;
  }

  // Unmount UI if navigated away from book
  function unmountUI() {
    if (!isMounted) return;
    if (activeStreamer && activeStreamer.isRunning) {
      activeStreamer.cancel();
    }
    if (launcher && launcher.parentNode) {
      launcher.parentNode.removeChild(launcher);
    }
    if (panel && panel.parentNode) {
      panel.parentNode.removeChild(panel);
    }
    launcher = null;
    panel = null;
    isMounted = false;
  }

  // Bind all event listeners inside the panel
  function bindPanelEvents() {
    const closeBtn = document.getElementById('br-close-btn');
    const titleDisplay = document.getElementById('br-title-display');
    const authorDisplay = document.getElementById('br-author-display');
    const totalBadge = document.getElementById('br-total-badge');
    const startInput = document.getElementById('br-input-start');
    const endInput = document.getElementById('br-input-end');
    const resetRangeBtn = document.getElementById('br-btn-reset-range');

    const resBtns = document.querySelectorAll('.br-res-btn');
    const sizeEstLow = document.getElementById('size-est-low');
    const sizeEstBalanced = document.getElementById('size-est-balanced');
    const sizeEstHigh = document.getElementById('size-est-high');

    const previewBox = document.getElementById('br-preview-box');
    const progressFill = document.getElementById('br-progress-fill');
    const progressCount = document.getElementById('br-progress-count');
    const speedMetric = document.getElementById('br-speed-metric');
    const etaMetric = document.getElementById('br-eta-metric');
    const percentMetric = document.getElementById('br-percent-metric');

    const btnRun = document.getElementById('br-btn-run');
    const btnPause = document.getElementById('br-btn-pause');
    const btnCancel = document.getElementById('br-btn-cancel');
    const btnSavePartial = document.getElementById('br-btn-save-partial');
    const btnTest = document.getElementById('br-btn-test');

    const drawerToggle = document.getElementById('br-drawer-toggle');
    const drawerIcon = document.getElementById('br-drawer-icon');
    const logBox = document.getElementById('br-log-box');

    function log(message, type = 'info') {
      const time = new Date().toLocaleTimeString();
      const item = document.createElement('div');
      item.className = `br-log-item ${type}`;
      item.textContent = `[${time}] ${message}`;
      if (logBox) {
        logBox.appendChild(item);
        logBox.scrollTop = logBox.scrollHeight;
      }
    }

    function updateEstimatedSizes() {
      const start = parseInt(startInput.value, 10) || 0;
      const end = parseInt(endInput.value, 10) || (book.totalLeaves - 1);
      const count = Math.max(1, end - start + 1);

      totalBadge.textContent = `(${count} pages)`;

      const mbLow = Math.max(1, Math.round(count * 0.075));
      const mbBalanced = Math.max(2, Math.round(count * 0.20));
      const mbHigh = Math.max(5, Math.round(count * 0.55));

      sizeEstLow.textContent = `~${mbLow} MB`;
      sizeEstBalanced.textContent = `~${mbBalanced} MB`;
      sizeEstHigh.textContent = `~${mbHigh} MB`;
    }

    function refreshBookData() {
      const fresh = window.detectUniversalBookContext();
      if (fresh) {
        book = fresh;
        titleDisplay.textContent = book.title;
        authorDisplay.textContent = `${book.author}${book.date ? ' (' + book.date + ')' : ''} • ${book.server}`;

        startInput.value = 0;
        endInput.value = book.totalLeaves - 1;
        endInput.max = book.totalLeaves - 1;

        updateEstimatedSizes();
        log(`Book: "${book.title}" (${book.totalLeaves} leaves) on ${book.server}`, 'success');
      }
    }

    // Toggle Panel
    launcher.addEventListener('click', () => {
      const isOpening = panel.style.display === 'none';
      panel.style.display = isOpening ? 'flex' : 'none';
      if (isOpening) {
        refreshBookData();
      }
    });

    closeBtn.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    resetRangeBtn.addEventListener('click', () => {
      startInput.value = 0;
      endInput.value = book.totalLeaves - 1;
      updateEstimatedSizes();
    });

    startInput.addEventListener('input', updateEstimatedSizes);
    endInput.addEventListener('input', updateEstimatedSizes);

    // Resolution selection
    resBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        resBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedScale = parseInt(btn.dataset.scale, 10);
        log(`Resolution set to: ${btn.querySelector('.br-res-title').textContent} (Scale ${selectedScale})`, 'info');
      });
    });

    drawerToggle.addEventListener('click', () => {
      const isOpen = logBox.style.display === 'flex';
      logBox.style.display = isOpen ? 'none' : 'flex';
      drawerIcon.textContent = isOpen ? '▼' : '▲';
    });

    // Test Ping (Leaf 0)
    btnTest.addEventListener('click', async () => {
      btnTest.disabled = true;
      log(`Testing connection on Leaf 0 at Scale ${selectedScale}...`, 'info');
      const startTime = performance.now();

      const tester = new window.UniversalBookStreamer({
        urlResolver: book.getPageUrl,
        scale: selectedScale,
        concurrency: 1,
        onLog: log
      });
      tester.isRunning = true;

      try {
        const page = await tester.fetchSingleLeaf(0);
        const elapsed = Math.round(performance.now() - startTime);

        const blob = new Blob([page.data], { type: 'image/jpeg' });
        previewBox.innerHTML = `<img src="${URL.createObjectURL(blob)}" />`;

        log(`✅ Ping Succeeded: ${page.width}x${page.height} in ${elapsed}ms`, 'success');
        alert(`✅ Connection Verified!\nLeaf 0 fetched at ${page.width}x${page.height} pixels in ${elapsed}ms.\nReady to download.`);
      } catch (err) {
        log(`❌ Ping Failed: ${err.message}`, 'error');
        alert(`❌ Connection Test Failed: ${err.message}`);
      } finally {
        btnTest.disabled = false;
      }
    });

    // Main Stream Controller
    btnRun.addEventListener('click', async () => {
      const startLeaf = parseInt(startInput.value, 10) || 0;
      const endLeaf = parseInt(endInput.value, 10) || (book.totalLeaves - 1);

      if (startLeaf > endLeaf || startLeaf < 0) {
        alert('Invalid leaf range specified!');
        return;
      }

      const leafList = [];
      for (let i = startLeaf; i <= endLeaf; i++) leafList.push(i);

      btnRun.disabled = true;
      btnPause.disabled = false;
      btnCancel.disabled = false;
      btnSavePartial.disabled = false;
      btnTest.disabled = true;

      log(`🚀 Starting stream of ${leafList.length} leaves (Scale: ${selectedScale})...`, 'info');

      activeStreamer = new window.UniversalBookStreamer({
        urlResolver: book.getPageUrl,
        scale: selectedScale,
        concurrency: 3,
        onProgress: (stats) => {
          progressFill.style.width = `${stats.percent}%`;
          progressCount.textContent = `${stats.processedCount} / ${stats.total}`;
          percentMetric.textContent = `${stats.percent}%`;
          speedMetric.innerHTML = `<strong>${stats.speedMBps}</strong> MB/s`;
          etaMetric.textContent = stats.etaSec > 0 ? `ETA: ~${stats.etaSec}s` : 'Done';

          if (stats.lastPage) {
            const blob = new Blob([stats.lastPage.data], { type: 'image/jpeg' });
            previewBox.innerHTML = `<img src="${URL.createObjectURL(blob)}" />`;
          }
        },
        onLog: log
      });

      const result = await activeStreamer.startStream(leafList);
      downloadedPages = result.pages;

      btnRun.disabled = false;
      btnPause.disabled = true;
      btnCancel.disabled = true;
      btnTest.disabled = false;

      if (downloadedPages.length > 0) {
        compileAndSavePdf(downloadedPages);
      }
    });

    btnPause.addEventListener('click', () => {
      if (!activeStreamer) return;
      if (activeStreamer.isPaused) {
        activeStreamer.resume();
        btnPause.textContent = '⏸️ Pause';
        log('Stream resumed.', 'info');
      } else {
        activeStreamer.pause();
        btnPause.textContent = '▶️ Resume';
        log('Stream paused by user.', 'warn');
      }
    });

    btnCancel.addEventListener('click', () => {
      if (!activeStreamer) return;
      activeStreamer.cancel();
      btnRun.disabled = false;
      btnPause.disabled = true;
      btnCancel.disabled = true;
      btnTest.disabled = false;

      log('⏹️ Download cancelled by user.', 'warn');
      progressCount.textContent = 'Cancelled';
      etaMetric.textContent = 'Cancelled';

      if (activeStreamer.pages && activeStreamer.pages.filter(Boolean).length > 0) {
        downloadedPages = activeStreamer.pages.filter(Boolean);
        btnSavePartial.disabled = false;
        alert(`Download cancelled.\n${downloadedPages.length} pages were downloaded before stopping.\nYou can save them using "Save PDF Now".`);
      } else {
        alert('Download cancelled.');
      }
    });

    function compileAndSavePdf(pagesToSave) {
      const pages = pagesToSave || downloadedPages;
      if (!pages || pages.length === 0) {
        alert('No pages available to save.');
        return;
      }

      log(`Compiling PDF (${pages.length} pages)...`, 'info');

      setTimeout(() => {
        try {
          const cleanTitle = (book.title || 'Book').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
          const filename = `${cleanTitle}_Scale${selectedScale}.pdf`;

          const pdfBlob = window.buildProductionPdf(pages, {
            title: book.title,
            author: book.author,
            subject: `Scanned from ${book.server}`,
            date: new Date()
          });

          const downloadUrl = URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();

          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
          }, 3000);

          const totalMB = (pdfBlob.size / (1024 * 1024)).toFixed(2);
          log(`🎉 SUCCESS! Downloaded: ${filename} (${totalMB} MB)`, 'success');
        } catch (err) {
          log(`❌ PDF compilation error: ${err.message}`, 'error');
        }
      }, 100);
    }

    btnSavePartial.addEventListener('click', () => compileAndSavePdf());

    // Initial sync
    refreshBookData();
  }

  // Discovery & Lifecycle Controller
  function checkAndInit() {
    const isBook = typeof window.isUniversalBookPage === 'function' ? window.isUniversalBookPage() : false;

    if (!isBook) {
      if (isMounted) unmountUI();
      return false;
    }

    const detectedBook = typeof window.detectUniversalBookContext === 'function' ? window.detectUniversalBookContext() : null;
    if (!detectedBook) {
      if (isMounted) unmountUI();
      return false;
    }

    if (!isMounted) {
      mountUI(detectedBook);
    }
    return true;
  }

  // 1. Initial Attempt
  const success = checkAndInit();

  // 2. Retry polling only on potential book URLs if reader is still hydrating
  const href = window.location.href;
  const potentialBookUrl = /archive\.org\/details\/|openlibrary\.org\/|(\/details\/[^\/\?#]+\/mode\/)/i.test(href);
  if (!success && potentialBookUrl) {
    const delays = [400, 1200, 2500];
    delays.forEach((ms) => {
      setTimeout(() => {
        if (!isMounted) checkAndInit();
      }, ms);
    });
  }

  // 3. SPA Navigation listener
  let lastHref = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      checkAndInit();
    }
  }, 1000);

  window.addEventListener('popstate', checkAndInit);
})();
