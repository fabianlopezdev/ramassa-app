import type { CreatedParticipantAccount } from '@ramassa/shared/accounts';

interface ParticipantAccountCompletionActions {
  readonly showAccount: (account: CreatedParticipantAccount) => void;
  readonly linkReferral?: () => Promise<boolean>;
  readonly showLinkFailure: () => void;
}

export async function finishParticipantAccountCreation(
  account: CreatedParticipantAccount,
  actions: ParticipantAccountCompletionActions,
): Promise<void> {
  actions.showAccount(account);
  if (actions.linkReferral !== undefined && !(await actions.linkReferral())) {
    actions.showLinkFailure();
  }
}
