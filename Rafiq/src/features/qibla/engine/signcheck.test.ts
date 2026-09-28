import { describe, expect, it } from 'vitest';
import { SIGN_CHECK_MS, SIGN_MIN_DIP_DEG, createSignCheck } from './signcheck';

// If the platform's gravity direction comes out flipped, north is unchanged
// but east mirrors and the dip changes sign. The WMM knows the sign.
describe('createSignCheck', () => {
  it('does not flip on a field that dips the expected way', () => {
    const s = createSignCheck(45);
    expect(s.push(43, 0)).toBe(false);
    expect(s.push(47, SIGN_CHECK_MS + 100)).toBe(false);
  });
  it('flips once the dip has read the wrong way for a second', () => {
    const s = createSignCheck(45);
    expect(s.push(-44, 0)).toBe(false);
    expect(s.push(-46, 500)).toBe(false);
    expect(s.push(-45, SIGN_CHECK_MS)).toBe(true);
  });
  it('stays flipped afterwards, since the corrected reading then looks right', () => {
    const s = createSignCheck(45);
    s.push(-45, 0);
    s.push(-45, SIGN_CHECK_MS);
    expect(s.push(45, SIGN_CHECK_MS + 100)).toBe(true);
  });
  it('ignores a passing wrong-way reading', () => {
    const s = createSignCheck(45);
    s.push(-45, 0);
    expect(s.push(45, 300)).toBe(false);
    expect(s.push(45, SIGN_CHECK_MS + 300)).toBe(false);
  });
  it('never decides near the magnetic equator, where the dip has no clear sign', () => {
    const s = createSignCheck(SIGN_MIN_DIP_DEG - 1);
    s.push(-(SIGN_MIN_DIP_DEG - 1), 0);
    expect(s.push(-(SIGN_MIN_DIP_DEG - 1), SIGN_CHECK_MS * 2)).toBe(false);
  });
  it('works in the southern hemisphere, where the expected dip is negative', () => {
    const s = createSignCheck(-60);
    s.push(58, 0);
    expect(s.push(61, SIGN_CHECK_MS)).toBe(true);
  });
});
