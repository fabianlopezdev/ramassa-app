import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppError } from '@ramassa/shared/errors';
import type { KnowledgeBlock } from '@ramassa/shared/knowledge';
import {
  StructuredContentRenderer as SharedStructuredContentRenderer,
  type StructuredContentComponents,
} from '@ramassa/shared/structured-content';
import { AuthenticatedMediaImage } from './authenticated-media-image';

interface AdminStructuredContentContextValue {
  readonly mediaWorkerUrl: string;
  readonly accessToken: string | undefined;
}

const AdminStructuredContentContext = createContext<AdminStructuredContentContextValue | null>(
  null,
);

function useAdminStructuredContentContext() {
  const value = useContext(AdminStructuredContentContext);
  if (value === null) {
    throw new AppError('VALIDATION-1', {
      message: 'Admin structured content is missing its provider',
    });
  }
  return value;
}

function Container({ children }: { readonly children: ReactNode }) {
  return (
    <article className="flex flex-col gap-4" data-testid="knowledge-preview">
      {children}
    </article>
  );
}

function Paragraph({ text }: { readonly text: string }) {
  return <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>;
}

function Step({
  number,
  title,
  text,
  imageUrl,
  imageAlt,
}: {
  readonly number: number;
  readonly title: string;
  readonly text: string;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
}) {
  const { mediaWorkerUrl, accessToken } = useAdminStructuredContentContext();
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h3 className="font-semibold">{`${number}. ${title}`}</h3>
      <p className="whitespace-pre-wrap text-sm leading-6">{text}</p>
      {imageUrl === null ? null : (
        <AuthenticatedMediaImage
          objectKeyOrUrl={imageUrl}
          alt={imageAlt ?? ''}
          mediaWorkerUrl={mediaWorkerUrl}
          accessToken={accessToken}
          className="max-h-80 rounded-md object-contain"
        />
      )}
    </section>
  );
}

function Video({ embedUrl, title }: { readonly embedUrl: string; readonly title: string }) {
  return (
    <iframe
      src={embedUrl}
      title={title}
      className="aspect-video w-full rounded-lg border"
      allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      allowFullScreen
    />
  );
}

function Unsupported() {
  const { t } = useTranslation('knowledge');
  return <p className="rounded-md bg-muted p-3 text-sm">{t('knowledge:contentUnavailable')}</p>;
}

const components: StructuredContentComponents = {
  Container,
  Paragraph,
  Step,
  Video,
  Unsupported,
};

export interface StructuredContentRendererProps {
  readonly title: string;
  readonly blocks: readonly KnowledgeBlock[];
  readonly videoUrl: string | null;
  readonly mediaWorkerUrl?: string;
  readonly accessToken?: string;
}

export function StructuredContentRenderer({
  title,
  blocks,
  videoUrl,
  mediaWorkerUrl = '',
  accessToken,
}: StructuredContentRendererProps) {
  const contextValue = useMemo(
    () => ({ mediaWorkerUrl, accessToken }),
    [accessToken, mediaWorkerUrl],
  );
  return (
    <AdminStructuredContentContext.Provider value={contextValue}>
      <SharedStructuredContentRenderer
        blocks={blocks}
        videoUrl={videoUrl}
        videoTitle={title}
        components={components}
      />
    </AdminStructuredContentContext.Provider>
  );
}
