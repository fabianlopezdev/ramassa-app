import type { ComponentType, ReactNode } from 'react';
import { knowledgeBlockSchema, normalizeVideoEmbedUrl } from '../knowledge';

export interface StructuredContentContainerProps {
  readonly children: ReactNode;
}

export interface StructuredContentParagraphProps {
  readonly text: string;
  readonly index: number;
}

export interface StructuredContentStepProps {
  readonly number: number;
  readonly title: string;
  readonly text: string;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly index: number;
}

export interface StructuredContentVideoProps {
  readonly embedUrl: string;
  readonly title: string;
}

export interface StructuredContentUnsupportedProps {
  readonly index: number;
}

/**
 * Platform adapters own presentation and media delivery. The shared renderer
 * owns parsing, ordering, video allowlisting, and safe handling of future
 * blocks so the admin, native app, and player web cannot drift on trust rules.
 */
export interface StructuredContentComponents {
  readonly Container: ComponentType<StructuredContentContainerProps>;
  readonly Paragraph: ComponentType<StructuredContentParagraphProps>;
  readonly Step: ComponentType<StructuredContentStepProps>;
  readonly Video: ComponentType<StructuredContentVideoProps>;
  readonly Unsupported: ComponentType<StructuredContentUnsupportedProps>;
}

export interface StructuredContentRendererProps {
  readonly blocks: readonly unknown[];
  readonly videoUrl?: string | null;
  readonly videoTitle: string;
  readonly components: StructuredContentComponents;
}

export function StructuredContentRenderer({
  blocks,
  videoUrl = null,
  videoTitle,
  components,
}: StructuredContentRendererProps) {
  const { Container, Paragraph, Step, Video, Unsupported } = components;
  const renderedBlocks: ReactNode[] = [];
  let stepNumber = 0;

  blocks.forEach((rawBlock, index) => {
    const parsed = knowledgeBlockSchema.safeParse(rawBlock);
    if (!parsed.success) {
      renderedBlocks.push(<Unsupported key={`unsupported-${index}`} index={index} />);
      return;
    }

    if (parsed.data.type === 'paragraph') {
      renderedBlocks.push(
        <Paragraph key={`paragraph-${index}`} text={parsed.data.text} index={index} />,
      );
      return;
    }

    stepNumber += 1;
    renderedBlocks.push(
      <Step
        key={`step-${index}`}
        number={stepNumber}
        title={parsed.data.title}
        text={parsed.data.text}
        imageUrl={parsed.data.imageUrl}
        imageAlt={parsed.data.imageAlt}
        index={index}
      />,
    );
  });

  const embedUrl = videoUrl === null ? null : normalizeVideoEmbedUrl(videoUrl);
  return (
    <Container>
      {renderedBlocks}
      {embedUrl === null ? null : <Video embedUrl={embedUrl} title={videoTitle} />}
    </Container>
  );
}
