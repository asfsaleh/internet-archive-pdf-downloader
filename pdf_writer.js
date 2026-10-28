/**
 * Internet Archive PDF Downloader - Direct Stream PDF 1.4 Compiler
 * @author Abu Saleh <https://abusaleh.pro.bd/>
 * @github https://github.com/asfsaleh
 * @copyright (c) 2026 Abu Saleh. All rights reserved.
 * Encapsulates JPEG DCT streams with zero re-encoding loss, custom metadata, and memory-safe streaming.
 */

/**
 * Escapes special characters for PDF literal strings (Title, Author, etc.)
 */
function escapePdfString(str) {
  if (!str) return '';
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Formats a Date object into PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
 */
function formatPdfDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const Y = date.getUTCFullYear();
  const M = pad(date.getUTCMonth() + 1);
  const D = pad(date.getUTCDate());
  const H = pad(date.getUTCHours());
  const m = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `D:${Y}${M}${D}${H}${m}${s}Z`;
}

/**
 * Builds a valid, production-grade PDF Blob from an array of compressed JPEG pages.
 * @param {Array<{ width: number, height: number, data: Uint8Array }>} pages
 * @param {Object} metadata - Optional document metadata { title, author, subject, keywords }
 * @returns {Blob}
 */
function buildProductionPdf(pages, metadata = {}) {
  const encoder = new TextEncoder();
  const chunks = [];
  const xrefOffsets = [];
  let currentOffset = 0;

  function write(str) {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  function writeBinary(bytes) {
    chunks.push(bytes);
    currentOffset += bytes.length;
  }

  // 1. Header (PDF 1.4 + Binary Marker)
  write("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  const numPages = pages.length;
  // Obj 1: Catalog
  // Obj 2: Pages Root
  // Obj 3: Info Dictionary
  // For each page i (0 to numPages - 1):
  //   Page Object: 4 + i * 3
  //   Image XObject: 5 + i * 3
  //   Content Stream: 6 + i * 3
  const totalObjects = 3 + numPages * 3;

  // Obj 1: Catalog
  xrefOffsets[1] = currentOffset;
  write("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  // Obj 2: Pages Root
  xrefOffsets[2] = currentOffset;
  const kids = [];
  for (let i = 0; i < numPages; i++) {
    kids.push(`${4 + i * 3} 0 R`);
  }
  write(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${numPages} >>\nendobj\n`);

  // Obj 3: Document Info Dictionary
  xrefOffsets[3] = currentOffset;
  const title = escapePdfString(metadata.title || 'Digitized Book');
  const author = escapePdfString(metadata.author || 'Internet Archive / BookReader');
  const subject = escapePdfString(metadata.subject || 'Scanned Document');
  const creationDate = formatPdfDate(metadata.date || new Date());

  write(`3 0 obj\n<<\n  /Title (${title})\n  /Author (${author})\n  /Subject (${subject})\n  /Creator (Internet Archive PDF Downloader by Abu Saleh - https://abusaleh.pro.bd/)\n  /Producer (Abu Saleh Precision PDF Engine - https://abusaleh.pro.bd/)\n  /CreationDate (${creationDate})\n  /ModDate (${creationDate})\n>>\nendobj\n`);

  // Write Pages, XObjects, and Content Streams
  for (let i = 0; i < numPages; i++) {
    const page = pages[i];
    const pageObjNum = 4 + i * 3;
    const imgObjNum = 5 + i * 3;
    const contentObjNum = 6 + i * 3;

    // Page Object
    xrefOffsets[pageObjNum] = currentOffset;
    write(`${pageObjNum} 0 obj\n<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 ${page.width} ${page.height}]\n  /Resources <<\n    /XObject << /Im${i + 1} ${imgObjNum} 0 R >>\n  >>\n  /Contents ${contentObjNum} 0 R\n>>\nendobj\n`);

    // Image XObject (embeds raw DCT/JPEG bytes directly without decompression)
    xrefOffsets[imgObjNum] = currentOffset;
    write(`${imgObjNum} 0 obj\n<<\n  /Type /XObject\n  /Subtype /Image\n  /Width ${page.width}\n  /Height ${page.height}\n  /ColorSpace /DeviceRGB\n  /BitsPerComponent 8\n  /Filter /DCTDecode\n  /Length ${page.data.length}\n>>\nstream\n`);
    writeBinary(page.data);
    write("\nendstream\nendobj\n");

    // Content Stream (scales and places image to fill page bounding box)
    xrefOffsets[contentObjNum] = currentOffset;
    const contentStream = `q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im${i + 1} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    write(`${contentObjNum} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${contentStream}endstream\nendobj\n`);
  }

  // Cross-reference (xref) Table
  const startXref = currentOffset;
  write(`xref\n0 ${totalObjects + 1}\n`);
  write("0000000000 65535 f \n");
  for (let i = 1; i <= totalObjects; i++) {
    const offsetStr = String(xrefOffsets[i]).padStart(10, '0');
    write(`${offsetStr} 00000 n \n`);
  }

  // Trailer
  write(`trailer\n<<\n  /Size ${totalObjects + 1}\n  /Root 1 0 R\n  /Info 3 0 R\n>>\nstartxref\n${startXref}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}

// Export for global browser context
if (typeof window !== 'undefined') {
  window.buildProductionPdf = buildProductionPdf;
}
