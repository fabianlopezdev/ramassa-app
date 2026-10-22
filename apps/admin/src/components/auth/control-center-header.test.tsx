/**
 * The Control Center header on the login screens (RAPP-626): the organization
 * logo from the public branding link, shown only once it loads, above the title.
 */
import { fireEvent, render } from '@testing-library/react';
import { expect, test } from 'bun:test';
import { ControlCenterHeader } from './control-center-header';

test('shows the title as the page heading', () => {
  const view = render(<ControlCenterHeader title="Centre de Control del Ramassà" />);
  expect(view.getByRole('heading', { level: 1 }).textContent).toBe('Centre de Control del Ramassà');
});

test('the logo comes from the public branding link and appears once it loads', () => {
  const view = render(
    <ControlCenterHeader
      title="Ramassà Control Center"
      logoUrl="https://media.example.test/branding/ramassa/logo"
    />,
  );
  const logo = view.getByTestId('control-center-logo') as HTMLImageElement;
  expect(logo.getAttribute('src')).toBe('https://media.example.test/branding/ramassa/logo');
  expect(logo.getAttribute('data-loaded')).toBe('false');
  fireEvent.load(logo);
  expect(logo.getAttribute('data-loaded')).toBe('true');
});

test('a logo that fails to load leaves no broken image', () => {
  const view = render(
    <ControlCenterHeader title="Ramassà Control Center" logoUrl="https://media.example.test/x" />,
  );
  fireEvent.error(view.getByTestId('control-center-logo'));
  expect(view.queryByTestId('control-center-logo')).toBeNull();
});

test('without a media link there is no image at all', () => {
  const view = render(<ControlCenterHeader title="Ramassà Control Center" logoUrl={null} />);
  expect(view.queryByTestId('control-center-logo')).toBeNull();
});
