import { loadPmEjemploFixture, simulatePmOcrCase } from './pm-fixture-simulation';

describe('PM ejemplo OCR fixture', () => {
  it('reproduces the Excel capacities from extracted JSON', async () => {
    const result = await simulatePmOcrCase(loadPmEjemploFixture());

    expect(result.smoothedMonthly).toBe(11_183_203.42);
    expect(result.pmMonthlyDebt).toBe(17_971.92);
    expect(result.pfMonthlyDebt).toBe(157_423.88);
    expect(result.capacities.santanderStatements.capacity).toBe(1_231_490.59);
    expect(result.capacities.santanderTaxReturn.capacity).toBe(873_083.37);
    expect(result.capacities.scotiabank.status).toBe('CALCULATED');
    expect(result.capacities.banorteStatements.status).toBe('CALCULATED');
    expect(result.capacities.hsbcStatements.status).toBe('CALCULATED');
  });
});
