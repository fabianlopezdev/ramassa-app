/**
 * Ajuda for the tester ground (RAPP-885): the eight service categories with
 * twenty services and the four guide categories with ten guides. A tester
 * starts from Onboarding, so she has saved no interest yet. Most items are published minutes before the run, so
 * they raise the numbers on Ajuda and carry "Nou"; a few are weeks old and
 * count as seen.
 */

import {
  img,
  jsonb,
  lit,
  minutesAgo,
  ORG,
  TEAM,
  uid,
  type Account,
  type GroundModule,
} from '../lib/ground';
import { GUIDE_CATEGORIES, GUIDES, storedBody, type GuideSeed } from './ajuda/guides';
import { SERVICE_CATEGORIES, SERVICES, type ServiceSeed } from './ajuda/services';

const serviceCategoryId = (slug: string) => uid(`ajuda:service-category:${slug}`);
const serviceId = (key: string) => uid(`ajuda:service:${key}`);
const serviceImageId = (key: string) => uid(`ajuda:service-image:${key}`);
const guideCategoryId = (slug: string) => uid(`ajuda:guide-category:${slug}`);
const guideId = (key: string) => uid(`ajuda:guide:${key}`);

function publishedAt(published: ServiceSeed['published'] | GuideSeed['published']): string {
  return 'minutesAgo' in published
    ? minutesAgo(published.minutesAgo)
    : `(now() - interval '${published.daysAgo} days')`;
}

const list = (ids: readonly string[]) => ids.join(',\n    ');
const SERVICE_IDS = list(SERVICES.map((service) => serviceId(service.key)));
const SERVICE_CATEGORY_IDS = list(SERVICE_CATEGORIES.map((c) => serviceCategoryId(c.slug)));
const GUIDE_IDS = list(GUIDES.map((guide) => guideId(guide.key)));
const GUIDE_CATEGORY_IDS = list(GUIDE_CATEGORIES.map((c) => guideCategoryId(c.slug)));

function serviceCategoriesSql(): string {
  const rows = SERVICE_CATEGORIES.map(
    (category) =>
      `  (${serviceCategoryId(category.slug)}, ${ORG}, ${jsonb(category.name)}, ${lit(category.slug)}, ${lit(category.icon)}, ${lit(category.color)}, ${category.sortOrder}, ${jsonb(category.metadataSchema)})`,
  );
  return `insert into public.service_categories
  (id, org_id, name, slug, icon, color, sort_order, metadata_schema)
values
${rows.join(',\n')}
on conflict (id) do update set
  name = excluded.name, slug = excluded.slug, icon = excluded.icon, color = excluded.color,
  sort_order = excluded.sort_order, metadata_schema = excluded.metadata_schema;`;
}

function servicesSql(): string {
  const rows = SERVICES.map((service) => {
    const at = publishedAt(service.published);
    return `  (${serviceId(service.key)}, ${ORG}, ${serviceCategoryId(service.category)},
   ${jsonb(service.title)},
   ${jsonb(service.description)},
   ${lit(service.providerName)}, ${lit(service.location)}, ${lit(service.zone)},
   ${lit(service.costType)}, ${lit(service.costAmount)}, ${lit(service.costDetails)},
   ${lit(service.contactName)}, ${lit(service.contactPhone)}, ${lit(service.contactEmail)}, ${lit(service.contactRole)},
   ${lit(service.schedule)}, ${lit(service.externalUrl)}, ${lit(service.availability)},
   ${jsonb(service.metadata)}, 'published', ${at}, ${uid(TEAM.key)}, ${at})`;
  });
  // A second publish refreshes the content and keeps the publication time,
  // so what a tester has already seen stays seen.
  return `insert into public.services
  (id, org_id, category_id, title, description, provider_name, location, zone,
   cost_type, cost_amount, cost_details, contact_name, contact_phone, contact_email, contact_role,
   schedule, external_url, availability, metadata, status, published_at, created_by, created_at)
values
${rows.join(',\n')}
on conflict (id) do update set
  category_id = excluded.category_id, title = excluded.title, description = excluded.description,
  provider_name = excluded.provider_name, location = excluded.location, zone = excluded.zone,
  cost_type = excluded.cost_type, cost_amount = excluded.cost_amount, cost_details = excluded.cost_details,
  contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
  contact_email = excluded.contact_email, contact_role = excluded.contact_role,
  schedule = excluded.schedule, external_url = excluded.external_url,
  availability = excluded.availability, metadata = excluded.metadata;`;
}

function serviceImagesSql(): string {
  const rows = SERVICES.flatMap((service) =>
    service.image === undefined
      ? []
      : [
          `  (${serviceImageId(service.key)}, ${ORG}, ${serviceId(service.key)}, ${img(service.image.name)}, ${jsonb(service.image.alt)}, 0)`,
        ],
  );
  return `insert into public.service_images (id, org_id, service_id, url, alt_text, position)
values
${rows.join(',\n')}
on conflict (id) do update set url = excluded.url, alt_text = excluded.alt_text;`;
}

function guideCategoriesSql(): string {
  const rows = GUIDE_CATEGORIES.map(
    (category) =>
      `  (${guideCategoryId(category.slug)}, ${ORG}, ${jsonb(category.name)}, ${lit(category.slug)}, ${lit(category.icon)}, ${lit(category.color)}, ${category.sortOrder})`,
  );
  return `insert into public.knowledge_categories (id, org_id, name, slug, icon, color, sort_order)
values
${rows.join(',\n')}
on conflict (id) do update set
  name = excluded.name, slug = excluded.slug, icon = excluded.icon, color = excluded.color,
  sort_order = excluded.sort_order;`;
}

function guidesSql(): string {
  const rows = GUIDES.map((guide) => {
    const at = publishedAt(guide.published);
    const image = guide.image === undefined ? 'null' : img(guide.image);
    return `  (${guideId(guide.key)}, ${ORG}, ${guideCategoryId(guide.category)},
   ${jsonb(guide.title)},
   ${jsonb(storedBody(guide.body))},
   ${image}, ${lit(guide.contentType)}, true, ${at}, ${uid(TEAM.key)}, ${at})`;
  });
  return `insert into public.knowledge_articles
  (id, org_id, category_id, title, body, image_url, content_type, is_published, published_at, created_by, created_at)
values
${rows.join(',\n')}
on conflict (id) do update set
  category_id = excluded.category_id, title = excluded.title, body = excluded.body,
  image_url = excluded.image_url, content_type = excluded.content_type;`;
}

/** Drops her interests on these services and the staff notices they raised. */
function clearInterestsSql(tester: Account): string {
  return `delete from public.service_submission_notifications
where kind = 'service_interest'
  and created_by = ${uid(tester.key)}
  and service_id in (
    ${SERVICE_IDS}
  );
delete from public.service_interests
where user_id = ${uid(tester.key)}
  and service_id in (
    ${SERVICE_IDS}
  );`;
}

const ajuda: GroundModule = {
  name: 'ajuda',
  order: 50,

  publish() {
    return [
      '-- ajuda: service categories, services and their images',
      serviceCategoriesSql(),
      servicesSql(),
      serviceImagesSql(),
      '-- ajuda: guide categories and guides',
      guideCategoriesSql(),
      guidesSql(),
    ].join('\n\n');
  },

  renew(tester) {
    // A tester starts from Onboarding with no saved interest, so renew takes
    // away the ones she saved while testing.
    return [`-- ajuda: no saved interest (${tester.key})`, clearInterestsSql(tester)].join('\n\n');
  },

  remove() {
    // The list visits name a category in their key and have no foreign key,
    // so they go first by hand; every other row hangs from a service or a
    // guide and goes with it.
    const serviceVisitKeys = SERVICE_CATEGORIES.map(
      (category) => `'services:' || ${serviceCategoryId(category.slug)}::text`,
    );
    const guideVisitKeys = GUIDE_CATEGORIES.map(
      (category) => `'guides:' || ${guideCategoryId(category.slug)}::text`,
    );
    return `-- ajuda: remove everything publish created
delete from public.list_visits
where list_key in (
    ${list([...serviceVisitKeys, ...guideVisitKeys])}
  );

delete from public.services
where id in (
    ${SERVICE_IDS}
  );

delete from public.service_categories
where id in (
    ${SERVICE_CATEGORY_IDS}
  );

delete from public.knowledge_articles
where id in (
    ${GUIDE_IDS}
  );

delete from public.knowledge_categories
where id in (
    ${GUIDE_CATEGORY_IDS}
  );`;
  },
};

export default ajuda;
