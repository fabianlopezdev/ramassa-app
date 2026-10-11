/**
 * Step-up checks (RAPP-235). The risky actions need an authenticator code from
 * the last few minutes, even in a verified session; the database refuses them
 * without one. `withStepUp` asks for the code first when the session's last one
 * is too old, and once more if the database still refuses, then runs the
 * action. Cancelling rejects with AUTH-9, which the calling screen shows like
 * any other error.
 */
import { AuthFormError } from '@/components/auth/auth-form-error';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { confirmSecondFactor, hasRecentSecondFactor } from '@ramassa/shared/auth';
import { AppError, isAppError, type AppErrorCode } from '@ramassa/shared/errors';

type WithStepUp = <T>(run: () => Promise<T>) => Promise<T>;

const StepUpContext = createContext<WithStepUp | null>(null);

export function useStepUp(): WithStepUp {
  const withStepUp = useContext(StepUpContext);
  if (withStepUp === null) {
    throw new AppError('UNEXPECTED-1', { message: 'useStepUp needs a StepUpProvider' });
  }
  return withStepUp;
}

interface PendingRequest {
  readonly resolve: () => void;
  readonly reject: (error: AppError) => void;
}

export function StepUpProvider({ children }: { readonly children: ReactNode }) {
  const [isAsking, setIsAsking] = useState(false);
  const pending = useRef<PendingRequest | null>(null);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setIsAsking(true);
      }),
    [],
  );

  const finish = useCallback((verified: boolean) => {
    const request = pending.current;
    pending.current = null;
    setIsAsking(false);
    if (verified) request?.resolve();
    else request?.reject(new AppError('AUTH-9', { message: 'Step-up cancelled' }));
  }, []);

  const withStepUp = useCallback<WithStepUp>(
    async (run) => {
      const { data } = await supabase.auth.getSession();
      if (!hasRecentSecondFactor(data.session)) await ask();
      try {
        return await run();
      } catch (thrown) {
        // The screen's clock and the database's can disagree by a little.
        if (!isAppError(thrown) || thrown.code !== 'AUTH-9') throw thrown;
        await ask();
        return run();
      }
    },
    [ask],
  );

  const value = useMemo(() => withStepUp, [withStepUp]);

  return (
    <StepUpContext.Provider value={value}>
      {children}
      <StepUpDialog open={isAsking} onFinish={finish} />
    </StepUpContext.Provider>
  );
}

function StepUpDialog({
  open,
  onFinish,
}: {
  readonly open: boolean;
  readonly onFinish: (verified: boolean) => void;
}) {
  const { t } = useTranslation('auth');
  const [code, setCode] = useState('');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  function close(verified: boolean) {
    setCode('');
    setErrorCode(null);
    onFinish(verified);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setIsVerifying(true);
    const result = await safeAsync(() => confirmSecondFactor(supabase, code));
    setIsVerifying(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    close(true);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isVerifying) close(false);
      }}
    >
      {open ? (
        <DialogContent data-testid="step-up" onInteractOutside={(event) => event.preventDefault()}>
          <DialogTitle>{t('stepUpTitle')}</DialogTitle>
          <DialogDescription>{t('stepUpIntro')}</DialogDescription>
          <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
            <AuthFormError code={errorCode} />
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="step-up-code">
              {t('secondFactorCodeLabel')}
            </label>
            <Input
              id="step-up-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={isVerifying || code.length !== 6}>
                {t('secondFactorVerifyAction')}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isVerifying}>
                  {t('stepUpCancel')}
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
