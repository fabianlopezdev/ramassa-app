import { createAdminI18n } from '@/lib/i18n';
import { getRequestLanguage } from '@/lib/request-language';
import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { getLanguageDirection, type SupportedLanguage } from '@ramassa/shared/i18n';
import appCss from '../styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Ramassa Admin' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  // Resolved once per request on the server (cookie -> Accept-Language -> ca)
  // and dehydrated, so the client hydrates in the language the server rendered.
  loader: () => getRequestLanguage(),
  component: RootComponent,
});

function RootComponent() {
  const initialLanguage = Route.useLoaderData();
  const [i18n] = useState(() => createAdminI18n(initialLanguage));
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage);

  // React owns <html lang dir>: explicit switches after mount flow through the
  // i18next event back into render, replacing the old direct DOM pokes.
  useEffect(() => {
    const handleLanguageChanged = (nextLanguage: string) => {
      setLanguage(nextLanguage as SupportedLanguage);
    };
    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, [i18n]);

  return (
    <html lang={language} dir={getLanguageDirection(language)}>
      <head>
        <HeadContent />
      </head>
      <body>
        <I18nextProvider i18n={i18n}>
          <Outlet />
        </I18nextProvider>
        <Scripts />
      </body>
    </html>
  );
}
