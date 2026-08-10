import { describe, expect, test } from 'bun:test';
import { getServiceCategoryContract } from './definitions';
import {
  applyOptimisticServiceInterest,
  buildServiceContactLinks,
  fetchPlayerServices,
  parseHttpsExternalUrl,
  setPlayerServiceInterest,
  type PlayerServiceRow,
} from './player';

const service = {
  id: '5eed0000-0000-4000-800a-000000000001',
  interested: false,
} as PlayerServiceRow;

describe('player service contact links', () => {
  test('keeps external destinations HTTPS-only and builds native contact actions', () => {
    expect(parseHttpsExternalUrl('https://example.test/support')).toBe(
      'https://example.test/support',
    );
    expect(parseHttpsExternalUrl('http://example.test/support')).toBeNull();
    expect(parseHttpsExternalUrl('javascript:alert(1)')).toBeNull();
    expect(parseHttpsExternalUrl('not a url')).toBeNull();

    expect(
      buildServiceContactLinks(
        {
          phone: '+34 930 00 00 00',
          email: 'serveis@example.test',
          location: 'Carrer Major 1, Vic',
          externalUrl: 'https://example.test/support',
        },
        'android',
      ),
    ).toEqual({
      phone: 'tel:+34930000000',
      email: 'mailto:serveis@example.test',
      map: 'geo:0,0?q=Carrer%20Major%201%2C%20Vic',
      external: 'https://example.test/support',
    });
  });
});

describe('player service interest', () => {
  test('optimistic toggling is idempotent and changes only the selected service', () => {
    const other = {
      id: '5eed0000-0000-4000-800a-000000000002',
      interested: false,
    } as PlayerServiceRow;
    const marked = applyOptimisticServiceInterest([service, other], service.id, true);
    const markedAgain = applyOptimisticServiceInterest(marked, service.id, true);

    expect(marked.map(({ interested }) => interested)).toEqual([true, false]);
    expect(markedAgain).toEqual(marked);
    expect(service.interested).toBe(false);
  });

  test('the write boundary sends one desired state to the idempotent database function', async () => {
    const calls: unknown[] = [];
    const client = {
      async rpc(name: string, args: unknown) {
        calls.push([name, args]);
        return { data: true, error: null };
      },
    };

    await expect(
      setPlayerServiceInterest(client as never, {
        serviceId: service.id,
        interested: true,
      }),
    ).resolves.toBe(true);
    expect(calls).toEqual([
      ['set_service_interest', { p_service_id: service.id, p_interested: true }],
    ]);
  });
});

describe('player service directory query', () => {
  test('applies database filters and reads only the caller interest relation', async () => {
    const calls: Array<readonly [string, ...unknown[]]> = [];
    const query = {
      eq(column: string, value: unknown) {
        calls.push(['eq', column, value]);
        return this;
      },
      contains(column: string, value: unknown) {
        calls.push(['contains', column, value]);
        return this;
      },
      order(column: string, options: unknown) {
        calls.push(['order', column, options]);
        return this;
      },
      abortSignal(signal: AbortSignal) {
        calls.push(['abortSignal', signal]);
        return this;
      },
      then(resolve: (value: unknown) => void) {
        resolve({
          data: [
            {
              id: service.id,
              category_id: '5eed0000-0000-4000-8009-000000000001',
              title: { ca: 'Habitació', es: 'Habitación', en: 'Room', ar: 'غرفة', fa: 'اتاق' },
              description: null,
              provider_name: 'Habitat3',
              location: 'Vic',
              zone: 'Osona',
              cost_type: 'subsidized',
              cost_amount: 120,
              cost_details: null,
              contact_name: null,
              contact_phone: null,
              contact_email: null,
              contact_role: null,
              schedule: null,
              external_url: 'https://example.test/room',
              availability: 'available',
              metadata: { housing_type: 'shared_flat' },
              images: [],
              interests: [{ id: '5eed0000-0000-4000-800c-000000000001' }],
            },
          ],
          error: null,
        });
      },
    };
    const client = {
      from(table: string) {
        calls.push(['from', table]);
        return {
          select(columns: string) {
            calls.push(['select', columns]);
            return query;
          },
        };
      },
    };

    const signal = new AbortController().signal;
    const rows = await fetchPlayerServices(
      client as never,
      {
        categoryId: '5eed0000-0000-4000-8009-000000000001',
        categorySlug: 'housing',
        categoryContract: getServiceCategoryContract('housing'),
        zone: 'Osona',
        costType: 'subsidized',
        availability: 'available',
        metadata: { housing_type: 'shared_flat' },
      },
      { signal },
    );

    expect(rows[0]?.interested).toBe(true);
    expect(calls).toEqual([
      ['from', 'services'],
      ['select', expect.stringContaining('interests:service_interests(id)')],
      ['eq', 'category_id', '5eed0000-0000-4000-8009-000000000001'],
      ['eq', 'zone', 'Osona'],
      ['eq', 'cost_type', 'subsidized'],
      ['eq', 'availability', 'available'],
      ['contains', 'metadata', { housing_type: 'shared_flat' }],
      ['order', 'updated_at', { ascending: false }],
      ['order', 'id', { ascending: true }],
      ['abortSignal', signal],
    ]);
  });
});
