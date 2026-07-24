import { safeAsync } from '@/lib/observability';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { AppError, errorCodeRegistry, type AppErrorCode } from '@ramassa/shared/errors';
import { DevButton, DevButtonRow, DevNote, DevSection } from './dev-ui';

const ERROR_CODES = Object.keys(errorCodeRegistry) as AppErrorCode[];

/**
 * Error testing (RAPP-19 scope item 6): exercises the RAPP-12 pipeline on demand.
 *
 * Two different paths, deliberately kept apart because they prove different
 * things. Throwing during render proves the ErrorBoundary chain and the
 * translated fallback screen. Failing inside `safeAsync` proves the quiet path:
 * logger, redactor, Sentry, and a `Result` the caller can render.
 *
 * The code picker is the part worth having: every code has a translated message
 * in all five locales, and this is the only way to actually LOOK at one without
 * reproducing the failure. Switch language above, pick a code, read the fallback.
 */
export function DevErrorsSection() {
  const [codeToThrow, setCodeToThrow] = useState<AppErrorCode | null>(null);
  const [status, setStatus] = useState('');

  if (codeToThrow !== null) {
    throw new AppError(codeToThrow, { message: `dev menu forced ${codeToThrow} (RAPP-19)` });
  }

  return (
    <DevSection title="Errors">
      <DevNote>
        Throwing renders the translated fallback for that code. safeAsync stays quiet and reports.
      </DevNote>
      <DevButtonRow>
        <DevButton
          label="Fail inside safeAsync"
          onPress={() => {
            void safeAsync(() => Promise.reject(new Error('dev menu forced async failure')), {
              code: 'NETWORK-1',
              context: { trigger: 'dev-menu' },
            }).then((result) =>
              setStatus(result.ok ? 'unexpectedly ok' : `Handled ${result.error.code}, reported.`),
            );
          }}
        />
      </DevButtonRow>
      {status === '' ? null : <DevNote>{status}</DevNote>}

      <DevNote>Throw any code and read its translated fallback:</DevNote>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <DevButtonRow>
          {ERROR_CODES.map((code) => (
            <DevButton key={code} label={code} onPress={() => setCodeToThrow(code)} />
          ))}
        </DevButtonRow>
      </ScrollView>
    </DevSection>
  );
}
