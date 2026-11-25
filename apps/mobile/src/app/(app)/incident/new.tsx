/**
 * A new incident report (RAPP-973), opened from her reports. The form is
 * walked with the shared form walker (`FormWalker`), as a survey's is: what
 * happened, when and where come first on its fixed screen as questions of the
 * engine, then the questions staff added. Under them on that screen sits the
 * switch to send it anonymously, with the one line she needs: the team cannot
 * reply to her privately then.
 *
 * The last screen sends the report with `send_incident_report`; her answers
 * stay with the report and never reach her record. Sent, she goes back to her
 * reports, which say it was sent.
 */

import { FailureNotice } from '@/components/error-code-line';
import { FormWalker } from '@/components/forms/form-walker';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { SwitchCard } from '@/components/forms/switch-card';
import { FormWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { useIncidentFormSource, useSendIncidentReport } from '@/lib/player-incidents';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { useLanguage } from '@ramassa/shared/i18n';
import { INCIDENT_REPORT_SCREEN, incidentFormCatalog } from '@ramassa/shared/incidents';
import {
  customFormById,
  formWalkPayload,
  type CustomAnswerValue,
} from '@ramassa/shared/intake-builder';
import { tokens } from '@ramassa/shared/tokens';

/** A report asks nothing she answered before: it starts empty. */
const NO_ANSWERS: Readonly<Record<string, CustomAnswerValue>> = {};

export default function NewIncidentRoute() {
  const { t } = useTranslation('incidents');
  const { language } = useLanguage();
  const router = useRouter();
  const source = useIncidentFormSource();
  const send = useSendIncidentReport();
  const [isAnonymous, setIsAnonymous] = useState(false);
  const data = source.data;
  const catalog = useMemo(() => {
    if (data === undefined || data.form === null) return undefined;
    const only = (key: string) => ({ [language]: t(key) });
    return incidentFormCatalog(data.raw, data.form, {
      what: only('whatLabel'),
      when: only('whenLabel'),
      where: only('whereLabel'),
    });
  }, [data, language, t]);
  const form =
    catalog === undefined || data?.form == null
      ? undefined
      : customFormById(catalog, data.form.formId);

  if (source.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50" testID="incident-loading">
        <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
      </View>
    );
  }
  if (catalog === undefined || form === undefined) {
    return (
      <View className="flex-1 bg-neutral-50" testID="incident-form-failed">
        <NativeScreenHeader title={t('title')} />
        <FormWidth className="gap-sm p-lg">
          <FailureNotice
            code={source.isError ? toAppError(source.error).code : 'DB-1'}
            message={t('loadFailed')}
          />
          <RaisedActionButton label={t('retry')} onPress={() => void source.refetch()} />
        </FormWidth>
      </View>
    );
  }
  return (
    <FormWalker
      catalog={catalog}
      form={form}
      saved={NO_ANSWERS}
      sendLabel={t('submit')}
      failureMessage={t('submitFailed')}
      footer={(screen, isSending) =>
        screen.systemScreen === INCIDENT_REPORT_SCREEN ? (
          <SwitchCard
            testID="incident-anonymous"
            label={t('anonymousLabel')}
            description={t('anonymousNote')}
            value={isAnonymous}
            onValueChange={setIsAnonymous}
            isDisabled={isSending}
          />
        ) : null
      }
      onSubmit={async (draft, screens) => {
        const payload = formWalkPayload(catalog, screens, draft, language);
        const code = await send(payload.answers as Readonly<Record<string, unknown>>, isAnonymous);
        if (code === null) {
          router.dismissTo({ pathname: '/incident', params: { sent: '1' } } as Href);
        }
        return code;
      }}
      onLeave={() => router.back()}
    />
  );
}
