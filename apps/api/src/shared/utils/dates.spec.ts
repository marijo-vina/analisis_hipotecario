import { completeMonthsBetween } from './dates';

describe('completeMonthsBetween', () => {
  describe('happy path', () => {
    it('should return 0 for same month and year', () => {
      expect(completeMonthsBetween('2026-01-15', new Date('2026-01-20'))).toBe(0);
    });

    it('should return 1 when exactly one month apart', () => {
      expect(completeMonthsBetween('2026-01-15', new Date('2026-02-15'))).toBe(1);
    });

    it('should return complete months when ref day is after start day', () => {
      // 2024-01-15 to 2026-07-20 = 30 complete months
      expect(completeMonthsBetween('2024-01-15', new Date('2026-07-20'))).toBe(30);
    });

    it('should not count incomplete month when ref day is before start day', () => {
      // 2024-01-20 to 2026-07-15 = 29 complete months (July not complete)
      expect(completeMonthsBetween('2024-01-20', new Date('2026-07-15'))).toBe(29);
    });
  });

  describe('edge cases', () => {
    it('should handle birth date calculation (long span)', () => {
      // 1992-06-14 to 2026-07-20 = 409 complete months
      expect(completeMonthsBetween('1992-06-14', new Date('2026-07-20'))).toBe(409);
    });

    it('should handle same day of month', () => {
      // 2024-03-15 to 2024-06-15 = exactly 3 months
      expect(completeMonthsBetween('2024-03-15', new Date('2024-06-15'))).toBe(3);
    });

    it('should handle end of month dates', () => {
      // 2024-01-31 to 2024-03-01 = 1 complete month (Feb is shorter)
      expect(completeMonthsBetween('2024-01-31', new Date('2024-03-01'))).toBe(1);
    });
  });
});
