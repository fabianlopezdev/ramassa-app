/**
 * The built-in screens editor (RAPP-612): staff arrange every screen in one
 * list (the summary, the terms and the authorization stay last), word each
 * built-in screen per language, hide one with no required question, and see
 * the phone in that language, right to left for Arabic and Farsi.
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import type { WizardStepKey } from '@ramassa/shared/intake';
import { EMPTY_INTAKE_CATALOG, type IntakeCatalog } from '@ramassa/shared/intake-builder';
import { BuiltinScreensEditor, type BuiltinScreenDraft } from './builtin-screens-editor';

const TRANSPORT = '5eed0000-0000-4000-8044-000000000001';
const catalog: IntakeCatalog = {
  ...EMPTY_INTAKE_CATALOG,
  screens: [
    {
      id: TRANSPORT,
      title: { ca: 'Com arribes' },
      intro: null,
      afterScreen: 'logistics',
      isArchived: false,
      questions: [
        {
          id: '5eed0000-0000-4000-8045-000000000001',
          screenId: TRANSPORT,
          type: 'short_text',
          label: { ca: 'Transport' },
          help: null,
          privacy: 'normal',
          placements: ['wizard'],
          isArchived: false,
          settings: {},
          options: [],
        },
      ],
    },
  ],
  screenSettings: [
    {
      screen: 'summary',
      texts: { title: { ca: 'Revisa-ho tot' }, help: { ca: 'Ho pots canviar.' } },
      isHidden: false,
    },
  ],
  flowOrder: [`custom:${TRANSPORT}`, 'season', 'identity'],
};

function renderEditor() {
  const onSaveScreen = mock(async (draft: BuiltinScreenDraft) => void draft);
  const onSaveOrder = mock(async (order: readonly WizardStepKey[]) => void order);
  const view = render(
    <BuiltinScreensEditor
      catalog={catalog}
      onSaveScreen={onSaveScreen}
      onSaveOrder={onSaveOrder}
    />,
  );
  return { view, onSaveScreen, onSaveOrder };
}

function element<T extends HTMLElement>(view: ReturnType<typeof render>, id: string): T {
  const found = view.container.querySelector<T>(`#${id}`);
  if (found === null) throw new Error(`no ${id}`);
  return found;
}

const steps = (view: ReturnType<typeof render>) =>
  [...view.getByTestId('flow-order-steps').querySelectorAll('li')].map((item) =>
    item.getAttribute('data-testid'),
  );

test('the order lists built-in and staff screens as stored, with the legal end locked', () => {
  const { view } = renderEditor();
  expect(steps(view).slice(0, 3)).toEqual([
    `flow-step-custom:${TRANSPORT}`,
    'flow-step-season',
    'flow-step-supporting-entities',
  ]);
  expect(steps(view)).not.toContain('flow-step-summary');
  expect(view.getByTestId('flow-order-fixed').textContent).toContain(
    'builtinScreens.screenName.summary',
  );
  expect(view.getByTestId('flow-order-fixed').textContent).toContain(
    'builtinScreens.screenName.authorization',
  );
});

test('moving a screen and saving sends the whole order; reset sends none', async () => {
  const { view, onSaveOrder } = renderEditor();
  fireEvent.click(view.getAllByRole('button', { name: 'builtinScreens.moveDown' })[0]!);
  fireEvent.click(view.getByTestId('flow-order-save'));
  await waitFor(() => expect(onSaveOrder).toHaveBeenCalledTimes(1));
  expect(onSaveOrder.mock.calls[0]?.[0].slice(0, 2)).toEqual(['season', `custom:${TRANSPORT}`]);
  expect(onSaveOrder.mock.calls[0]?.[0]).not.toContain('terms');

  fireEvent.click(view.getByTestId('flow-order-reset'));
  await waitFor(() => expect(onSaveOrder).toHaveBeenCalledTimes(2));
  expect(onSaveOrder.mock.calls[1]?.[0]).toEqual([]);
});

test('the summary shows its staff wording in Catalan, and the app text in Arabic, right to left', () => {
  const { view } = renderEditor();
  fireEvent.change(element(view, 'builtin-screen-select'), { target: { value: 'summary' } });
  expect(element<HTMLInputElement>(view, 'builtin-screen-title').value).toBe('Revisa-ho tot');
  expect(view.getByTestId('preview-title').textContent).toBe('Revisa-ho tot');
  expect(view.getByTestId('preview-help').textContent).toBe('Ho pots canviar.');
  expect(view.getByTestId('builtin-screen-preview').getAttribute('dir')).toBe('ltr');

  fireEvent.change(element(view, 'builtin-screen-language'), { target: { value: 'ar' } });
  expect(view.getByTestId('builtin-screen-preview').getAttribute('dir')).toBe('rtl');
  expect(view.getByTestId('builtin-screen-preview').getAttribute('lang')).toBe('ar');
  expect(element<HTMLInputElement>(view, 'builtin-screen-title').value).toBe('');
  expect(view.queryByTestId('preview-help')).toBeNull();
  expect(view.getByTestId('screen-fallback')).toBeTruthy();
});

test('the fallback note is right per field: the help has no app text, so nothing shows', () => {
  const { view } = renderEditor();
  fireEvent.change(element(view, 'builtin-screen-select'), { target: { value: 'summary' } });
  // In Catalan the title and help are written: only the empty fields with app text are named.
  expect(view.getByTestId('screen-fallback').dataset.fields).toBe('intro,continue_label');
  expect(view.queryByTestId('screen-nothing-shows')).toBeNull();

  fireEvent.change(element(view, 'builtin-screen-language'), { target: { value: 'ar' } });
  // The title falls back to the app's own text; the help, written only in
  // Catalan, has no app text and shows nothing in Arabic.
  expect(view.getByTestId('screen-fallback').dataset.fields).toBe('title,intro,continue_label');
  expect(view.getByTestId('screen-nothing-shows').dataset.fields).toBe('help');
});

test('the terms screen has no title field: it is the terms version', () => {
  const { view } = renderEditor();
  fireEvent.change(element(view, 'builtin-screen-select'), { target: { value: 'terms' } });
  expect(view.getByTestId('terms-title-note')).toBeTruthy();
  expect(view.container.querySelector('#builtin-screen-title')).toBeNull();
  expect(view.container.querySelector('#builtin-screen-decline_label')).not.toBeNull();
  expect(view.container.querySelector('#builtin-screen-hidden')).toBeNull();
});

test('a screen with a required question cannot be hidden; an optional one is', async () => {
  const { view, onSaveScreen } = renderEditor();
  fireEvent.change(element(view, 'builtin-screen-select'), { target: { value: 'logistics' } });
  expect(element<HTMLInputElement>(view, 'builtin-screen-hidden').disabled).toBe(true);
  expect(view.getByTestId('hide-locked')).toBeTruthy();

  fireEvent.change(element(view, 'builtin-screen-select'), {
    target: { value: 'documentation' },
  });
  fireEvent.click(element(view, 'builtin-screen-hidden'));
  fireEvent.click(view.getByTestId('builtin-screen-save'));
  await waitFor(() => expect(onSaveScreen).toHaveBeenCalledTimes(1));
  expect(onSaveScreen.mock.calls[0]?.[0]).toEqual({
    screen: 'documentation',
    texts: {},
    isHidden: true,
  });
});
