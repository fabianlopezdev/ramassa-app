import { Button } from '@/components/ui/button';
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';

test('shadcn Button renders its label', () => {
  const { getByRole } = render(<Button>Entra</Button>);
  expect(getByRole('button').textContent).toBe('Entra');
});
