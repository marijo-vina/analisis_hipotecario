/**
 * Smoke test: Coordinate extraction integration
 * 
 * Lee un PDF local de samples/, ejecuta el extractor puro del backend,
 * e imprime los resultados. Sin NestJS, sin base de datos, sin GCS.
 *
 * Uso: npx tsx smoke-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractFromCoordinateWords } from '../../apps/api/src/documents/coordinate-grid.extractor';
import { PaymentDueAmountSource } from '../../apps/api/src/documents/document-ai.types';

async function main() {
  // 1. Buscar PDFs en samples/
  const samplesDir = path.resolve(__dirname, 'samples');
  const pdfs = fs.readdirSync(samplesDir).filter(f => f.endsWith('.pdf'));

  if (pdfs.length === 0) {
    console.error('No hay PDFs en samples/. Copiá un PDF de buró de crédito.');
    process.exit(1);
  }

  console.log(`📂 ${pdfs.length} PDF(s) encontrados en samples/\n`);

  for (const pdfName of pdfs) {
    const pdfPath = path.join(samplesDir, pdfName);
    console.log(`📄 ${pdfName}`);
    console.log('━'.repeat(50));

    // 2. Extraer palabras con coordenadas
    const buffer = fs.readFileSync(pdfPath);
    const data = new Uint8Array(buffer).buffer;
    const doc = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise;

    const words: any[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const vp = page.getViewport({ scale: 1 });
      for (const item of tc.items as any[]) {
        const text = item.str?.trim();
        if (!text) continue;
        words.push({
          text,
          x: item.transform[4],
          y: vp.height - item.transform[5],
          width: item.width,
          height: item.height || 10,
          pageNum: p,
        });
      }
    }

    // 3. Ejecutar extractor puro
    const result = extractFromCoordinateWords(words, pdfName);

    // 4. Mostrar resultados
    console.log(`   Páginas: ${result.totalPages} | Palabras: ${result.totalWords}`);
    console.log(`   Columnas detectadas: ${result.columnsDetected.join(', ')}`);
    console.log(`   Créditos: ${result.credits.length}\n`);

    for (const c of result.credits) {
      const confIcon = c.paymentSource === PaymentDueAmountSource.BAND_MATCH ? '✅' :
                       c.paymentSource === PaymentDueAmountSource.RESCUE ? '🔄' :
                       c.paymentSource === PaymentDueAmountSource.UNCONFIRMED ? '⚠️' : '❓';

      console.log(`   ${confIcon} ${c.institution.padEnd(30)} paymentDue=${c.paymentDueAmount || '(vacío)'.padEnd(10)} ${c.paymentSource}`);
    }

    if (result.warnings.length > 0) {
      console.log(`\n   ⚠️  ${result.warnings.length} advertencias`);
    }
    console.log('');
  }

  console.log('✅ Smoke test completado.');
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
