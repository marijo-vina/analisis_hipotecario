// ===========================================================================
// PR 1 tests: classifyLine, filterDetailLines, groupLinesIntoBlocks,
// detectHeaderFromLines.
// ===========================================================================

import { classifyLine, CreditBlock, detectHeaderFromLines, filterDetailLines, groupLinesIntoBlocks, LineType } from './layout-lines-extractor';
import { OcrLine } from './document-ai.types';

function makeLine(text: string, top = 0): OcrLine {
  return { text, boundingBox: { left: 0, top, right: 400, bottom: top + 14 }, confidence: 0.95 };
}

describe('classifyLine', () => {
  it('subheader', () => { expect(classifyLine(makeLine('Créditos Bancarios'))).toBe(LineType.subheader); });
  it('header (≥3 kw)', () => { expect(classifyLine(makeLine('Saldo Actual Crédito Máximo Límite Monto a Pagar'))).toBe(LineType.header); });
  it('institution', () => { expect(classifyLine(makeLine('SANTANDER 1234567890'))).toBe(LineType.institution); });
  it('data (NO APLICA)', () => { expect(classifyLine(makeLine('0 53,763 MX NO APLICA'))).toBe(LineType.data); });
  it('payment', () => { expect(classifyLine(makeLine('8,775 PAGO MÍNIMO'))).toBe(LineType.payment); expect(classifyLine(makeLine('0 MENSUAL'))).toBe(LineType.payment); });
  it('skip', () => { expect(classifyLine(makeLine('PÁGINA 4 DE 6'))).toBe(LineType.skip); expect(classifyLine(makeLine(''))).toBe(LineType.skip); });
  it('unrecognised → skip', () => { expect(classifyLine(makeLine('Folio de Consulta'))).toBe(LineType.skip); });
});

describe('filterDetailLines', () => {
  it('empty input', () => { expect(filterDetailLines([])).toEqual([]); });
  it('keeps detail section', () => {
    const r = filterDetailLines([makeLine('DETALLE DE CRÉDITOS'), makeLine('SANTANDER'), makeLine('DETALLE DE CONSULTAS')]);
    expect(r.length).toBe(2);
  });
  it('returns all if no detail found', () => {
    const lines = [makeLine('OTHER')];
    expect(filterDetailLines(lines)).toEqual(lines);
  });
});

describe('groupLinesIntoBlocks', () => {
  it('groups institution+data+payment', () => {
    const b = groupLinesIntoBlocks([makeLine('SANTANDER 123'), makeLine('0 53,763 NO APLICA', 20), makeLine('8,775 PAGO MÍNIMO', 40)]);
    expect(b.length).toBe(1); expect(b[0].paymentLine).not.toBeNull();
  });
  it('subsection tracking', () => {
    const b = groupLinesIntoBlocks([makeLine('Créditos Bancarios'), makeLine('BBVA 987'), makeLine('0 50,000 NO APLICA')]);
    expect(b[0].subsection).toBe('BANCARIOS');
  });
  it('closed credit: no payment line', () => {
    const b = groupLinesIntoBlocks([makeLine('VW LEASING 524'), makeLine('0 894,985 NO APLICA')]);
    expect(b[0].paymentLine).toBeNull();
  });
});

describe('detectHeaderFromLines', () => {
  it('null for empty', () => { expect(detectHeaderFromLines([])).toBeNull(); });
  it('finds header', () => { expect(detectHeaderFromLines([makeLine('Saldo Límite Monto a Pagar')])).not.toBeNull(); });
  it('null when none', () => { expect(detectHeaderFromLines([makeLine('SANTANDER')])).toBeNull(); });
});
