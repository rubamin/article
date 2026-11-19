// Turns the article view (header, article, optional questions) into an A4 PDF that looks
// exactly like the screen: the page is captured as an image, then cut into A4 pages.
// The libraries are loaded only when a PDF is made, so normal pages stay small.

export const PDF_WIDTH_PX = 1280; // layout width used for the PDF (the reader's base design width)
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARGIN_MM = 10; // top and bottom of every page
const PAGE_BG = [243, 245, 247]; // same as the page background (--page)
const MAX_CANVAS_PX = 30000; // browsers refuse larger canvases; long articles get a lower scale

// Blocks that should move whole to the next page instead of being cut through.
const KEEP_TOGETHER = [
  '.brand',
  '.article-body > *',
  '.article-body tr',
  '.article-body li',
  '.article-body img',
  '.quiz h2',
  '.quiz-note',
  '.quiz-q',
].join(',');

/** Where each page starts and ends (CSS px from the top of root). */
function pageBreaks(root, pageH) {
  const top0 = root.getBoundingClientRect().top;
  const total = root.scrollHeight;
  const blocks = Array.from(root.querySelectorAll(KEEP_TOGETHER))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - top0, bottom: r.bottom - top0 };
    })
    .filter((b) => b.bottom - b.top > 0 && b.bottom - b.top <= pageH); // taller than a page: must be cut

  const pages = [];
  let start = 0;
  while (start < total - 1) {
    let end = start + pageH;
    if (end >= total) {
      pages.push([start, total]);
      break;
    }
    // Move the break up to the top of any block it would cut (repeat: that top may sit inside another block)
    for (let i = 0; i < 10; i++) {
      const cut = blocks.filter((b) => b.top < end - 1 && b.bottom > end + 1 && b.top > start + 1);
      if (!cut.length) break;
      end = Math.min(...cut.map((b) => b.top));
    }
    if (end - start < pageH * 0.3) end = start + pageH; // never leave a page almost empty
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

export async function downloadArticlePdf(root, fileName) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await Promise.all(Array.from(root.querySelectorAll('img')).map((img) => (img.complete
    ? null
    : new Promise((ok) => { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', ok, { once: true }); }))));

  const widthPx = root.offsetWidth;
  const pageH = Math.floor(widthPx * ((PAGE_H_MM - 2 * MARGIN_MM) / PAGE_W_MM));
  const pages = pageBreaks(root, pageH);
  const scale = Math.min(2, MAX_CANVAS_PX / Math.max(1, root.scrollHeight));

  const canvas = await html2canvas(root, {
    scale,
    useCORS: true,
    backgroundColor: `rgb(${PAGE_BG.join(',')})`,
    windowWidth: widthPx,
    scrollX: 0,
    scrollY: -window.scrollY,
  });

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const mmPerPx = PAGE_W_MM / widthPx;
  pages.forEach(([start, end], i) => {
    if (i > 0) pdf.addPage();
    pdf.setFillColor(...PAGE_BG);
    pdf.rect(0, 0, PAGE_W_MM, PAGE_H_MM, 'F');

    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round((end - start) * scale));
    const ctx = slice.getContext('2d');
    ctx.fillStyle = `rgb(${PAGE_BG.join(',')})`;
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, Math.round(start * scale), canvas.width, slice.height, 0, 0, slice.width, slice.height);

    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, MARGIN_MM, PAGE_W_MM, (end - start) * mmPerPx);
  });

  pdf.save(fileName);
}

export const pdfFileName = (title) =>
  `${String(title || 'article').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'article'}.pdf`;
