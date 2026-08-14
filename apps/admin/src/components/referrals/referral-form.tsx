import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  createReferral,
  createReferralSchema,
  DOCUMENTATION_STATUSES,
  type CreateReferral,
  type CreateReferralInput,
} from '@ramassa/shared/referrals';

export function ReferralForm() {
  const { t } = useTranslation('referrals');
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateReferralInput, unknown, CreateReferral>({
    resolver: zodResolver(createReferralSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      documentationStatus: 'in_progress',
      notes: '',
    },
  });

  const submit = handleSubmit(async (input) => {
    setFailed(false);
    const result = await safeAsync(() => createReferral(supabase, input), {
      context: { operation: 'entity-referral-create' },
    });
    if (!result.ok) {
      setFailed(true);
      return;
    }
    await navigate({
      to: '/portal/referrals/$referralId',
      params: { referralId: result.value },
    });
  });

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header>
        <Link
          to="/portal/referrals"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t('back')}
        </Link>
        <h1 className="mt-3 text-start text-2xl font-semibold">{t('formTitle')}</h1>
        <p className="mt-1 text-start text-sm text-muted-foreground">{t('formIntro')}</p>
      </header>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => void submit(event)}
        data-testid="referral-form"
      >
        <Controller
          name="firstName"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              id="referral-first-name"
              label={t('firstName')}
              errorMessage={errors.firstName ? t('requiredError') : undefined}
            />
          )}
        />
        <Controller
          name="lastName"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              id="referral-last-name"
              label={t('lastName')}
              errorMessage={errors.lastName ? t('requiredError') : undefined}
            />
          )}
        />
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              value={field.value ?? ''}
              id="referral-phone"
              type="tel"
              label={t('phone')}
            />
          )}
        />
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <AdminAuthField
              {...field}
              value={field.value ?? ''}
              id="referral-email"
              type="email"
              label={t('email')}
              errorMessage={errors.email ? t('emailError') : undefined}
            />
          )}
        />
        <Controller
          name="documentationStatus"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="referral-documentation" className="text-start text-sm font-medium">
                {t('documentationLabel')}
              </label>
              <select
                {...field}
                id="referral-documentation"
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {DOCUMENTATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`documentation.${status}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        />
        <Controller
          name="notes"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="referral-notes" className="text-start text-sm font-medium">
                {t('notes')}
              </label>
              <Textarea {...field} value={field.value ?? ''} id="referral-notes" rows={5} />
            </div>
          )}
        />
        {failed ? (
          <p role="alert" className="text-start text-sm text-destructive">
            {t('saveError')}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={isSubmitting} data-testid="referral-submit">
          {t('save')}
        </Button>
      </form>
    </section>
  );
}
