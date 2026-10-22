import { expect, test } from 'bun:test';
import { buildAuthorizationVersion } from '../testing/factories';
import { authorizationContentSchema } from './authorization';
import { numberAuthorizationDocument } from './document-numbering';

test('visible sections start at one and internal consent references follow their section', () => {
  const original = authorizationContentSchema.parse(buildAuthorizationVersion().content);
  original.sections = [
    {
      key: 'medical',
      title: { es: '2. Datos médicos', ca: '2. Dades mèdiques' },
      body: { es: 'Texto médico' },
    },
    {
      key: 'data_processing',
      title: { es: '5. Tratamiento de datos' },
      body: { es: 'Reglamento 2016/679. Política, secc. 8.6 y 9.1.' },
    },
    {
      key: 'conduct',
      title: { es: '8. Código' },
      body: { es: 'Según el apartado 5 de este mismo documento.' },
    },
    { key: 'report', title: { es: 'Cómo reportar' }, body: { es: 'Informe' } },
  ];
  original.consents.data_processing!.label = {
    es: 'Acepto según el apartado 5.',
    ca: 'Accepto segons l’apartat 5.',
  };
  const result = numberAuthorizationDocument(original);
  expect(result.sections.map((s) => s.title.es)).toEqual([
    '1. Datos médicos',
    '2. Tratamiento de datos',
    '3. Código',
    '4. Cómo reportar',
  ]);
  expect(result.sections[0]?.title.ca).toBe('1. Dades mèdiques');
  expect(result.consents.data_processing!.label.es).toBe('Acepto según el apartado 2.');
  expect(result.consents.data_processing!.label.ca).toBe('Accepto segons l’apartat 2.');
  expect(result.sections[2]?.body.es).toBe('Según el apartado 2 de este mismo documento.');
  expect(result.sections[1]?.body.es).toBe(original.sections[1]?.body.es);
  expect(original.sections[0]?.title.es).toBe('2. Datos médicos');
});
