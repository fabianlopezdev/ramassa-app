import { loginWithPassword } from '@/lib/auth';
import { resolveDevMenuLink } from '@/lib/dev/dev-menu-link';
import { reloadAppAsync } from 'expo';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { I18nManager, Text } from 'react-native';
import { getLanguageDirection, useLanguage } from '@ramassa/shared/i18n';
import { DevButton, DevButtonRow, DevSection } from './dev-ui';

type LinkState =
  | { readonly key: string; readonly status: 'applying' }
  | { readonly key: string; readonly status: 'applied' | 'failed'; readonly message: string };

/**
 * Applies a `dev-menu?language=..&account=..` link (RAPP-500), and says so in a
 * line the smoke suite waits for: `dev-link-applied` or `dev-link-failed`.
 * Rendered first, so the result is on screen without scrolling. Renders nothing
 * when the menu was opened without a request.
 */
export function DevLinkSection() {
  const params = useLocalSearchParams<{ language?: string; account?: string }>();
  const request = resolveDevMenuLink(params);
  const { setLanguage } = useLanguage();
  const [state, setState] = useState<LinkState | undefined>(undefined);
  const requestKey = request?.key;

  useEffect(() => {
    if (request === undefined || state?.key === request.key) return;
    setState({ key: request.key, status: 'applying' });
    void (async () => {
      if (request.problems.length > 0) {
        setState({ key: request.key, status: 'failed', message: request.problems.join('; ') });
        return;
      }
      const done: string[] = [];
      if (request.language !== undefined) {
        await setLanguage(request.language);
        done.push(`language ${request.language}`);
      }
      if (request.account !== undefined) {
        const result = await loginWithPassword(request.account.email, request.account.password);
        if (!result.ok) {
          setState({
            key: request.key,
            status: 'failed',
            message: `sign-in as ${request.account.email} failed (${result.error.code})`,
          });
          return;
        }
        done.push(`signed in as ${request.account.email}`);
      }
      setState({ key: request.key, status: 'applied', message: done.join(', ') });
    })();
    // The request is rebuilt from the params on every render; its key is its identity.
  }, [requestKey]);

  if (request === undefined || state === undefined) return null;
  const isNativeDirectionStale =
    request.language !== undefined &&
    I18nManager.isRTL !== (getLanguageDirection(request.language) === 'rtl');

  return (
    <DevSection title="Link request">
      <Text testID={`dev-link-${state.status}`} className="text-sm font-medium text-neutral-900">
        {state.status === 'applying' ? 'Applying...' : `${state.status}: ${state.message}`}
      </Text>
      {state.status === 'applied' && isNativeDirectionStale ? (
        <DevButtonRow>
          <DevButton label="Reload app to apply direction" onPress={() => void reloadAppAsync()} />
        </DevButtonRow>
      ) : null}
    </DevSection>
  );
}
