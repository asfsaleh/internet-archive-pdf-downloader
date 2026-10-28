/**
 * Internet Archive PDF Downloader - Popup Dashboard Controller v3.4
 * @author Abu Saleh <https://abusaleh.pro.bd/>
 * @github https://github.com/asfsaleh
 * @copyright (c) 2026 Abu Saleh. All rights reserved.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const originEl = document.getElementById('pop-origin');
  const bookIdEl = document.getElementById('pop-bookid');
  const statusEl = document.getElementById('pop-status');
  const btnOpen = document.getElementById('pop-btn-open');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      statusEl.textContent = 'No tab active';
      return;
    }

    const url = new URL(tab.url);
    originEl.textContent = url.hostname;

    // Check directly inside the active tab using our validator
    let isBook = false;
    let bookInfo = null;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          const valid = typeof window.isUniversalBookPage === 'function' ? window.isUniversalBookPage() : false;
          const book = valid && typeof window.detectUniversalBookContext === 'function' ? window.detectUniversalBookContext() : null;
          return { valid, book };
        }
      });
      if (results && results[0] && results[0].result) {
        isBook = results[0].result.valid;
        bookInfo = results[0].result.book;
      }
    } catch (e) {
      console.debug('Scripting error in popup:', e);
    }

    if (isBook && bookInfo) {
      bookIdEl.textContent = bookInfo.title || bookInfo.id;
      statusEl.textContent = `Book Ready ✓ (${bookInfo.totalLeaves || 0} pages)`;
      statusEl.style.color = '#34d399';
      btnOpen.disabled = false;
      btnOpen.style.opacity = '1';
      btnOpen.style.cursor = 'pointer';
      btnOpen.textContent = '⚡ Open Exporter Panel in Tab';

      btnOpen.addEventListener('click', async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: () => {
              const panel = document.getElementById('br-pro-panel');
              const launcher = document.getElementById('br-pro-launcher');
              if (panel) {
                panel.style.display = 'flex';
              } else if (launcher) {
                launcher.click();
              }
            }
          });
          window.close();
        } catch (err) {
          console.error('Failed to trigger in-tab panel:', err);
        }
      });
    } else {
      bookIdEl.textContent = 'No Book Detected';
      statusEl.textContent = 'Non-Book Page (Unsupported)';
      statusEl.style.color = '#ef4444';
      btnOpen.disabled = true;
      btnOpen.style.opacity = '0.5';
      btnOpen.style.cursor = 'not-allowed';
      btnOpen.textContent = 'No Digitized Book on this Page';
    }
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.style.color = '#ef4444';
  }
});
