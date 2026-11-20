import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';
import { StrictMode } from 'react';
import {
  RouteEntranceContext,
  ScreenEntranceProvider,
  useOwnEntrance,
  useScreenEntrance,
} from './screen-entrance';

afterEach(cleanup);

function Screen({ id, allowed = true }: { id?: string; allowed?: boolean }) {
  const entrance = useScreenEntrance(id, allowed);
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
      <ScreenEntranceProvider key={session}>
        <Screen key={id} id={id} allowed={allowed} />
      </ScreenEntranceProvider>
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

function FormLike() {
  const entrance = useOwnEntrance();
  return <div data-testid="form">{entrance}</div>;
}

test('a screen with no id of its own follows the route it is on', () => {
  const route = (mode: 'staggered' | 'none') => (
    <RouteEntranceContext value={{ mode, takeOver: () => undefined, rise: null }}>
      <Screen key={mode} />
    </RouteEntranceContext>
  );
  const view = render(route('none'));
  expect(view.getByTestId('entrance').textContent).toBe('none');
  view.rerender(route('staggered'));
  expect(view.getByTestId('entrance').textContent).toBe('staggered');
  view.rerender(<Screen key="alone" />);
  expect(view.getByTestId('entrance').textContent).toBe('staggered');
});

test('a screen that staggers its own blocks takes the entrance over from the route', () => {
  let takenOver = 0;
  const view = render(
    <RouteEntranceContext value={{ mode: 'none', takeOver: () => (takenOver += 1), rise: null }}>
      <FormLike />
    </RouteEntranceContext>,
  );
  expect(takenOver).toBe(1);
  expect(view.getByTestId('form').textContent).toBe('none');
  view.rerender(<FormLike key="alone" />);
  expect(view.getByTestId('form').textContent).toBe('staggered');
});
