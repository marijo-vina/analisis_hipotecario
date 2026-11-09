// Quick debug: examine banking section data rows and their column assignments
import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const buf = fs.readFileSync('samples/Reporte Buro Credito CM17022026.pdf');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf).buffer, disableFontFace: true }).promise;

  // Page 4, banking data area: Y 640-800
  const page = await doc.getPage(4);
  const tc = await page.getTextContent();
  const vp = page.getViewport({ scale: 1 });

  const words = (tc.items as any[])
    .filter((i: any) => i.str?.trim())
    .map((i: any) => ({
      t: i.str.trim(),
      x: i.transform[4],
      cx: i.transform[4] + i.width / 2,
      y: vp.height - i.transform[5],
      w: i.width,
    }))
    .filter((w: any) => {
      const t = w.t?.toLowerCase() || '';
      return /santander|sofom|inbursa|compra|automóvil/i.test(t);
    })
    .sort((a: any, b: any) => a.pageNum - a.pageNum || a.y - b.y);

  console.log('Banking section data (Y 640-800):');
  let lastY = 0;
  for (const w of words) {
    if (Math.abs(w.y - lastY) > 3) {
      console.log(`\n--- Y=${w.y.toFixed(0)} ---`);
    }
    // Mark if word falls in paymentDueAmount [518-566] or lastPaymentAmount [479-518]
    let marker = '';
    if (w.cx >= 518 && w.cx <= 566) marker = ' ← PAYMENT_DUE';
    else if (w.cx >= 479 && w.cx <= 518) marker = ' ← LAST_PAYMENT';
    else if (w.cx >= 438 && w.cx <= 479) marker = ' ← PAST_DUE';
    console.log(`  x=${w.x.toFixed(0)} cx=${w.cx.toFixed(0)} "${w.t}"${marker}`);
    lastY = w.y;
  }
}
main().catch(e => console.error(e));
