import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_staff/messages/')({
  component: StaffMessagesLanding,
});

function StaffMessagesLanding() {
  const { t } = useTranslation('messaging');
  return (
    <section
      data-testid="conversation-empty-pane"
      className="grid min-h-72 place-content-center gap-2 p-6 text-center"
    >
      <h2 className="text-lg font-semibold">{t('selectConversationTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('selectConversationBody')}</p>
    </section>
  );
}
