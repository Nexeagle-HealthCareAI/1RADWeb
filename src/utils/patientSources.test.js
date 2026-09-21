import { describe, it, expect } from 'vitest';
import { PATIENT_SOURCES, OTHER_SOURCE, canonicalSource } from './patientSources';

describe('patientSources', () => {
  it('keeps the six labels the old quick-chips wrote, so existing rows are already canonical', () => {
    ['Friend / Family', 'By Doctor', 'Camp', 'Social Media', 'Previous Patient', 'Walk-in']
      .forEach(label => expect(PATIENT_SOURCES).toContain(label));
  });

  it('ends with Other, the bucket for anything not on the list', () => {
    expect(PATIENT_SOURCES[PATIENT_SOURCES.length - 1]).toBe(OTHER_SOURCE);
  });

  it('recognises a channel in any casing or spacing', () => {
    expect(canonicalSource('camp')).toBe('Camp');
    expect(canonicalSource('  CAMP ')).toBe('Camp');
    expect(canonicalSource('friend/family')).toBe('Friend / Family');
    expect(canonicalSource('walk in')).toBe('Walk-in');
    expect(canonicalSource('online / google')).toBe('Online / Google');
  });

  it('treats blank and free text as not-a-channel, so the form can show it under Other unchanged', () => {
    expect(canonicalSource('')).toBeNull();
    expect(canonicalSource(null)).toBeNull();
    expect(canonicalSource('Radio jingle')).toBeNull();
  });
});
