-- App terms, editable and versioned (RAPP-613).
--
-- WHY
--
-- The terms a player accepts were one bundled string per language and a code
-- constant for the version (`CURRENT_TERMS_VERSION`). A new text needed an app
-- release, and the gate only checked `terms_accepted_at`, so a new version
-- asked nobody again. Ramassà staff now write the terms in the admin, in five
-- languages, and every player accepts each new version.
--
-- WHAT THIS MIGRATION DOES (modelled on `authorization_versions`, RAPP-304)
--
--   1. `app_terms_versions`: per organization, one draft and numbered
--      published versions. A version holds, per language, the terms screen
--      (title, body, accept label, the photo and video consent label and its
--      note) and the introduction screen before it (title, intro, points).
--      Catalan is required in every field (`private.app_terms_content_valid`).
--      A published version never changes and is never deleted (trigger).
--      Players read published versions only; nobody writes the table directly.
--   2. Version 1 is the text the app bundled, generated from the locale files
--      (scripts/generate-app-terms-v1.ts; a parity test keeps them equal). It
--      is made for every organization, now and when one is created.
--   3. `terms_acceptances.version_id`: the version she accepted. Every earlier
--      acceptance is an acceptance of version 1, so nobody is asked again at
--      deploy. A new acceptance records the version its screen showed
--      (`terms_version` holds its number); an old build's dated version is
--      version 1, the text it bundled.
--   4. Staff: `list_app_terms_versions`, `save_app_terms_draft` and
--      `discard_app_terms_draft` for onboarding designers
--      (`private.can_design_onboarding`); `publish_app_terms_draft` for
--      settings.organization only. Every write is audited.
--   5. Her app: `intake_catalog()` carries the current version (one catalog
--      call per onboarding, as for the rest of the wizard);
--      `my_terms_acceptance_needed()` is the gate for a player who joined;
--      `accept_current_app_terms` records her acceptance of the current
--      version, with her signature and photo choice, from the terms screen
--      alone.
--   6. The test player scenario accepts the current version.
--
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- (policies per operation, security definer functions with an empty search
-- path) and https://www.postgresql.org/docs/current/plpgsql-trigger.html
-- (BEFORE row triggers that raise to refuse a change).

-- 1. The versions --------------------------------------------------------------------------------------

create or replace function private.app_terms_content_valid(p_content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_content) = 'object'
    and p_content - array['title', 'body', 'intro_title', 'intro', 'points', 'accept_label',
                          'media_label', 'media_hint'] = '{}'::jsonb
    and (select bool_and(
           private.localized_text_valid(p_content -> field)
           and length(btrim(coalesce(p_content -> field ->> 'ca', ''))) > 0)
           from unnest(array['title', 'body', 'intro_title', 'intro', 'accept_label',
                             'media_label', 'media_hint']) field)
    and jsonb_typeof(p_content -> 'points') = 'array'
    and jsonb_array_length(p_content -> 'points') between 1 and 8
    and not exists (
      select 1 from jsonb_array_elements(p_content -> 'points') point
       where jsonb_typeof(point) <> 'object'
          or point - array['title', 'body'] <> '{}'::jsonb
          or not private.localized_text_valid(point -> 'title')
          or not private.localized_text_valid(point -> 'body')
          or length(btrim(coalesce(point -> 'title' ->> 'ca', ''))) = 0
          or length(btrim(coalesce(point -> 'body' ->> 'ca', ''))) = 0),
    false);
$$;

create table public.app_terms_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  version_number integer check (version_number >= 1),
  content jsonb not null check (private.app_terms_content_valid(content)),
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint app_terms_versions_published_numbered check ((published_at is null) = (version_number is null)),
  constraint app_terms_versions_number_unique unique (org_id, version_number)
);

create unique index app_terms_versions_one_draft on public.app_terms_versions (org_id)
  where published_at is null;

comment on table public.app_terms_versions is
  'The app terms each player accepts (RAPP-613): one draft and numbered published versions per organization, localized. Published versions never change.';

alter table public.app_terms_versions enable row level security;
-- Published versions only: staff read the draft through list_app_terms_versions.
create policy app_terms_versions_select_published on public.app_terms_versions
  for select to authenticated
  using (org_id = (select public.current_org_id()) and published_at is not null);
revoke all on table public.app_terms_versions from anon, authenticated;
grant select on table public.app_terms_versions to authenticated;

-- A published version never changes. Deleting one is refused too, except when
-- its organization goes (the cascade runs one trigger level deeper).
create or replace function private.app_terms_versions_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.published_at is not null and (tg_op = 'UPDATE' or pg_trigger_depth() = 1) then
    raise exception 'APP_TERMS/PUBLISHED_IMMUTABLE' using errcode = 'object_not_in_prerequisite_state';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger app_terms_versions_immutable
  before update or delete on public.app_terms_versions
  for each row execute function private.app_terms_versions_immutable();

-- 2. Version 1 ------------------------------------------------------------------------------------------

create or replace function private.app_terms_version_one()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select
    -- app-terms-v1:start
    $app_terms_v1${"title":{"ca":"Termes i condicions de l’app","es":"Términos y condiciones de la aplicación","en":"App terms and conditions","ar":"شروط وأحكام التطبيق","fa":"شرایط و مقررات برنامه"},"body":{"ca":"Ramassà guarda les teves dades per organitzar l'activitat esportiva i comunitària del programa: entrenaments, esdeveniments, equipament i comunicació amb tu. Les dades sensibles (document, telèfon, adreça) es guarden xifrades i només les veu l'equip de Ramassà. No compartim les teves dades amb ningú fora del programa ni les fem servir per publicitat. Pots demanar veure-les, corregir-les o esborrar-les quan vulguis parlant amb l'equip.","es":"Ramassà guarda tus datos para organizar la actividad deportiva y comunitaria del programa: entrenamientos, eventos, equipación y comunicación contigo. Los datos sensibles (documento, teléfono, dirección) se guardan cifrados y solo los ve el equipo de Ramassà. No compartimos tus datos con nadie fuera del programa ni los usamos para publicidad. Puedes pedir verlos, corregirlos o borrarlos cuando quieras hablando con el equipo.","en":"Ramassà keeps your data to run the program's sports and community activity: training, events, kit, and staying in touch with you. Sensitive data (document, phone, address) is stored encrypted and only the Ramassà team can see it. We never share your data with anyone outside the program or use it for advertising. You can ask to see, correct or delete it at any time by talking to the team.","ar":"تحتفظ راماسا ببياناتك لتنظيم النشاط الرياضي والمجتمعي للبرنامج: التدريبات والفعاليات والتجهيزات والتواصل معكِ. البيانات الحساسة (الوثيقة، الهاتف، العنوان) تُحفظ مشفّرة ولا يراها إلا فريق راماسا. لا نشارك بياناتك مع أي جهة خارج البرنامج ولا نستخدمها للإعلانات. يمكنكِ طلب الاطلاع عليها أو تصحيحها أو حذفها في أي وقت بالتحدث مع الفريق.","fa":"راماسا داده‌های شما را برای برگزاری فعالیت ورزشی و اجتماعی برنامه نگه می‌دارد: تمرین‌ها، رویدادها، تجهیزات و ارتباط با شما. داده‌های حساس (مدرک، تلفن، نشانی) رمزگذاری‌شده نگهداری می‌شوند و فقط تیم راماسا آن‌ها را می‌بیند. داده‌های شما را با هیچ‌کس بیرون از برنامه به اشتراک نمی‌گذاریم و برای تبلیغات استفاده نمی‌کنیم. هر وقت بخواهید می‌توانید با گفت‌وگو با تیم، دیدن، اصلاح یا حذف آن‌ها را درخواست کنید."},"intro_title":{"ca":"Abans d’acceptar els termes","es":"Antes de aceptar los términos","en":"Before you accept the terms","ar":"قبل قبول الشروط","fa":"پیش از پذیرش شرایط"},"intro":{"ca":"A la pantalla següent podràs llegir els termes i condicions de l’app.","es":"En la siguiente pantalla podrás leer los términos y condiciones de la aplicación.","en":"On the next screen, you can read the app’s terms and conditions.","ar":"في الشاشة التالية يمكنك قراءة شروط وأحكام التطبيق.","fa":"در صفحه بعد می‌توانید شرایط و مقررات برنامه را بخوانید."},"points":[{"title":{"ca":"Per què t'ho demanem","es":"Por qué te lo pedimos","en":"Why we ask","ar":"لماذا نطلب هذه البيانات","fa":"چرا این اطلاعات را می‌خواهیم"},"body":{"ca":"Per organitzar entrenaments, esdeveniments i equipament, i per contactar amb tu.","es":"Para organizar entrenamientos, eventos y equipación, y para contactar contigo.","en":"To organize training, events and kit, and to stay in touch with you.","ar":"لتنظيم التدريبات والفعاليات والتجهيزات والتواصل معكِ.","fa":"برای برنامه‌ریزی تمرین‌ها، رویدادها و تجهیزات و برای تماس با شما."}},{"title":{"ca":"Dades protegides","es":"Datos protegidos","en":"Protected","ar":"بيانات محمية","fa":"داده‌های محافظت‌شده"},"body":{"ca":"Les dades sensibles es xifren i només les pot veure l'equip de Ramassà.","es":"Los datos sensibles se cifran y solo puede verlos el equipo de Ramassà.","en":"Sensitive details are encrypted and only the Ramassà team can see them.","ar":"تُشفّر البيانات الحساسة ولا يراها إلا فريق راماسا.","fa":"اطلاعات حساس رمزگذاری می‌شود و فقط تیم راماسا آن را می‌بیند."}},{"title":{"ca":"Es mantenen privades","es":"Se mantienen privados","en":"Kept private","ar":"تبقى خاصة","fa":"خصوصی می‌ماند"},"body":{"ca":"No compartim les teves dades fora del programa ni les fem servir per publicitat.","es":"No compartimos tus datos fuera del programa ni los usamos para publicidad.","en":"We do not share your data outside the program or use it for advertising.","ar":"لا نشارك بياناتكِ خارج البرنامج ولا نستخدمها للإعلانات.","fa":"داده‌های شما را خارج از برنامه به اشتراک نمی‌گذاریم و برای تبلیغات استفاده نمی‌کنیم."}},{"title":{"ca":"Tu tens el control","es":"Tú tienes el control","en":"You stay in control","ar":"التحكم بيدكِ","fa":"کنترل با شماست"},"body":{"ca":"Pots demanar veure, corregir o esborrar les teves dades quan vulguis.","es":"Puedes pedir ver, corregir o borrar tus datos cuando quieras.","en":"You can ask to see, correct or delete your data at any time.","ar":"يمكنكِ طلب الاطلاع على بياناتكِ أو تصحيحها أو حذفها في أي وقت.","fa":"هر زمان بخواهید می‌توانید دیدن، اصلاح یا حذف داده‌هایتان را درخواست کنید."}}],"accept_label":{"ca":"He llegit i accepto els termes","es":"He leído y acepto los términos","en":"I have read and accept the terms","ar":"قرأتُ الشروط وأوافق عليها","fa":"شرایط را خوانده‌ام و می‌پذیرم"},"media_label":{"ca":"Accepto sortir a fotos i històries de la comunitat (opcional)","es":"Acepto salir en fotos e historias de la comunidad (opcional)","en":"I'm happy to appear in community photos and stories (optional)","ar":"أوافق على الظهور في صور وقصص المجتمع (اختياري)","fa":"موافقم در عکس‌ها و داستان‌های جامعه دیده شوم (اختیاری)"},"media_hint":{"ca":"Pots canviar el permís per utilitzar fotos i vídeos quan vulguis des del teu perfil.","es":"Puedes cambiar el permiso para utilizar fotos y vídeos cuando quieras desde tu perfil.","en":"You can change your photo and video permission at any time from your profile.","ar":"يمكنكِ تغيير الإذن باستخدام الصور والفيديوهات في أي وقت من ملفك الشخصي.","fa":"هر وقت بخواهید می‌توانید اجازه استفاده از عکس‌ها و ویدیوها را از نمایه‌تان تغییر دهید."}}$app_terms_v1$::jsonb
    -- app-terms-v1:end
  ;
$$;

create or replace function private.create_app_terms_version_one()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_terms_versions (org_id, version_number, content, published_at)
  values (new.id, 1, private.app_terms_version_one(), now())
  on conflict (org_id, version_number) do nothing;
  return new;
end;
$$;

create trigger organizations_create_app_terms_version_one
  after insert on public.organizations
  for each row execute function private.create_app_terms_version_one();

insert into public.app_terms_versions (org_id, version_number, content, published_at)
select o.id, 1, private.app_terms_version_one(), o.created_at
  from public.organizations o
on conflict (org_id, version_number) do nothing;

revoke all on function private.app_terms_version_one() from public, anon, authenticated;
revoke all on function private.create_app_terms_version_one() from public, anon, authenticated;
revoke all on function private.app_terms_versions_immutable() from public, anon, authenticated;

-- 3. Which version she accepted -------------------------------------------------------------------------

alter table public.terms_acceptances
  add column version_id uuid references public.app_terms_versions (id) on delete cascade;
comment on column public.terms_acceptances.version_id is
  'The app terms version she accepted (RAPP-613). terms_version holds its number; an old build''s dated version is version 1.';
create index terms_acceptances_version_idx on public.terms_acceptances (version_id);

update public.terms_acceptances t
   set version_id = v.id
  from public.profiles p
  join public.app_terms_versions v on v.org_id = p.org_id and v.version_number = 1
 where p.id = t.profile_id and t.version_id is null;

-- The version a new acceptance names: its number, or version 1 for the dated
-- constant old builds send (they showed the bundled text).
create or replace function private.terms_acceptance_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.version_id is null then
    select v.id into new.version_id
      from public.profiles p
      join public.app_terms_versions v on v.org_id = p.org_id and v.published_at is not null
     where p.id = new.profile_id
       and v.version_number = case when new.terms_version ~ '^[0-9]{1,6}$'
                                   then new.terms_version::integer else 1 end;
  end if;
  return new;
end;
$$;

revoke all on function private.terms_acceptance_version() from public, anon, authenticated;

create trigger terms_acceptances_version
  before insert on public.terms_acceptances
  for each row execute function private.terms_acceptance_version();

-- 4. Staff ----------------------------------------------------------------------------------------------

create or replace function private.current_app_terms_version(p_org_id uuid)
returns public.app_terms_versions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.app_terms_versions v
   where v.org_id = p_org_id and v.published_at is not null
   order by v.version_number desc
   limit 1;
$$;

revoke all on function private.current_app_terms_version(uuid) from public, anon, authenticated;

create or replace function public.list_app_terms_versions()
returns table (
  id uuid, version_number integer, content jsonb, published_at timestamptz,
  updated_at timestamptz, acceptance_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the app terms need settings.organization or onboarding.design';
  end if;
  return query
    select v.id, v.version_number, v.content, v.published_at, v.updated_at,
           (select count(*)::integer from public.terms_acceptances t
             join public.profiles p on p.id = t.profile_id
            where t.version_id = v.id and not p.is_test_account)
      from public.app_terms_versions v
     where v.org_id = (select public.current_org_id())
     order by v.version_number desc nulls first;
end;
$$;

create or replace function public.save_app_terms_draft(p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  saved uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the app terms need settings.organization or onboarding.design';
  end if;
  if not private.app_terms_content_valid(p_content) then
    raise check_violation using message = 'app terms need every field, in Catalan at least';
  end if;
  update public.app_terms_versions
     set content = p_content, updated_at = now(), updated_by = actor
   where org_id = actor_org and published_at is null
  returning id into saved;
  if saved is null then
    insert into public.app_terms_versions (org_id, content, updated_by)
    values (actor_org, p_content, actor)
    returning id into saved;
  end if;
  -- The field names only: the text is in the version itself.
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'app_terms.draft_saved', 'app_terms_version', saved,
          jsonb_build_object('languages', (
            select jsonb_agg(distinct language order by language)
              from jsonb_object_keys(p_content -> 'body') language)));
  return saved;
end;
$$;

create or replace function public.discard_app_terms_draft()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_org uuid := (select public.current_org_id());
  discarded uuid;
begin
  if not (select private.can_design_onboarding()) then
    raise insufficient_privilege using message = 'the app terms need settings.organization or onboarding.design';
  end if;
  delete from public.app_terms_versions
   where org_id = actor_org and published_at is null
  returning id into discarded;
  if discarded is not null then
    insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
    values (actor_org, (select auth.uid()), 'app_terms.draft_discarded', 'app_terms_version', discarded,
            '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.publish_app_terms_draft()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_org uuid := (select public.current_org_id());
  draft public.app_terms_versions;
  next_number integer;
begin
  -- Publishing asks every player again: an admin decision, not a design one.
  if not (select public.has_permission('settings.organization')) then
    raise insufficient_privilege using message = 'publishing the app terms needs settings.organization';
  end if;
  select * into draft from public.app_terms_versions
   where org_id = actor_org and published_at is null
   for update;
  if draft.id is null then
    raise object_not_in_prerequisite_state using message = 'there is no draft to publish';
  end if;
  -- One publish at a time per organization.
  perform 1 from public.organizations where id = actor_org for update;
  select coalesce(max(version_number), 0) + 1 into next_number
    from public.app_terms_versions where org_id = actor_org;
  update public.app_terms_versions
     set version_number = next_number, published_at = now(), published_by = actor
   where id = draft.id;
  insert into public.audit_log (org_id, actor_id, action, target_type, target_id, changes)
  values (actor_org, actor, 'app_terms.publish', 'app_terms_version', draft.id,
          jsonb_build_object('version_number', next_number));
  return next_number;
end;
$$;

revoke all on function public.list_app_terms_versions() from public, anon;
revoke all on function public.save_app_terms_draft(jsonb) from public, anon;
revoke all on function public.discard_app_terms_draft() from public, anon;
revoke all on function public.publish_app_terms_draft() from public, anon;
grant execute on function public.list_app_terms_versions() to authenticated;
grant execute on function public.save_app_terms_draft(jsonb) to authenticated;
grant execute on function public.discard_app_terms_draft() to authenticated;
grant execute on function public.publish_app_terms_draft() to authenticated;

-- 5. Her app --------------------------------------------------------------------------------------------

-- The gate: a player who joined and has not accepted the current version. An
-- invited woman meets the terms in her wizard.
create or replace function public.my_terms_acceptance_needed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select current_version.id is not null
       and not exists (
         select 1 from public.terms_acceptances t
          where t.profile_id = p.id and t.version_id = current_version.id)
      from public.profiles p
      left join lateral private.current_app_terms_version(p.org_id) current_version on true
     where p.id = (select auth.uid()) and p.role = 'player'), false);
$$;

create or replace function public.accept_current_app_terms(
  p_version_id uuid, p_locale_shown text, p_signing jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  her public.profiles;
  current_version public.app_terms_versions;
  drawing jsonb := nullif(p_signing -> 'signature', 'null'::jsonb);
  cannot_draw boolean;
  media boolean;
  acceptance uuid;
begin
  select * into her from public.profiles where id = caller for update;
  if her.id is null or her.role <> 'player' then
    raise insufficient_privilege using message = 'accepting the app terms again is for a player who joined';
  end if;
  current_version := private.current_app_terms_version(her.org_id);
  if current_version.id is null or p_version_id is distinct from current_version.id then
    raise object_not_in_prerequisite_state using message = 'accept the current version';
  end if;
  if p_locale_shown is null or p_locale_shown not in ('ca', 'es', 'en', 'ar', 'fa') then
    raise check_violation using message = 'the language shown is one of the five';
  end if;
  -- The same signing rules as joining (complete_onboarding_signed).
  if jsonb_typeof(p_signing) is distinct from 'object'
    or (p_signing -> 'terms_accepted') is distinct from 'true'::jsonb
    or jsonb_typeof(p_signing -> 'media_consent') is distinct from 'boolean'
    or jsonb_typeof(p_signing -> 'unable_to_draw') is distinct from 'boolean'
    or length(coalesce(p_signing ->> 'device', '')) > 200
  then
    raise check_violation using message = 'explicit terms acceptance and a media choice required';
  end if;
  cannot_draw := (p_signing ->> 'unable_to_draw')::boolean;
  media := (p_signing ->> 'media_consent')::boolean;
  if (cannot_draw and drawing is not null) or (not cannot_draw and not private.app_signature_valid(drawing)) then
    raise check_violation using message = 'draw a valid signature or use the cannot-draw alternative';
  end if;

  insert into public.terms_acceptances (profile_id, terms_version, locale_shown, version_id)
  values (caller, current_version.version_number::text, p_locale_shown, current_version.id)
  returning id into acceptance;
  insert into public.app_terms_signatures
    (acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device)
  values (acceptance, caller, her.org_id, drawing, cannot_draw, media, nullif(p_signing ->> 'device', ''));
  -- Her photo choice, as she made it on this screen.
  update public.profiles
     set media_consent_at = case when media then coalesce(media_consent_at, now()) else null end,
         updated_at = now()
   where id = caller;
end;
$$;

revoke all on function public.my_terms_acceptance_needed() from public, anon;
revoke all on function public.accept_current_app_terms(uuid, text, jsonb) from public, anon;
grant execute on function public.my_terms_acceptance_needed() to authenticated;
grant execute on function public.accept_current_app_terms(uuid, text, jsonb) to authenticated;


-- The onboarding catalog carries the current terms -------------------------------------------------

create or replace function public.intake_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- A woman who started on her own has no profile until she completes the
  -- wizard: she reads the default organization's questions.
  actor_org uuid := coalesce((select public.current_org_id()), (select public.default_organization_id()));
  with_archived boolean := (select private.can_design_onboarding());
begin
  if (select auth.uid()) is null or actor_org is null then
    raise insufficient_privilege using message = 'the question catalog needs an account';
  end if;
  return jsonb_build_object(
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'intro', s.intro, 'after_screen', s.after_screen,
        'sort_order', s.sort_order, 'is_archived', s.is_archived,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'question_type', q.question_type, 'label', q.label, 'help', q.help,
            'privacy', q.privacy, 'placements', to_jsonb(q.placements), 'sort_order', q.sort_order,
            'is_archived', q.is_archived,
            'show_when_question_id', q.show_when_question_id, 'show_when_option_id', q.show_when_option_id,
            'options', coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_archived', o.is_archived)
                order by o.sort_order, o.id)
                from public.custom_question_options o where o.question_id = q.id), '[]'::jsonb))
            order by q.sort_order, q.created_at)
            from public.custom_questions q
           where q.screen_id = s.id and (with_archived or not q.is_archived)), '[]'::jsonb))
        order by array_position(private.intake_builtin_screens(), s.after_screen), s.sort_order, s.created_at)
        from public.intake_screens s
       where s.org_id = actor_org and (with_archived or not s.is_archived)), '[]'::jsonb),
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', o.question, 'label', o.label, 'help', o.help, 'is_hidden', o.is_hidden,
        'option_overrides', o.option_overrides) order by o.question)
        from public.builtin_question_overrides o where o.org_id = actor_org), '[]'::jsonb),
    'presets', case when ((select public.has_permission('participants.view_personal')) or (select public.has_permission('onboarding.design'))) then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'states', p.states)
        order by p.name, p.id)
        from public.intake_state_presets p where p.org_id = actor_org), '[]'::jsonb)
      else '[]'::jsonb end,
    -- The app terms she accepts (RAPP-613): the current published version.
    'terms', (
      select jsonb_build_object('id', v.id, 'version_number', v.version_number, 'content', v.content)
        from private.current_app_terms_version(actor_org) v
       where v.id is not null)
  );
end;
$function$;

-- 6. The test player scenario accepts the current version --------------------------------------------

create or replace function private.scenario_terms(p_target profiles, p_change jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  accepted boolean := (p_change ->> 'accepted')::boolean;
  -- The current version (RAPP-613); a version sent by an older page is ignored.
  current_version public.app_terms_versions := private.current_app_terms_version(p_target.org_id);
  owner_email text;
  acceptance uuid;
begin
  if accepted is null then
    raise invalid_parameter_value using message = 'terms take accepted: true or false';
  end if;
  select lower(u.email) into owner_email from auth.users u where u.id = p_target.id;

  if accepted then
    if p_target.role = 'player' then
      return jsonb_build_object('accepted', true);
    end if;
    if current_version.id is null then
      raise object_not_in_prerequisite_state using message = 'the organization has no app terms';
    end if;
    -- She joins as every woman does: with every required question answered.
    if exists (
      select 1 from unnest(private.required_intake_questions()) required(question)
       where not exists (
         select 1 from public.profile_answers a
          where a.profile_id = p_target.id and a.question = required.question)
    ) then
      raise check_violation using message = 'fill her required answers before she accepts the terms';
    end if;
    -- Joining spends her invitation (the RAPP-300 trigger on the role change).
    update public.profiles
       set role = 'player', terms_accepted_at = now(), updated_at = now()
     where id = p_target.id;
    insert into public.terms_acceptances (profile_id, terms_version, locale_shown, is_test_fixture, version_id)
    values (p_target.id, current_version.version_number::text, p_target.preferred_language, true,
            current_version.id)
    returning id into acceptance;
    insert into public.app_terms_signatures
      (acceptance_id, profile_id, org_id, signature, unable_to_draw, media_consent, device)
    values (acceptance, p_target.id, p_target.org_id, null, true,
            p_target.media_consent_at is not null, 'test scenario');
  else
    delete from public.terms_acceptances where profile_id = p_target.id;
    update public.profiles
       set role = 'invited', terms_accepted_at = null, updated_at = now()
     where id = p_target.id;
    -- An open invitation, so she can sign in and the daily purge of women
    -- who never joined keeps her.
    update public.invites
       set accepted_at = null, accepted_by = null,
           expires_at = greatest(expires_at, now() + interval '30 days')
     where id = (
       select i.id from public.invites i
        where i.email = owner_email and i.org_id = p_target.org_id
        order by i.created_at desc limit 1);
    if not found then
      insert into public.invites (org_id, email, invited_by, expires_at)
      values (p_target.org_id, owner_email, (select auth.uid()), now() + interval '30 days');
    end if;
  end if;
  return jsonb_build_object('accepted', accepted);
end;
$function$;

-- The RGPD register ------------------------------------------------------------------------------------

create or replace function public.personal_data_disposition()
 RETURNS TABLE(table_name text, participant_column text, disposition text, reason text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select * from (values
    ('app_terms_signatures', 'profile_id', 'purge', 'The app terms signature and photo/video choice.'),
    ('profiles', 'id', 'purge', 'The participant profile and its encrypted fields.'),
    ('participant_notes', 'profile_id', 'purge', 'Staff prose about the participant.'),
    ('push_tokens', 'user_id', 'purge', 'Registered participant devices.'),
    ('push_deliveries', 'recipient_id', 'purge', 'Per-device notification delivery history.'),
    ('custom_notification_group_members', 'participant_id', 'purge', 'Curated notification membership.'),
    ('terms_acceptances', 'profile_id', 'purge', 'Participant consent records.'),
    ('deletion_requests', 'profile_id', 'purge', 'Participant erasure requests.'),
    ('invites', 'accepted_by', 'purge', 'The invitation that admitted the participant.'),
    ('entity_invitations', 'profile_id', 'purge', 'The invitation that admitted an entity collaborator.'),
    ('equipment_deliveries', 'profile_id', 'purge', 'Participant equipment history.'),
    ('event_signups', 'player_id', 'purge', 'Participant event activity.'),
    ('attendance', 'player_id', 'purge', 'Participant attendance history.'),
    ('service_interests', 'user_id', 'purge', 'Participant service interests.'),
    ('conversations', 'user_id', 'purge', 'Participant direct correspondence.'),
    ('messages', 'sender_id', 'purge', 'Participant-authored messages.'),
    ('conversation_read_states', 'user_id', 'purge', 'Participant message read history.'),
    ('conversation_assignment_history', 'user_id', 'purge', 'Participant conversation handling history.'),
    ('forum_posts', 'author_id', 'purge', 'Participant-authored forum posts.'),
    ('forum_replies', 'author_id', 'purge', 'Participant-authored forum replies.'),
    ('forum_flags', 'flagger_id', 'purge', 'Participant safety reports and optional comments.'),
    ('media_items', 'uploaded_by', 'purge', 'Participant gallery media and its consent record.'),
    ('entity_referrals', 'referred_profile_id', 'purge', 'Referral intake cascades with the linked participant.'),
    ('referral_updates', 'author_id', 'purge', 'Referral updates authored by the participant.'),
    ('mentoring_requests', 'player_id', 'purge', 'Private support requests belonging to the player.'),
    ('mentoring_notification_events', 'recipient_id', 'purge', 'Technical mentoring schedule notifications.'),
    ('feedback_submissions', 'author_id', 'purge', 'Encrypted feedback and its private attachment key.'),
    ('survey_responses', 'player_id', 'purge', 'Attributed encrypted survey responses.'),
    ('audit_log', 'actor_id', 'purge', 'Rows where the participant acted.'),
    ('audit_log', 'target_id', 'retain', 'Opaque lawful-access and erasure record.'),
    ('entity_referrals', null, 'retain_limited', 'Unlinked referral intake is purged after 24 months.'),
    ('entity_invitations', null, 'retain_limited', 'Expired entity invitations are purged after 24 months.'),
    ('notification_templates', null, 'not_personal', 'Organization-owned notification copy.'),
    ('custom_notification_groups', null, 'not_personal', 'Organization-owned audience definitions.'),
    ('targeted_notification_sends', null, 'not_personal', 'Aggregate organization send history.'),
    ('surveys', null, 'not_personal', 'Organization-owned survey definitions.'),
    ('survey_questions', null, 'not_personal', 'Organization-owned survey questions.'),
    ('staff_invitations', null, 'not_personal', 'Organization staff access administration history.'),
    ('internal_documents', null, 'not_personal', 'Organization-owned private operational documents.'),
    ('announcements', null, 'not_personal', 'Organization-owned operational content.'),
    ('event_categories', null, 'not_personal', 'Organization-owned event vocabulary.'),
    ('events', null, 'not_personal', 'Organization-owned schedules.'),
    ('event_occurrences', null, 'not_personal', 'Materialized organization schedules.'),
    ('knowledge_categories', null, 'not_personal', 'Organization-owned knowledge vocabulary.'),
    ('knowledge_articles', 'author_id', 'purge', 'Participant-authored knowledge stories.'),
    ('push_publications', 'recipient_id', 'purge', 'Recipient-specific push publications.'),
    ('service_categories', null, 'not_personal', 'Organization-owned service vocabulary.'),
    ('services', null, 'not_personal', 'Organization-owned directory content.'),
    ('service_images', null, 'not_personal', 'Organization-owned service media.'),
    ('service_submission_comments', null, 'not_personal', 'Organization review correspondence.'),
    ('service_submission_notifications', null, 'not_personal', 'Organization staff queue.'),
    ('forum_categories', null, 'not_personal', 'Organization-owned forum vocabulary.'),
    ('collaborating_entities', null, 'not_personal', 'A tenant-owned partner organization.'),
    ('organizations', null, 'not_personal', 'A tenant, not a person.'),
    ('municipality_catalog', null, 'not_personal', 'Official geography with no participant data.'),
    ('permissions', null, 'not_personal', 'The product permission catalog.'),
    ('permission_preset_defaults', null, 'not_personal', 'Product default permissions of the built-in presets.'),
    ('permission_presets', null, 'not_personal', 'Organization-owned access presets.'),
    ('permission_preset_permissions', null, 'not_personal', 'Organization-owned access presets.'),
    ('team_member_access', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('team_member_permissions', null, 'not_personal', 'Team access administration; players never hold permissions.'),
    ('equipment_item_types', null, 'not_personal', 'The organization''s material catalog.'),
    ('stock_movements', 'participant_id', 'purge', 'Stock movements keep their quantity so stock stays right; her link is cleared by ON DELETE SET NULL.'),
    ('stock_alerts', null, 'not_personal', 'Stock that went below zero, for the team to count.'),
    ('equipment_arrivals', null, 'not_personal', 'Goods received: source, problems and cost. No participant data.'),
    ('equipment_arrival_photos', null, 'not_personal', 'Photos of goods received and their receipts.'),
    ('stock_counts', null, 'not_personal', 'Stock counts: what was expected and what was on the shelf.'),
    ('staff_checkouts', null, 'not_personal', 'Material lent to a staff member for a trip or an event.'),
    ('photo_handoffs', null, 'not_personal', 'A staff member''s request to take a document photo with the phone.'),
    ('profile_answers', 'profile_id', 'purge', 'Which intake questions were answered, and by whom.'),
    ('intake_question_states', 'profile_id', 'purge', 'Which intake questions staff chose to ask or not ask her.'),
    ('seasons', null, 'not_personal', 'The organization''s seasons.'),
    ('authorization_versions', null, 'not_personal', 'The organization''s published authorization texts.'),
    ('app_terms_versions', null, 'not_personal', 'The organization''s app terms texts, draft and published.'),
    ('authorization_signatures', 'profile_id', 'purge', 'Her signed or paper authorizations, with her drawn signature.'),
    ('authorization_consent_events', 'profile_id', 'purge', 'Each consent she gave or withdrew.'),
    ('season_answers', 'profile_id', 'purge', 'Her registration answers, one row per season.'),
    ('walk_in_signings', null, 'retain_limited', 'A walk-in''s tablet signing until staff confirm it; purged after 60 days.'),
    ('intake_screens', null, 'not_personal', 'Registration screens staff built.'),
    ('custom_questions', null, 'not_personal', 'Questions staff added to registration.'),
    ('custom_question_options', null, 'not_personal', 'Options of those questions.'),
    ('builtin_question_overrides', null, 'not_personal', 'Staff wording for the built-in questions.'),
    ('intake_state_presets', null, 'not_personal', 'Organization presets for which questions are asked.'),
    ('custom_answers', 'profile_id', 'purge', 'Her answers to the questions staff added.'),
    ('referral_custom_answers', null, 'retain_limited', 'Extra answers sent with a referral; moved to her profile when she is invited, or purged with the referral.')
  ) as disposition(table_name, participant_column, disposition, reason);
$function$;

