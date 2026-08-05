import { loadAuthenticatedMediaObjectUrl } from '@/components/content/authenticated-media-image';
import { StructuredContentRenderer } from '@/components/content/structured-content-renderer';
import { render } from '@testing-library/react';
import { expect, test } from 'bun:test';

test('the browser loads a private knowledge image with a bearer header, never a token URL', async () => {
  const calls: Array<{ url: string; headers: Headers }> = [];
  const fetchImplementation = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(new Blob(['image bytes'], { type: 'image/jpeg' }), { status: 200 });
  }) as typeof fetch;

  const result = await loadAuthenticatedMediaObjectUrl({
    objectKey: 'org/knowledge-base/user/2026/08/photo.jpg',
    mediaWorkerUrl: 'https://media.example',
    accessToken: 'private-access-token',
    fetchImplementation,
    createObjectUrl: () => 'blob:https://admin.example/private-image',
  });

  expect(result).toBe('blob:https://admin.example/private-image');
  expect(calls[0]?.url).toBe(
    'https://media.example/objects/org/knowledge-base/user/2026/08/photo.jpg',
  );
  expect(calls[0]?.url).not.toContain('private-access-token');
  expect(calls[0]?.headers.get('authorization')).toBe('Bearer private-access-token');
});

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
