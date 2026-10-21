import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';
import { StrictMode } from 'react';
import { OnboardingEntranceProvider, useOnboardingEntrance } from './onboarding-entrance';

afterEach(cleanup);

function Screen({ id, allowed = true }: { id: string; allowed?: boolean }) {
  const entrance = useOnboardingEntrance(id, allowed);
  return <div data-testid="entrance">{entrance}</div>;
}
function Session({
  id,
  allowed = true,
  session = 'one',
}: {
  id: string;
  allowed?: boolean;
  session?: string;
}) {
  return (
    <StrictMode>
      <OnboardingEntranceProvider key={session}>
        <Screen key={id} id={id} allowed={allowed} />
      </OnboardingEntranceProvider>
    </StrictMode>
  );
}

test('first visits animate, ordinary renders do not interrupt them, revisits never replay', () => {
  const view = render(<Session id="identity" />);
  expect(view.getByTestId('entrance').textContent).toBe('staggered');
  view.rerender(<Session id="identity" />);
  expect(view.getByTestId('entrance').textContent).toBe('staggered');
  view.rerender(<Session id="background" />);
  expect(view.getByTestId('entrance').textContent).toBe('staggered');
  view.rerender(<Session id="identity" allowed={false} />);
  expect(view.getByTestId('entrance').textContent).toBe('none');
  view.rerender(<Session id="background" />);
  expect(view.getByTestId('entrance').textContent).toBe('none');
  view.rerender(<Session id="documentation" />);
  expect(view.getByTestId('entrance').textContent).toBe('staggered');
});

test('a screen first opened backwards or for editing still counts as seen', () => {
  const view = render(<Session id="documentation" allowed={false} />);
  expect(view.getByTestId('entrance').textContent).toBe('none');
  view.rerender(<Session id="background" allowed={false} />);
  view.rerender(<Session id="documentation" />);
  expect(view.getByTestId('entrance').textContent).toBe('none');
});

test('custom screens have separate identities and a new session resets visits', () => {
  const view = render(<Session id="custom:first" />);
  view.rerender(<Session id="custom:second" />);
  expect(view.getByTestId('entrance').textContent).toBe('staggered');
  view.rerender(<Session id="custom:first" />);
  expect(view.getByTestId('entrance').textContent).toBe('none');
  view.rerender(<Session id="custom:first" session="two" />);
  expect(view.getByTestId('entrance').textContent).toBe('staggered');
});
