import { StructuredContentRenderer } from '@/components/content/structured-content-renderer';
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';

test('structured knowledge content renders hostile text as text, never as user HTML', () => {
  const hostile = '<img src=x onerror="window.__owned=true"><script>alert(1)</script>';
  const view = render(
    <StructuredContentRenderer
      title="Safety fixture"
      blocks={[
        { type: 'paragraph', text: hostile },
        {
          type: 'step',
          title: hostile,
          text: hostile,
          imageUrl: null,
          imageAlt: null,
        },
      ]}
      videoUrl={null}
    />,
  );

  expect(view.container.textContent).toContain(hostile);
  expect(view.container.innerHTML).not.toContain('<script>');
  expect(view.container.innerHTML).not.toContain('<img src="x"');
  expect(view.container.querySelector('[onerror]')).toBeNull();
});

test('structured knowledge content embeds only a normalized allowlisted video', () => {
  const allowed = render(
    <StructuredContentRenderer
      title="Video fixture"
      blocks={[{ type: 'paragraph', text: 'Watch this guide.' }]}
      videoUrl="https://youtu.be/dQw4w9WgXcQ"
    />,
  );
  expect(allowed.container.querySelector('iframe')?.getAttribute('src')).toBe(
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  );

  const denied = render(
    <StructuredContentRenderer
      title="Unsafe video fixture"
      blocks={[{ type: 'paragraph', text: 'Do not embed this.' }]}
      videoUrl="https://example.com/embed/video"
    />,
  );
  expect(denied.container.querySelector('iframe')).toBeNull();
});
