import { expect, mock, test } from 'bun:test';
import { finishParticipantAccountCreation } from './participant-account-completion';

test('a referral link failure never hides credentials for an account that was created', async () => {
  const account = {
    profile_id: '5eed0000-0000-4000-8000-000000000099',
    email: 'participant-99@example.test',
    password: 'one-time-secret',
  };
  const events: string[] = [];
  const showAccount = mock(() => events.push(`credentials:${account.email}`));
  const linkReferral = mock(async () => {
    events.push('link-attempted');
    return false;
  });
  const showLinkFailure = mock(() => events.push('link-failed'));

  await finishParticipantAccountCreation(account, {
    showAccount,
    linkReferral,
    showLinkFailure,
  });

  expect(showAccount).toHaveBeenCalledWith(account);
  expect(showLinkFailure).toHaveBeenCalledTimes(1);
  expect(events).toEqual([`credentials:${account.email}`, 'link-attempted', 'link-failed']);
});
