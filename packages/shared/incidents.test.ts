import { describe, expect, test } from 'bun:test';
import {
  fetchMyIncidentFormSource,
  fetchOwnIncidentReports,
  fetchStaffIncidentReports,
  INCIDENT_FIXED_FIELD_IDS,
  INCIDENT_REPORT_SCREEN,
  incidentFormCatalog,
  incidentReportFromWalk,
  incidentReportSchema,
  sendIncidentReport,
  setIncidentReportStatus,
  todayInMadrid,
} from './incidents';
import { customFormById, customFormScreenQuestions } from './intake-builder/custom-forms';
import { formWalkScreens } from './intake-builder/form-walk';

const FORM = '97300000-0000-4000-8000-0000000000a1';
const FIXED_SCREEN = '97300000-0000-4000-8000-0000000000a2';
const SECOND_SCREEN = '97300000-0000-4000-8000-0000000000a3';
const WHO = '97300000-0000-4000-8000-0000000000b1';
const HURT = '97300000-0000-4000-8000-0000000000b2';

function placement(id: string, fieldId: string, screen: string, type: string, required: boolean) {
  return {
    id,
    field_id: fieldId,
    screen_key: screen,
    sort_order: 0,
    required,
    label_override: null,
    help_override: null,
    field: {
      label: { ca: `Pregunta ${type}` },
      help: null,
      options: [],
      settings: {},
      question_type: type,
    },
  };
}

// What `my_incident_form()` sends: the form, its screens in order and its questions.
const FORM_ROW = {
  form_id: FORM,
  name: { ca: "Formulari d'incidents" },
  content: {
    name: { ca: "Formulari d'incidents" },
    screens: [
      {
        id: FIXED_SCREEN,
        title: { ca: 'Reportar un incident' },
        intro: null,
        sort_order: 0,
        texts: {},
        system_screen: 'incident_report',
      },
      {
        id: SECOND_SCREEN,
        title: { ca: 'Més detalls' },
        intro: null,
        sort_order: 1,
        texts: {},
        system_screen: null,
      },
    ],
    placements: [
      placement('97300000-0000-4000-8000-0000000000d1', HURT, FIXED_SCREEN, 'yes_no', false),
      placement('97300000-0000-4000-8000-0000000000d2', WHO, SECOND_SCREEN, 'short_text', true),
    ],
  },
};

const LABELS = {
  what: { ca: 'Què ha passat?' },
  when: { ca: 'Quan va passar?' },
  where: { ca: 'On va passar?' },
};

describe('the incident report (RAPP-973)', () => {
  test('what, when and where are needed; the day is today or before', () => {
    const today = todayInMadrid();
    expect(
      incidentReportSchema.parse({
        what: '  Em van insultar  ',
        happenedOn: today,
        where: ' Al camp ',
        isAnonymous: true,
      }),
    ).toEqual({ what: 'Em van insultar', happenedOn: today, where: 'Al camp', isAnonymous: true });
    expect(
      incidentReportSchema.safeParse({
        what: ' ',
        happenedOn: today,
        where: 'Al camp',
        isAnonymous: false,
      }).success,
    ).toBe(false);
    expect(
      incidentReportSchema.safeParse({
        what: 'Algo',
        happenedOn: '2999-01-01',
        where: 'Al camp',
        isAnonymous: false,
      }).success,
    ).toBe(false);
  });

  test('today is the day in Madrid', () => {
    // 23:30 UTC on the 25th is already the 26th in Madrid.
    expect(todayInMadrid(new Date('2026-11-25T23:30:00Z'))).toBe('2026-11-26');
  });

  test('her phone walks what, when and where first on the fixed screen, then the questions staff added', async () => {
    const source = await fetchMyIncidentFormSource({
      rpc: async (name: string) => ({
        data:
          name === 'intake_catalog'
            ? { screens: [], overrides: [], presets: [], sections: [], fields: [], placements: [] }
            : FORM_ROW,
        error: null,
      }),
    } as never);
    if (source.form === null) throw new Error('the form did not parse');
    const catalog = incidentFormCatalog(source.raw, source.form, LABELS);
    const form = customFormById(catalog, FORM);
    if (form === undefined) throw new Error('the form is not in the catalog');
    expect(form.systemKey).toBe('incident');
    expect(formWalkScreens(catalog, form, {}).map((screen) => screen.systemScreen ?? null)).toEqual(
      [INCIDENT_REPORT_SCREEN, null],
    );
    expect(
      customFormScreenQuestions(catalog, FIXED_SCREEN).map((question) => [
        question.id,
        question.type,
        question.isRequired,
      ]),
    ).toEqual([
      [INCIDENT_FIXED_FIELD_IDS.what, 'long_text', true],
      [INCIDENT_FIXED_FIELD_IDS.when, 'date', true],
      [INCIDENT_FIXED_FIELD_IDS.where, 'short_text', true],
      [HURT, 'yes_no', false],
    ]);
  });

  test('a report goes with her answers to the added questions only, and the anonymous switch', async () => {
    const walked = incidentReportFromWalk(
      {
        [INCIDENT_FIXED_FIELD_IDS.what]: 'Em van insultar',
        [INCIDENT_FIXED_FIELD_IDS.when]: '2026-11-20',
        [INCIDENT_FIXED_FIELD_IDS.where]: 'Al vestidor',
        [WHO]: 'Un entrenador',
        [HURT]: null,
      },
      true,
    );
    let rpcName: string | undefined;
    let rpcArgs: unknown;
    await sendIncidentReport(
      {
        rpc: async (name: string, args: unknown) => {
          rpcName = name;
          rpcArgs = args;
          return { data: '97300000-0000-4000-8000-0000000000e1', error: null };
        },
      } as never,
      walked.report,
      walked.answers,
    );
    expect(rpcName).toBe('send_incident_report');
    expect(rpcArgs).toEqual({
      p_what: 'Em van insultar',
      p_happened_on: '2026-11-20',
      p_where: 'Al vestidor',
      p_is_anonymous: true,
      p_answers: { [WHO]: 'Un entrenador' },
    });
  });

  test('her list reads her reports', async () => {
    const reports = await fetchOwnIncidentReports({
      rpc: () => ({
        data: [
          {
            id: '97300000-0000-4000-8000-0000000000e1',
            happened_on: '2026-11-20',
            is_anonymous: true,
            status: 'open',
            created_at: '2026-11-25T10:00:00.000Z',
          },
        ],
        error: null,
      }),
    } as never);
    expect(reports).toEqual([
      {
        id: '97300000-0000-4000-8000-0000000000e1',
        happenedOn: '2026-11-20',
        isAnonymous: true,
        status: 'open',
        createdAt: '2026-11-25T10:00:00.000Z',
      },
    ]);
  });
});

describe("the team's reports (RAPP-973)", () => {
  const row = {
    id: '97300000-0000-4000-8000-0000000000e1',
    is_anonymous: false,
    player_id: '97300000-0000-4000-8000-000000000002',
    player_first_name: 'Jugadora',
    player_last_name: 'Prova',
    what: 'Em van insultar',
    happened_on: '2026-11-20',
    where_text: 'Al camp',
    status: 'open',
    closed_at: null,
    created_at: '2026-11-25T10:00:00.000Z',
    updated_at: '2026-11-25T10:00:00.000Z',
    answers: [
      {
        field_id: WHO,
        question: { label: { ca: 'Qui hi era?' }, question_type: 'short_text', settings: {} },
        value: 'Un entrenador',
      },
    ],
  };

  test('a named report names her; an anonymous one names nobody', async () => {
    const reports = await fetchStaffIncidentReports({
      rpc: () => ({
        data: [
          row,
          // An anonymous report: the database sends no id and no name. Should a
          // name ever come with it, the phone and the dashboard still show nobody.
          { ...row, id: '97300000-0000-4000-8000-0000000000e2', is_anonymous: true },
        ],
        error: null,
      }),
    } as never);
    expect(reports[0]?.sender).toEqual({
      kind: 'named',
      playerId: row.player_id,
      firstName: 'Jugadora',
      lastName: 'Prova',
    });
    expect(reports[0]?.answers.map((answer) => answer.value)).toEqual(['Un entrenador']);
    expect(reports[1]?.sender).toEqual({ kind: 'anonymous' });
  });

  test('the team closes a report or opens it again', async () => {
    let rpcArgs: unknown;
    await setIncidentReportStatus(
      {
        rpc: async (_name: string, args: unknown) => {
          rpcArgs = args;
          return { data: null, error: null };
        },
      } as never,
      row.id,
      'closed',
    );
    expect(rpcArgs).toEqual({ p_report_id: row.id, p_status: 'closed' });
  });
});
