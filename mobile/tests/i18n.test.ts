import { expect, it } from 'vitest';
import { strings, keys } from '../src/ui/i18n';
it('provides a nonempty translation for every interface key in every supported language', () => {
  expect(new Set(keys).size).toBe(keys.length);
  for (const values of Object.values(strings)) {
    expect(values.length).toBe(keys.length);
    expect(
      values.every(
        (value) => typeof value === 'string' && value.trim().length > 0,
      ),
    ).toBe(true);
  }
});
