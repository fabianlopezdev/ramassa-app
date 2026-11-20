import { describe, expect, test } from 'bun:test';
import {
  EMPTY_CUSTOM_FORM_PROGRESS,
  type CustomFormProgress,
} from '@ramassa/shared/intake-builder';
import { createFormProgressKeeper } from './form-progress-keeper';

const SCREEN = '88600000-0000-4000-8101-000000000002';
const FIELD = '88600000-0000-4000-8045-000000000001';
const halfWay: CustomFormProgress = { screenId: SCREEN, answers: { [FIELD]: 'Sants' } };

function recorder(results: boolean[] = []) {
  const sent: CustomFormProgress[] = [];
  return {
    sent,
    save: async (progress: CustomFormProgress) => {
      sent.push(progress);
      return results.shift() ?? true;
    },
  };
}

describe('keeping a half-answered form (RAPP-886)', () => {
  test('a new state is sent once, and the same state is not sent again', async () => {
    const { sent, save } = recorder();
    const keeper = createFormProgressKeeper({
      kept: EMPTY_CUSTOM_FORM_PROGRESS,
      save,
      isOnline: () => true,
    });
    await keeper.keep(EMPTY_CUSTOM_FORM_PROGRESS);
    await keeper.keep(halfWay);
    await keeper.keep(halfWay);
    expect(sent).toEqual([halfWay]);
  });

  test('what she resumed from is not sent back', async () => {
    const { sent, save } = recorder();
    const keeper = createFormProgressKeeper({ kept: halfWay, save, isOnline: () => true });
    await keeper.keep({ screenId: SCREEN, answers: { [FIELD]: 'Sants' } });
    expect(sent).toEqual([]);
  });

  test('offline nothing is sent; back online the latest state goes', async () => {
    const { sent, save } = recorder();
    let online = false;
    const keeper = createFormProgressKeeper({
      kept: EMPTY_CUSTOM_FORM_PROGRESS,
      save,
      isOnline: () => online,
    });
    await keeper.keep(halfWay);
    expect(sent).toEqual([]);
    online = true;
    await keeper.keep(halfWay);
    expect(sent).toEqual([halfWay]);
  });

  test('a failed save is tried again with the next state', async () => {
    const { sent, save } = recorder([false, true]);
    const keeper = createFormProgressKeeper({
      kept: EMPTY_CUSTOM_FORM_PROGRESS,
      save,
      isOnline: () => true,
    });
    await keeper.keep(halfWay);
    await keeper.keep(halfWay);
    expect(sent).toEqual([halfWay, halfWay]);
  });

  test('saves run in the order she made them', async () => {
    const order: string[] = [];
    const keeper = createFormProgressKeeper({
      kept: EMPTY_CUSTOM_FORM_PROGRESS,
      isOnline: () => true,
      save: async (progress) => {
        // The first save is slower than the second.
        await new Promise((resolve) => setTimeout(resolve, progress.screenId === null ? 20 : 0));
        order.push(progress.screenId ?? 'first');
        return true;
      },
    });
    void keeper.keep({ screenId: null, answers: { [FIELD]: 'Clot' } });
    await keeper.keep(halfWay);
    expect(order).toEqual(['first', SCREEN]);
  });
});
