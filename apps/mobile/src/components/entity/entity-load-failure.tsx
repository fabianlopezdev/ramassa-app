/**
 * What an entity screen shows when its data does not load (RAPP-434): the
 * error's own message, its code, and Try again. Offline the query does not
 * fail, it waits (React Query pauses it), so that shows as no connection. Her
 * data stays in memory only, because it names people, so there is nothing
 * saved to show instead.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { ErrorCodeLine } from '@/components/error-code-line';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';

interface LoadingQuery {
  readonly data: unknown;
  readonly error: unknown;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly fetchStatus: 'fetching' | 'paused' | 'idle';
  readonly refetch: () => Promise<unknown>;
}

/** Whether the screen has no data because its load failed or waits for a connection. */
export function hasLoadFailed(query: LoadingQuery): boolean {
  return query.data === undefined && (query.isError || query.fetchStatus === 'paused');
}

export function EntityLoadFailure({ query }: { readonly query: LoadingQuery }) {
  const { t } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const code = query.isError ? toAppError(query.error).code : 'NETWORK-1';
  return (
    <View
      testID="entity-load-failure"
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        selectable
        accessibilityRole="alert"
        className={`text-start text-md text-neutral-800 ${fontClass}`}
      >
        {t(getErrorMessageKey(code))}
      </Text>
      <ErrorCodeLine code={code} />
      <AuthSubmitButton
        testID="entity-load-retry"
        label={t('retry')}
        onPress={() => void query.refetch()}
        isLoading={query.fetchStatus === 'fetching'}
      />
    </View>
  );
}
