import type { AuthorizationContent, AuthorizationText } from './authorization';

const headingNumber = /^\s*(\d+)[.)]\s*/;
const sectionReference = /\b(apartado|apartat|section)\s+(\d+)\b/gi;
const ownDocumentReference =
  /\b(apartado|apartat|section)\s+(\d+)(?=\s+(?:de este mismo documento|d’aquest mateix document|of this document))/gi;

/** Screen section numbers and their internal references share the same order. */
export function numberAuthorizationDocument(content: AuthorizationContent): AuthorizationContent {
  const numbers = new Map<string, string>();
  content.sections.forEach((section, index) => {
    for (const title of Object.values(section.title)) {
      const previous = headingNumber.exec(title ?? '')?.[1];
      if (previous !== undefined) numbers.set(previous, String(index + 1));
    }
  });
  const mapText = (
    text: AuthorizationText,
    transform: (value: string) => string,
  ): AuthorizationText =>
    Object.fromEntries(
      Object.entries(text).map(([language, value]) => [language, transform(value ?? '')]),
    );
  const references = (value: string, pattern: RegExp) =>
    value.replace(pattern, (match, label: string, previous: string) =>
      numbers.has(previous) ? `${label} ${numbers.get(previous)}` : match,
    );
  return {
    ...content,
    sections: content.sections.map((section, index) => ({
      ...section,
      title: mapText(section.title, (title) => `${index + 1}. ${title.replace(headingNumber, '')}`),
      body: mapText(section.body, (body) => references(body, ownDocumentReference)),
    })),
    consents: Object.fromEntries(
      Object.entries(content.consents).map(([key, consent]) => [
        key,
        {
          ...consent,
          label: mapText(consent.label, (label) => references(label, sectionReference)),
        },
      ]),
    ) as AuthorizationContent['consents'],
  };
}
