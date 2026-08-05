import { normalizeVideoEmbedUrl, type KnowledgeBlock } from '@ramassa/shared/knowledge';
import { AuthenticatedMediaImage } from './authenticated-media-image';

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
  const embedUrl = videoUrl === null ? null : normalizeVideoEmbedUrl(videoUrl);
  return (
    <article className="flex flex-col gap-4" data-testid="knowledge-preview">
      {blocks.map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={`paragraph-${index}`} className="whitespace-pre-wrap text-sm leading-6">
            {block.text}
          </p>
        ) : (
          <section key={`step-${index}`} className="flex flex-col gap-2 rounded-lg border p-4">
            <h3 className="font-semibold">{block.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-6">{block.text}</p>
            {block.imageUrl === null ? null : (
              <AuthenticatedMediaImage
                objectKeyOrUrl={block.imageUrl}
                alt={block.imageAlt ?? ''}
                mediaWorkerUrl={mediaWorkerUrl}
                accessToken={accessToken}
                className="max-h-80 rounded-md object-contain"
              />
            )}
          </section>
        ),
      )}
      {embedUrl === null ? null : (
        <iframe
          src={embedUrl}
          title={title}
          className="aspect-video w-full rounded-lg border"
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allowFullScreen
        />
      )}
    </article>
  );
}
