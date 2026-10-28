/**
 * Internet Archive PDF Downloader - Discovery & Validation Engine v3.4
 * @author Abu Saleh <https://abusaleh.pro.bd/>
 * @github https://github.com/asfsaleh
 * @copyright (c) 2026 Abu Saleh. All rights reserved.
 * Strict Validation: Only detects genuine digitized books / BookReader instances.
 * Excludes random web pages, non-book domains, and non-book IA items (audio, video, tv, software, single images).
 */

const DEVELOPER_SIGNATURE = {
  author: 'Abu Saleh',
  website: 'https://abusaleh.pro.bd/',
  github: 'https://github.com/asfsaleh',
  product: 'Internet Archive PDF Downloader',
  version: '3.4.0'
};

/**
 * Validates whether the current page is an active digitized book or document reader.
 * Returns true ONLY if valid BookReader or digitized book metadata is present.
 */
function isUniversalBookPage() {
  try {
    const href = window.location.href;
    const host = window.location.hostname.toLowerCase();
    const path = window.location.pathname.toLowerCase();

    // 1. Hard-exclude non-book domains
    const nonBookDomains = [
      'google.', 'youtube.', 'facebook.', 'twitter.', 'x.com',
      'github.', 'wikipedia.', 'bing.', 'yahoo.', 'reddit.',
      'amazon.', 'netflix.', 'instagram.', 'linkedin.', 'tiktok.',
      'twitch.', 'duckduckgo.', 'msn.', 'ebay.', 'apple.'
    ];
    if (nonBookDomains.some((d) => host.includes(d))) {
      return false;
    }

    // 2. Direct check for active BookReader DOM objects or global JS instances (Any Host)
    const hasBrInstance = !!(
      (window.br && (typeof window.br.getPageURI === 'function' || window.br.numLeafs || window.br.book)) ||
      (window.bookReader && (typeof window.bookReader.getPageURI === 'function' || window.bookReader.numLeafs))
    );
    if (hasBrInstance) return true;

    const hasBrDOM = !!(
      document.querySelector('#BookReader, ia-bookreader, .BookReader, input.js-bookreader, #IABookReaderMessageWrapper') ||
      document.querySelector('.BRnavline, #BRnav, .BRpageindicator, .br-mode-1up__world')
    );
    if (hasBrDOM) return true;

    // 3. Internet Archive (archive.org) Rules
    if (host.includes('archive.org')) {
      // Must be on a /details/ URL
      if (!path.includes('/details/')) {
        return false;
      }

      // Reject direct non-book file extensions (e.g. /details/id/something.jpg, .mp3, .mp4, .iso)
      const nonBookFileExt = /\.(?:jpe?g|png|gif|webp|svg|bmp|mp3|m4a|wav|flac|ogg|aac|mp4|mkv|webm|avi|mov|wmv|iso|exe|bin|zip|tar|gz|7z|rar|dmg|txt)$/i;
      if (nonBookFileExt.test(path)) {
        return false;
      }

      // Check js-ia-metadata input
      const iaInput = document.querySelector('input.js-ia-metadata');
      if (iaInput && iaInput.value) {
        try {
          const ia = JSON.parse(iaInput.value);
          const meta = ia.metadata || {};
          const mediatype = (meta.mediatype || '').toLowerCase();

          // Strictly exclude known non-book mediatypes
          const nonBookMediaTypes = [
            'audio', 'etree', 'movies', 'video', 'tv', 'television',
            'software', 'image', 'web', 'data', 'collection', 'account'
          ];
          if (nonBookMediaTypes.includes(mediatype)) {
            return false;
          }

          // Positively confirm book items
          const hasJp2 = (ia.files || []).some((f) => f.name && f.name.endsWith('_jp2.zip'));
          const hasScandata = (ia.files || []).some((f) => f.name && f.name.includes('scandata'));
          const hasBookFormat = (ia.files || []).some((f) =>
            f.format && (
              f.format.includes('JP2') ||
              f.format.includes('DjVu') ||
              f.format.includes('chOCR') ||
              f.format.includes('Text PDF') ||
              f.format.includes('Encrypted PDF')
            )
          );

          if (mediatype === 'texts' || hasJp2 || hasScandata || hasBookFormat) {
            return true;
          }
        } catch (e) {
          console.debug('[Detector] js-ia-metadata validation error:', e);
        }
      }

      // Check meta tag: <meta property="mediatype" content="...">
      const metaTag = document.querySelector('meta[property="mediatype"], meta[name="mediatype"]');
      if (metaTag) {
        const content = (metaTag.getAttribute('content') || '').toLowerCase();
        if (content && content !== 'texts') {
          return false;
        }
        if (content === 'texts') {
          return true;
        }
      }

      // Check explicit book reading mode in URL
      if (/\/mode\/(?:1up|2up|thumb)/i.test(href)) {
        return true;
      }

      // On archive.org, if none of the positive book signals matched -> NOT a book
      return false;
    }

    // 4. OpenLibrary Rules
    if (host.includes('openlibrary.org')) {
      if (/\/(?:books|works)\/[^\/\?#]+/i.test(path)) {
        return hasBrDOM || hasBrInstance || href.includes('/borrow') || href.includes('/read');
      }
      return false;
    }

    // 5. Custom / Local BookReader sites (e.g. mytestsiteabusaleh.com, localhost)
    if (/\/details\/[^\/\?#]+\/mode\/(?:1up|2up)/i.test(href)) {
      return true;
    }

    return false;
  } catch (err) {
    console.debug('[Detector] isUniversalBookPage error:', err);
    return false;
  }
}

/**
 * Discovers and builds book context from BookReader / IA metadata.
 * Returns null if the page is not a valid book.
 */
function detectUniversalBookContext() {
  if (!isUniversalBookPage()) {
    return null;
  }

  const result = {
    id: '',
    title: 'Digitized Book',
    author: 'Unknown Author',
    date: '',
    server: '',
    itemPath: '',
    zip: '',
    totalLeaves: 0,
    leafDigits: 4,
    filePrefix: '',
    detectedType: 'generic',
    getPageUrl: null
  };

  const href = window.location.href;

  // 1. Discover Book Identifier from URL
  const detailsMatch = href.match(/\/details\/([^\/\?#]+)/i);
  const booksMatch = href.match(/\/(?:books|works)\/([^\/\?#]+)/i);
  if (detailsMatch) {
    result.id = detailsMatch[1];
  } else if (booksMatch) {
    result.id = booksMatch[1];
  }

  // 2. Extract metadata from Internet Archive DOM inputs
  try {
    const iaInput = document.querySelector('input.js-ia-metadata');
    if (iaInput && iaInput.value) {
      const ia = JSON.parse(iaInput.value);
      result.detectedType = 'archive_ia';
      if (ia.server) result.server = ia.server;
      if (ia.dir) result.itemPath = ia.dir;
      if (ia.metadata) {
        if (!result.id && ia.metadata.identifier) result.id = ia.metadata.identifier;
        if (ia.metadata.title) result.title = ia.metadata.title.trim();
        if (ia.metadata.creator) result.author = ia.metadata.creator.trim();
        if (ia.metadata.date) result.date = ia.metadata.date;
        if (ia.metadata.imagecount) {
          const imgCount = parseInt(ia.metadata.imagecount, 10);
          if (!isNaN(imgCount) && imgCount > 0) result.totalLeaves = imgCount;
        }
      }

      // Locate true JP2 archive ZIP
      const jp2File = (ia.files || []).find((f) => f.name && f.name.endsWith('_jp2.zip'));
      if (jp2File) {
        if (result.itemPath) result.zip = `${result.itemPath}/${jp2File.name}`;
        if (jp2File.filecount && (!result.totalLeaves || result.totalLeaves <= 0)) {
          const fc = parseInt(jp2File.filecount, 10);
          if (!isNaN(fc) && fc > 0) result.totalLeaves = fc;
        }
      }
    }
  } catch (e) {
    console.debug('[Detector] js-ia-metadata parse error:', e);
  }

  // 3. Extract BookReader JSIA configurations
  try {
    const brInput = document.querySelector('input.js-bookreader');
    if (brInput && brInput.value) {
      const br = JSON.parse(brInput.value);
      if (br.url) {
        const u = new URL(br.url.startsWith('//') ? 'https:' + br.url : br.url);
        if (!result.server) result.server = u.searchParams.get('server') || u.hostname;
        if (!result.itemPath) result.itemPath = u.searchParams.get('itemPath') || '';
        if (!result.id) result.id = u.searchParams.get('id') || u.searchParams.get('subPrefix') || '';
      }
    }
  } catch (e) {
    console.debug('[Detector] js-bookreader parse error:', e);
  }

  // 4. Query global BookReader instance
  const br = window.br || window.bookReader || (document.querySelector('#BookReader') && document.querySelector('#BookReader').bookReader);
  if (br) {
    if (br.book && typeof br.book.getNumLeafs === 'function') {
      const count = br.book.getNumLeafs();
      if (count > 0) result.totalLeaves = count;
    } else if (br.numLeafs && br.numLeafs > 0) {
      result.totalLeaves = br.numLeafs;
    }
    if ((!result.title || result.title === 'Digitized Book') && (br.bookTitle || br.options?.bookTitle)) {
      result.title = br.bookTitle || br.options.bookTitle;
    }
  }

  // 5. Redundant Fallbacks for Total Leaves: Check ARIA Slider & DOM Navigation text
  if (!result.totalLeaves || result.totalLeaves <= 0) {
    // Check role="slider" aria-valuemax (e.g. aria-valuemax="534" means 535 total pages)
    const sliders = document.querySelectorAll('[role="slider"][aria-valuemax], .ui-slider-handle[aria-valuemax]');
    for (const s of sliders) {
      const maxVal = parseInt(s.getAttribute('aria-valuemax'), 10);
      if (!isNaN(maxVal) && maxVal > 0) {
        result.totalLeaves = maxVal + 1;
        break;
      }
    }
  }

  if (!result.totalLeaves || result.totalLeaves <= 0) {
    // Check navigation text e.g. "Page 224 (231/535)" or "of 535"
    const textNodes = document.querySelectorAll('.BRnavline, #BRnav, .BRpageindicator, .br-mode-1up__world');
    for (const node of textNodes) {
      const match = node.textContent?.match(/\/\s*(\d{2,5})\s*\)/) || node.textContent?.match(/\bof\s+(\d{2,5})\b/i);
      if (match) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > 0) {
          result.totalLeaves = val;
          break;
        }
      }
    }
  }

  // 6. DOM Author Fallback (e.g. "by Dostoyevsky, Fyodor...")
  if (!result.author || result.author === 'Unknown Author') {
    const authorEl = document.querySelector('.item-authors, [itemprop="author"], a[href*="creator="], .by-author');
    if (authorEl && authorEl.textContent) {
      result.author = authorEl.textContent.replace(/^by\s+/i, '').trim();
    }
  }

  // 7. DOM Title Fallback (e.g. h1 on the page)
  if (!result.title || result.title === 'Digitized Book') {
    const titleEl = document.querySelector('.item-title, h1[itemprop="name"]');
    if (titleEl && titleEl.textContent) {
      result.title = titleEl.textContent.trim();
    }
  }

  // If no ID could be determined, this is not a valid book
  if (!result.id) {
    return null;
  }

  // Normalization
  if (!result.filePrefix) result.filePrefix = result.id;
  if (!result.itemPath) result.itemPath = `/items/${result.id}`;
  if (!result.zip) result.zip = `${result.itemPath}/${result.filePrefix}_jp2.zip`;
  if (!result.server) {
    result.server = window.location.hostname.includes('archive.org') ? 'ia800100.us.archive.org' : window.location.host;
  }
  if (!result.totalLeaves || result.totalLeaves <= 0) {
    result.totalLeaves = 1; // Default to 1 leaf until reader fully renders
  }

  // 8. Universal URL Resolver
  result.getPageUrl = function (leafIndex, scale = 2) {
    if (br && typeof br.getPageURI === 'function') {
      try {
        const nativeUri = br.getPageURI(leafIndex, scale);
        if (nativeUri && nativeUri.startsWith('http')) {
          return nativeUri;
        }
      } catch (e) {}
    }

    const leafNumStr = String(leafIndex + 1).padStart(result.leafDigits, '0');
    const fileName = `${result.filePrefix}_jp2/${result.filePrefix}_${leafNumStr}.jp2`;
    const protocol = window.location.protocol.startsWith('http') ? window.location.protocol : 'https:';

    return `${protocol}//${result.server}/BookReader/BookReaderImages.php?zip=${result.zip}&file=${fileName}&id=${result.id}&scale=${scale}&rotate=0`;
  };

  return result;
}

if (typeof window !== 'undefined') {
  window.isUniversalBookPage = isUniversalBookPage;
  window.detectUniversalBookContext = detectUniversalBookContext;
}
