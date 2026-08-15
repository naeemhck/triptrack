import { getMemberColor, getMemberInitials } from '../memberIdentity';

describe('member identity helpers', () => {
  it('returns stable colors', () =>
    expect(getMemberColor('member-1')).toBe(getMemberColor('member-1')));
  it('uses different palette positions for common ids', () =>
    expect(getMemberColor('a')).not.toBe(getMemberColor('b')));
  it('uses first and last initials', () =>
    expect(getMemberInitials('Naeem Ahmed Khan')).toBe('NK'));
  it('uses two letters for one name', () => expect(getMemberInitials('Naeem')).toBe('NA'));
  it('handles whitespace and missing names', () => {
    expect(getMemberInitials('  Jane   Doe ')).toBe('JD');
    expect(getMemberInitials()).toBe('');
  });
});
