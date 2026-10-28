/**
 * Internet Archive PDF Downloader - Native AES-CTR Decryption Engine
 * @author Abu Saleh <https://abusaleh.pro.bd/>
 * @github https://github.com/asfsaleh
 * @copyright (c) 2026 Abu Saleh. All rights reserved.
 * Uses W3C Web Cryptography API (crypto.subtle)
 */

/**
 * Decrypts scrambled book images (X-Obfuscate header) from Internet Archive clusters.
 * @param {ArrayBuffer} arrayBuffer - Raw bytes received from server
 * @param {string|null} obfuscateHeader - Header value e.g. "1|<base64IV>"
 * @param {string} requestUrl - The full request URL used to fetch the image
 * @returns {Promise<ArrayBuffer>} - Clean, decrypted standard JPEG ArrayBuffer
 */
async function deobfuscateArchiveImage(arrayBuffer, obfuscateHeader, requestUrl) {
  if (!obfuscateHeader || typeof obfuscateHeader !== 'string') {
    return arrayBuffer;
  }

  try {
    const parts = obfuscateHeader.split('|');
    const version = parts[0];
    const ivBase64 = parts[1];

    if (version !== '1' || !ivBase64) {
      console.warn('[Deobfuscator] Unknown or malformed obfuscate header:', obfuscateHeader);
      return arrayBuffer;
    }

    // Strip protocol and hostname to get relative resource path: e.g. /BookReader/BookReaderImages.php?...
    const resourcePath = requestUrl.replace(/https?:\/\/[^\/]+/, '');

    // Derive 128-bit key from first 16 bytes of SHA-1(resourcePath)
    const pathEncoded = new TextEncoder().encode(resourcePath);
    const sha1Buffer = await crypto.subtle.digest('SHA-1', pathEncoded);
    const key = await crypto.subtle.importKey(
      'raw',
      sha1Buffer.slice(0, 16),
      { name: 'AES-CTR' },
      false,
      ['decrypt']
    );

    // Decode base64 initialization vector / counter
    const counterBytes = new Uint8Array(
      atob(ivBase64).split('').map((c) => c.charCodeAt(0))
    );

    // Decrypt the first 1024 bytes (scrambled header region)
    const headerSlice = arrayBuffer.slice(0, 1024);
    const decryptedHeader = await crypto.subtle.decrypt(
      { name: 'AES-CTR', length: 64, counter: counterBytes },
      key,
      headerSlice
    );

    // Splice decrypted header back onto the rest of the file
    const cleanBytes = new Uint8Array(arrayBuffer.byteLength);
    cleanBytes.set(new Uint8Array(decryptedHeader), 0);
    cleanBytes.set(new Uint8Array(arrayBuffer, 1024), 1024);

    return cleanBytes.buffer;
  } catch (err) {
    console.error('[Deobfuscator] Decryption failed, returning raw buffer:', err);
    return arrayBuffer;
  }
}

if (typeof window !== 'undefined') {
  window.deobfuscateArchiveImage = deobfuscateArchiveImage;
}
