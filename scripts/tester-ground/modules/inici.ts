/**
 * Tester ground, Inici (RAPP-885): what waits for the four testers on the
 * first tab.
 *
 * - Avisos: four published minutes before the run, one of each kind, so every
 *   pill shows a number and every card says "Nou"; two published before she
 *   joined, so the list also shows avisos she has already seen.
 * - Per fer: three forms built on the form engine and sent to the four testers
 *   by name. All three wait in Per fer: a tester starts from Onboarding, so she
 *   has put nothing off with "Ara no" yet.
 * - Surveys: two, sent to a group that holds the four testers. She has opened
 *   neither. They reach her once she has finished Onboarding, because a survey
 *   goes to players (private.matches_notification_audience).
 *
 * The next activity card belongs to the Activitats module.
 */

import {
  gid,
  img,
  jsonb,
  lit,
  minutesAgo,
  ORG,
  TEAM,
  TESTERS,
  uid,
  type Account,
  type GroundModule,
} from '../lib/ground';
import {
  AVISOS,
  FORMS,
  SURVEY_GROUP_NAME,
  SURVEYS,
  type Avis,
  type Form,
  type Survey,
} from './inici/content';

const avisId = (avis: Avis) => uid(`inici:avis:${avis.key}`);
const avisPushId = (avis: Avis) => uid(`inici:avis-push:${avis.key}`);
const formId = (form: Form) => uid(`inici:form:${form.key}`);
const screenId = (form: Form) => uid(`inici:form:${form.key}:screen`);
const screenKey = (form: Form) => lit(gid(`inici:form:${form.key}:screen`));
const fieldSlug = (form: Form, questionKey: string) => `inici:form:${form.key}:q:${questionKey}`;
const formResponseId = (form: Form, tester: Account) =>
  uid(`inici:form:${form.key}:response:${tester.key}`);
const groupId = uid('inici:survey-group');
const surveyId = (survey: Survey) => uid(`inici:survey:${survey.key}`);
const surveyQuestionSlug = (survey: Survey, questionKey: string) =>
  `inici:survey:${survey.key}:q:${questionKey}`;
const surveyResponseId = (survey: Survey, tester: Account) =>
  uid(`inici:survey:${survey.key}:response:${tester.key}`);

const FORM_PUBLISHED_MINUTES_AGO = 60;

function avisPublishedAt(avis: Avis): string {
  return 'minutes' in avis.age
    ? minutesAgo(avis.age.minutes)
    : `(now() - interval '${avis.age.days} days')`;
}

const allFieldIds = () =>
  FORMS.flatMap((form) => form.questions.map((question) => uid(fieldSlug(form, question.key))));
const list = (ids: readonly string[]) => `(${ids.join(', ')})`;

// Avisos ------------------------------------------------------------------------------------------

function publishAvisos(): string {
  // An aviso published weeks ago was announced back then: its push is recorded
  // as sent, so publishing it now sends no notification for old news. The new
  // ones are announced as the staff's would be.
  const oldPushes = AVISOS.filter((avis) => 'days' in avis.age).map(
    (avis) => `
insert into public.push_publications (id, org_id, content_type, content_id, scheduled_for, state, completed_at)
values (${avisPushId(avis)}, ${ORG}, 'announcement', ${avisId(avis)}, ${avisPublishedAt(avis)}, 'complete', ${avisPublishedAt(avis)})
on conflict do nothing;`,
  );
  const rows = AVISOS.map(
    (avis) => `
insert into public.announcements
  (id, org_id, category, title, body, image_url, image_alt, is_pinned, status, published_at, created_by, created_at, updated_at)
values (
  ${avisId(avis)}, ${ORG}, ${lit(avis.category)}, ${jsonb(avis.title)}, ${jsonb(avis.body)},
  ${avis.image === null ? 'null' : img(avis.image)},
  ${avis.imageAlt === undefined ? 'null' : jsonb(avis.imageAlt)},
  ${lit(avis.isPinned)}, 'published', ${avisPublishedAt(avis)}, ${uid(TEAM.key)},
  ${avisPublishedAt(avis)}, ${avisPublishedAt(avis)}
)
on conflict (id) do nothing;`,
  );
  return [...oldPushes, ...rows].join('\n');
}

// Forms -------------------------------------------------------------------------------------------

function publishForm(form: Form): string {
  const deadline =
    form.deadlineInDays === undefined ? 'null' : `(current_date + ${form.deadlineInDays})`;
  const fields = form.questions.map(
    (question, index) => `
insert into public.profile_fields
  (id, org_id, section_id, kind, question_type, label, privacy, settings, sort_order, created_by)
select ${uid(fieldSlug(form, question.key))}, ${ORG}, section.id, 'custom', ${lit(question.type)},
       ${jsonb(question.label)}, 'normal', ${jsonb(question.settings ?? {})}, ${500 + index}, ${uid(TEAM.key)}
  from public.profile_sections as section
 where section.org_id = ${ORG} and section.key = ${lit(form.section)}
on conflict (id) do nothing;
${(question.options ?? [])
  .map(
    (option, optionIndex) => `
insert into public.custom_question_options (id, org_id, question_id, label, sort_order, key)
values (${uid(`${fieldSlug(form, question.key)}:opt:${option.key}`)}, ${ORG}, ${uid(fieldSlug(form, question.key))},
        ${jsonb(option.label)}, ${optionIndex}, ${lit(option.key)})
on conflict do nothing;`,
  )
  .join('')}
insert into public.field_placements
  (id, org_id, field_id, surface, screen_key, custom_form_id, sort_order, required)
values (${uid(`${fieldSlug(form, question.key)}:place`)}, ${ORG}, ${uid(fieldSlug(form, question.key))},
        'custom_form', ${screenKey(form)}, ${formId(form)}, ${index}, ${lit(question.required)})
on conflict do nothing;`,
  );
  return `
insert into public.custom_forms
  (id, org_id, name, filled_by, mandatory, deadline, audience, version, published_at, created_by, kind)
values (${formId(form)}, ${ORG}, ${jsonb(form.name)}, 'player', ${lit(form.mandatory)}, ${deadline},
        'chosen', 1, ${minutesAgo(FORM_PUBLISHED_MINUTES_AGO)}, ${uid(TEAM.key)}, 'other')
on conflict (id) do nothing;

insert into public.custom_form_screens (id, org_id, form_id, title, sort_order)
values (${screenId(form)}, ${ORG}, ${formId(form)}, ${jsonb(form.screenTitle)}, 0)
on conflict (id) do nothing;
${fields.join('\n')}

-- The published version, as publish_custom_form records it.
insert into public.custom_form_versions (id, org_id, form_id, version, content, published_at, published_by)
select ${uid(`inici:form:${form.key}:v1`)}, f.org_id, f.id, 1, private.custom_form_content(f.id), f.published_at, ${uid(TEAM.key)}
  from public.custom_forms as f
 where f.id = ${formId(form)}
on conflict do nothing;

insert into public.custom_form_recipients (form_id, profile_id, org_id)
select ${formId(form)}, tester.id, ${ORG}
  from unnest(array[${TESTERS.map((tester) => uid(tester.key)).join(', ')}]) as tester(id)
on conflict do nothing;
${TESTERS.map((tester) => askForm(form, tester)).join('\n')}`;
}

/** The form waiting for her, as publishing asks it, put off when the form says so. */
function askForm(form: Form, tester: Account): string {
  return `
insert into public.custom_form_responses (id, org_id, form_id, version, profile_id, status, asked_at, put_off_at)
values (${formResponseId(form, tester)}, ${ORG}, ${formId(form)}, 1, ${uid(tester.key)}, 'pending',
        ${minutesAgo(FORM_PUBLISHED_MINUTES_AGO)}, ${form.isPutOff ? minutesAgo(20) : 'null'})
on conflict do nothing;`;
}

// Surveys -----------------------------------------------------------------------------------------

function publishSurveys(): string {
  const group = `
insert into public.custom_notification_groups (id, org_id, name, created_by)
values (${groupId}, ${ORG}, ${lit(SURVEY_GROUP_NAME)}, ${uid(TEAM.key)})
on conflict (id) do nothing;

insert into public.custom_notification_group_members (org_id, group_id, participant_id)
select ${ORG}, ${groupId}, tester.id
  from unnest(array[${TESTERS.map((tester) => uid(tester.key)).join(', ')}]) as tester(id)
on conflict do nothing;`;
  const surveys = SURVEYS.map(
    (survey) => `
insert into public.surveys
  (id, org_id, title, published_at, closes_at, audience_kind, audience_config, created_by, created_at, updated_at)
values (${surveyId(survey)}, ${ORG}, ${jsonb(survey.title)}, ${minutesAgo(survey.minutesAgo)},
        (now() + interval '30 days'), 'custom_group',
        jsonb_build_object('custom_group_id', ${groupId}), ${uid(TEAM.key)},
        ${minutesAgo(survey.minutesAgo)}, ${minutesAgo(survey.minutesAgo)})
on conflict (id) do nothing;
${survey.questions
  .map(
    (question, index) => `
insert into public.survey_questions (id, org_id, survey_id, prompt, question_type, options, required, sort_order)
values (${uid(surveyQuestionSlug(survey, question.key))}, ${ORG}, ${surveyId(survey)}, ${jsonb(question.prompt)},
        ${lit(question.type)}, ${question.options === undefined ? 'null' : jsonb(question.options)},
        ${lit(question.required)}, ${(index + 1) * 10})
on conflict do nothing;`,
  )
  .join('')}
${TESTERS.map((tester) => startSurvey(survey, tester)).join('\n')}`,
  );
  return [group, ...surveys].join('\n');
}

/** Her half-answered survey, saved as save_survey_response saves it. Nothing when she has not started it. */
function startSurvey(survey: Survey, tester: Account): string {
  if (survey.startedAnswers === undefined) return '';
  const answers = Object.fromEntries(
    Object.entries(survey.startedAnswers).map(([key, value]) => [
      gid(surveyQuestionSlug(survey, key)),
      value,
    ]),
  );
  return `
insert into public.survey_responses (id, org_id, survey_id, player_id, answers_encrypted, status)
values (${surveyResponseId(survey, tester)}, ${ORG}, ${surveyId(survey)}, ${uid(tester.key)},
        public.encrypt_field(${lit(JSON.stringify(answers))}), 'in_progress')
on conflict do nothing;`;
}

// The module --------------------------------------------------------------------------------------

const inici: GroundModule = {
  name: 'inici',
  order: 20,

  publish() {
    return [
      '-- inici: avisos, forms waiting in Per fer, surveys',
      publishAvisos(),
      ...FORMS.map(publishForm),
      publishSurveys(),
    ].join('\n');
  },

  remove() {
    const avisIds = AVISOS.map(avisId);
    const formIds = FORMS.map(formId);
    const surveyIds = SURVEYS.map(surveyId);
    return `
-- inici: remove
delete from public.push_publications where content_type = 'announcement' and content_id in ${list(avisIds)};
delete from public.announcements where id in ${list(avisIds)};
delete from public.audit_log
 where action = 'survey_response_completed' and target_id in ${list(surveyIds)};
delete from public.surveys where id in ${list(surveyIds)};
delete from public.custom_notification_groups where id = ${groupId};
delete from public.custom_answers where question_id in ${list(allFieldIds())};
delete from public.custom_forms where id in ${list(formIds)};
delete from public.profile_fields where id in ${list(allFieldIds())};`;
  },

  renew(tester) {
    const formIds = FORMS.map(formId);
    const surveyIds = SURVEYS.map(surveyId);
    return `
-- inici: renew ${tester.key}
delete from public.custom_answers
 where profile_id = ${uid(tester.key)} and question_id in ${list(allFieldIds())};
delete from public.custom_form_responses
 where profile_id = ${uid(tester.key)} and form_id in ${list(formIds)};
${FORMS.map((form) => askForm(form, tester)).join('\n')}
delete from public.survey_responses
 where player_id = ${uid(tester.key)} and survey_id in ${list(surveyIds)};
delete from public.audit_log
 where action = 'survey_response_completed' and actor_id = ${uid(tester.key)}
   and target_id in ${list(surveyIds)};
${SURVEYS.map((survey) => startSurvey(survey, tester)).join('\n')}`;
  },
};

export default inici;
