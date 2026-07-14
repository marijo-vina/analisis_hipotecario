// Show SANTANDER data row on page 4 with all words and their band positions
import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  const buf = fs.readFileSync('samples/bureau-fixture-b.pdf');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf).buffer, disableFontFace: true }).promise;

  const page = await doc.getPage(4);
  const tc = await page.getTextContent();
  const vp = page.getViewport({ scale: 1 });

  // Bands from section 1 (non-banking headers, but same X centers for banking)
  const bands = {
    creditorInfo:    [20, 130],
    openingDate:     [130, 191],
    lastPaymentDate: [191, 238],
    closingDate:     [238, 318],
    maxCredit:       [318, 393],
    currentBalance:  [393, 438],
    pastDueAmount:   [438, 479],
    lastPaymentAmt:  [479, 518],
    paymentDueAmt:   [518, 566],
    payrollLinked:   [566, 651],
    paymentHistory:  [651, 776],
  };

  // Show all words from Y=245 to Y=330 (SANTANDER credit area)
  const words = (tc.items as any[])
    .filter((i: any) => i.str?.trim())
    .map((i: any) => ({
      t: i.str.trim(),
      x: i.transform[4],
      cx: i.transform[4] + i.width / 2,
      y: vp.height - i.transform[5],
    }))
    .filter((w: any) => w.y > 245 && w.y < 330)
    .sort((a: any, b: any) => a.y - b.y || a.x - b.x);

  console.log('SANTANDER area (Y 245-330):');
  let lastY = 0;
  for (const w of words) {
    if (Math.abs(w.y - lastY) > 3) console.log(`\n--- Y=${w.y.toFixed(0)} ---`);
    // Find band
    let band = '';
    for (const [name, [xmin, xmax]] of Object.entries(bands)) {
      if (w.cx >= xmin && w.cx <= xmax) { band = name; break; }
    }
    console.log(`  x=${w.x.toFixed(0)} cx=${w.cx.toFixed(0)} [${band}] "${w.t}"`);
    lastY = w.y;
  }
}
main().catch(e => console.error(e));
