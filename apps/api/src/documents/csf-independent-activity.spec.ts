import { pickPrimaryIndependentActivity } from './csf-independent-activity';

describe('pickPrimaryIndependentActivity', () => {
  it('picks the independent economic activity, not salaried', () => {
    const picked = pickPrimaryIndependentActivity([
      {
        order: 1,
        description:
          'Consultorios de medicina especializada pertenecientes al sector privado',
        percentage: 70,
        startDate: '2011-03-01',
        endDate: null,
      },
      {
        order: 2,
        description: 'Asalariado',
        percentage: 30,
        startDate: '2019-01-01',
        endDate: null,
      },
    ]);

    expect(picked?.startDate).toBe('2011-03-01');
    expect(picked?.description).toMatch(/Consultorios de medicina especializada/);
  });

  it('prefers the independent activity with the highest percentage', () => {
    const picked = pickPrimaryIndependentActivity([
      {
        order: 1,
        description: 'Comercio al por menor',
        percentage: 40,
        startDate: '2008-01-01',
        endDate: null,
      },
      {
        order: 2,
        description: 'Servicios profesionales',
        percentage: 60,
        startDate: '2015-06-01',
        endDate: null,
      },
    ]);

    expect(picked?.startDate).toBe('2015-06-01');
    expect(picked?.description).toBe('Servicios profesionales');
  });

  it('returns null when only salaried activities are present', () => {
    expect(
      pickPrimaryIndependentActivity([
        {
          description: 'Asalariado',
          percentage: 100,
          startDate: '2020-01-01',
          endDate: null,
        },
      ]),
    ).toBeNull();
  });
});
