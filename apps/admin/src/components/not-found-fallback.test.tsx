import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import { NotFoundFallbackForLanguage } from './not-found-fallback';

test('the router fallback gives a translated recovery path', () => {
  const { getByRole } = render(<NotFoundFallbackForLanguage language="ca" />);

  expect(getByRole('heading', { name: 'Pàgina no trobada' })).toBeDefined();
  expect(getByRole('link', { name: "Torna a l'inici" }).getAttribute('href')).toBe('/');
});
