import { loginWithPassword, logout } from '@/lib/auth';
import {
  DEV_ALL_PLAYER_ACCOUNTS,
  DEV_PLAYER_ACCOUNTS,
  DEV_STAFF_ACCOUNTS,
  type DevAccount,
} from '@/lib/dev/dev-accounts';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { DevButton, DevButtonRow, DevDangerButton, DevNote, DevSection } from './dev-ui';

// The bundled families that render each script (ADR-006). Per ACCOUNT, not per
// current language, which is the whole point: the roster must show every script
// at once so a missing font is visible without switching languages five times.
const fontClassByFamilyKey = {
  sans: 'font-sans',
  arabic: 'font-arabic',
  farsi: 'font-farsi',
} as const;

function DevAccountRow({
  account,
  isCurrent,
  onPress,
}: {
  account: DevAccount;
  isCurrent: boolean;
  onPress: (account: DevAccount) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Sign in as ${account.email}`}
      onPress={() => onPress(account)}
      className={`min-h-recommended justify-center rounded-md border px-md py-sm active:opacity-70 ${
        isCurrent ? 'border-primary bg-primary-light/20' : 'border-neutral-200 bg-white'
      }`}
    >
      <Text
        className={`text-start text-md font-semibold text-neutral-900 ${
          fontClassByFamilyKey[account.fontFamilyKey]
        }`}
      >
        {account.displayName}
      </Text>
      <Text className="text-start text-sm text-neutral-500">
        {`${account.role} · ${account.language} · ${account.origin} · ${account.city}`}
      </Text>
      <Text className="text-start text-xs text-neutral-400">{account.email}</Text>
    </Pressable>
  );
}

/**
 * The role switcher (RAPP-19 scope item 1).
 *
 * There is no client-side role flag to flip: role comes from `profiles.role`,
 * resolved from the session, so switching role means really signing in as
 * another seeded account. That is deterministic thanks to RAPP-18 and survives
 * `supabase db reset`.
 *
 * It doubles as the AR/FA script check RAPP-20 carries from RAPP-18: every name
 * renders here in its own script with its own font, so tofu boxes are visible
 * without waiting for a participant-listing screen to exist.
 */
export function DevAccountsSection() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [showsEveryPlayer, setShowsEveryPlayer] = useState(false);

  const players = showsEveryPlayer ? DEV_ALL_PLAYER_ACCOUNTS : DEV_PLAYER_ACCOUNTS;

  async function signInAs(account: DevAccount) {
    setStatus(`Signing in as ${account.email}...`);
    const result = await loginWithPassword(account.email, account.password);
    setStatus(
      result.ok
        ? `Signed in as ${account.email}`
        : `Failed (${result.error.code}). Is the local stack seeded? bun run db:reset`,
    );
  }

  return (
    <DevSection title="Accounts and roles">
      <DevNote>
        Signs in for real with the seeded password. Requires the local Supabase stack.
      </DevNote>
      <Text className="pt-xs text-sm font-semibold text-neutral-700">Staff, admin, entities</Text>
      <View className="gap-xs">
        {DEV_STAFF_ACCOUNTS.map((account) => (
          <DevAccountRow
            key={account.email}
            account={account}
            isCurrent={user?.email === account.email}
            onPress={(selected) => void signInAs(selected)}
          />
        ))}
      </View>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">
        {showsEveryPlayer ? 'Players (all seeded)' : 'Players (one per language)'}
      </Text>
      <View className="gap-xs">
        {players.map((account) => (
          <DevAccountRow
            key={account.email}
            account={account}
            isCurrent={user?.email === account.email}
            onPress={(selected) => void signInAs(selected)}
          />
        ))}
      </View>

      <DevButtonRow>
        <DevButton
          label={showsEveryPlayer ? 'Show one per language' : 'Show all 20 players'}
          onPress={() => setShowsEveryPlayer((shown) => !shown)}
        />
        <DevDangerButton label="Sign out" onPress={() => void logout()} />
      </DevButtonRow>
      {status === '' ? null : <DevNote>{status}</DevNote>}
    </DevSection>
  );
}
