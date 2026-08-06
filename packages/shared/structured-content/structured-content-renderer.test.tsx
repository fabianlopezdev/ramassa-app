import { render } from '@testing-library/react';
import { describe, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import {
  StructuredContentRenderer,
  type StructuredContentComponents,
} from './structured-content-renderer';

const components: StructuredContentComponents = {
  Container: ({ children }: { readonly children: ReactNode }) => (
    <article data-testid="content">{children}</article>
  ),
  Paragraph: ({ text }) => <p>{text}</p>,
  Step: ({ number, title, text, imageUrl, imageAlt }) => (
    <section>
      <h2>{`${number}. ${title}`}</h2>
      <p>{text}</p>
      {imageUrl === null ? null : <img src={imageUrl} alt={imageAlt ?? ''} />}
    </section>
  ),
  Video: ({ embedUrl, title }) => <iframe src={embedUrl} title={title} />,
  Unsupported: ({ index }) => <p>{`Unavailable block ${index + 1}`}</p>,
};

describe('StructuredContentRenderer', () => {
  test('renders paragraphs, numbered steps, accessible images, and an allowlisted video', () => {
    const view = render(
      <StructuredContentRenderer
        blocks={[
          { type: 'paragraph', text: 'Bring your registration receipt.' },
          {
            type: 'step',
            title: 'Prepare your documents',
            text: 'Place them together before your appointment.',
            imageUrl: 'ramassa/knowledge/documents.webp',
            imageAlt: 'Documents arranged on a table',
          },
        ]}
        videoUrl="https://youtu.be/dQw4w9WgXcQ"
        videoTitle="How to prepare"
        components={components}
      />,
    );

    expect(view.getByText('Bring your registration receipt.')).toBeTruthy();
    expect(view.getByRole('heading', { name: '1. Prepare your documents' })).toBeTruthy();
    expect(view.getByAltText('Documents arranged on a table')).toBeTruthy();
    expect(
      (
        view.getByTitle('How to prepare') as unknown as {
          getAttribute(name: string): string | null;
        }
      ).getAttribute('src'),
    ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  test('uses a safe fallback for unknown or malformed blocks without exposing their payload', () => {
    const view = render(
      <StructuredContentRenderer
        blocks={[
          { type: 'future-widget', secret: 'private raw payload' },
          { type: 'paragraph', text: '' },
        ]}
        videoUrl="https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"
        videoTitle="Unsafe video"
        components={components}
      />,
    );

    expect(view.getByText('Unavailable block 1')).toBeTruthy();
    expect(view.getByText('Unavailable block 2')).toBeTruthy();
    expect(view.queryByText('private raw payload')).toBeNull();
    expect(view.queryByTitle('Unsafe video')).toBeNull();
  });
});
