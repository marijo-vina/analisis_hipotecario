// Find SANTANDER/SOFOM data across all pages
import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const buf = fs.readFileSync('samples/Reporte Buro Credito CM17022026.pdf');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf).buffer, disableFontFace: true }).promise;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const vp = page.getViewport({ scale: 1 });

    const hits = (tc.items as any[])
      .filter((i: any) => {
        const t = (i.str || '').toLowerCase();
        return /santander|sofom|inbursa|compra|automóvil|crédito simple|pagos fijos|individual/i.test(t);
      })
      .map((i: any) => ({
        t: i.str.trim(),
        x: i.transform[4],
        y: vp.height - i.transform[5],
        p,
      }));

    if (hits.length > 0) {
      console.log(`\nPage ${p}:`);
      for (const h of hits) {
        console.log(`  x=${h.x.toFixed(0)} y=${h.y.toFixed(0)} "${h.t}"`);
      }
    }
  }
}
main().catch(e => console.error(e));
