import { formatTripDateRange } from '../dateFormat';

describe('formatTripDateRange', () => {
  it('includes both days and one shared year', () => {
    const result = formatTripDateRange('2026-08-14', '2026-08-18');
    expect(result).toContain('14');
    expect(result).toContain('18');
    expect(result.match(/2026/g)).toHaveLength(1);
  });

  it('includes both years for a cross-year trip', () => {
    const result = formatTripDateRange('2026-12-31', '2027-01-02');
    expect(result).toContain('2026');
    expect(result).toContain('2027');
  });

  it('does not shift a date-only value across time zones', () => {
    const result = formatTripDateRange('2026-01-01', '2026-01-01');
    expect(result).toContain('1');
    expect(result).toContain('2026');
  });
});
