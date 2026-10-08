import { Test, TestingModule } from '@nestjs/testing';
import { StoragePathService } from './storage-path.service';

describe('StoragePathService', () => {
  let service: StoragePathService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StoragePathService],
    }).compile();

    service = module.get<StoragePathService>(StoragePathService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildPath', () => {
    it('should build standard path from caseId, code, and filename', () => {
      const result = service.buildPath('abc-123', 'PAYROLL_RECEIPT', 'nomina.pdf');

      expect(result).toBe('abc-123/PAYROLL_RECEIPT/nomina.pdf');
    });

    it('should preserve spaces in filename (GCS-compatible)', () => {
      const result = service.buildPath('abc-123', 'INE', 'foto frente.jpg');

      expect(result).toBe('abc-123/INE/foto frente.jpg');
    });

    it('should be deterministic — same inputs always produce same output', () => {
      const args: [string, string, string] = ['case-1', 'BANK_STATEMENT', 'estado.pdf'];

      const result1 = service.buildPath(...args);
      const result2 = service.buildPath(...args);
      const result3 = service.buildPath(...args);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe('case-1/BANK_STATEMENT/estado.pdf');
    });

    it('should handle codes with underscores', () => {
      const result = service.buildPath('abc-123', 'CREDIT_BUREAU_REPORT', 'report.pdf');

      expect(result).toBe('abc-123/CREDIT_BUREAU_REPORT/report.pdf');
    });

    it('should handle caseId with hyphens (UUID format)', () => {
      const result = service.buildPath(
        '550e8400-e29b-41d4-a716-446655440000',
        'PROOF_OF_ADDRESS',
        'comprobante.pdf',
      );

      expect(result).toBe(
        '550e8400-e29b-41d4-a716-446655440000/PROOF_OF_ADDRESS/comprobante.pdf',
      );
    });

    it('should insert COMPANY segment when owner is COMPANY', () => {
      const result = service.buildPath(
        'case-pm-1',
        'CSF',
        'csf-empresa.pdf',
        'COMPANY',
      );

      expect(result).toBe('case-pm-1/COMPANY/CSF/csf-empresa.pdf');
    });

    it('should keep SHAREHOLDER path without extra segment when owner is omitted', () => {
      const result = service.buildPath('case-pm-1', 'CSF', 'csf-socio.pdf');

      expect(result).toBe('case-pm-1/CSF/csf-socio.pdf');
    });

    it('should keep SHAREHOLDER path without extra segment when owner is SHAREHOLDER', () => {
      const result = service.buildPath(
        'case-pm-1',
        'TAX_RETURN',
        'isr-socio.pdf',
        'SHAREHOLDER',
      );

      expect(result).toBe('case-pm-1/TAX_RETURN/isr-socio.pdf');
    });

    it('should insert COMPANY segment for articles of incorporation', () => {
      const result = service.buildPath(
        'abc-123',
        'ARTICLES_OF_INCORPORATION',
        'acta.pdf',
        'COMPANY',
      );

      expect(result).toBe('abc-123/COMPANY/ARTICLES_OF_INCORPORATION/acta.pdf');
    });
  });
});
