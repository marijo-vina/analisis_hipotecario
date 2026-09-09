import { formatActivityTenure, joinSpanishList } from './format-activity-tenure';

describe('formatActivityTenure', () => {
  it('formats 12 months as 1 año', () => {
    expect(formatActivityTenure(12)).toBe('1 año');
  });

  it('formats leftover months with years', () => {
    expect(formatActivityTenure(27)).toBe('2 años 3 meses');
  });

  it('formats 1 month singular', () => {
    expect(formatActivityTenure(1)).toBe('1 mes');
  });

  it('formats 0 months', () => {
    expect(formatActivityTenure(0)).toBe('0 meses');
  });
});

describe('joinSpanishList', () => {
  it('joins two names with y', () => {
    expect(joinSpanishList(['Afirme', 'Mifel'])).toBe('Afirme y Mifel');
  });

  it('joins three names with commas and y', () => {
    expect(joinSpanishList(['Afirme', 'Banregio', 'Mifel'])).toBe(
      'Afirme, Banregio y Mifel',
    );
  });
});
