import {
  AuthenticatedMediaImage,
  loadAuthenticatedMediaObjectUrl,
} from '@/components/content/authenticated-media-image';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppError } from '@ramassa/shared/errors';
import {
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n/languages';
import {
  organizationSettingsSchema,
  type InternalDocument,
  type OrganizationRow,
  type OrganizationSettingsInput,
} from '@ramassa/shared/organization-settings';
import type { PermissionCode } from '@ramassa/shared/permissions';
import { uploadContentTypeSchema, type UploadContentType } from '@ramassa/shared/schemas';
import { uploadFile } from '@ramassa/shared/upload-client';

interface OrganizationSettingsPanelProps {
  readonly organization: OrganizationRow;
  /** Which tabs and fields the caller may use (RAPP-231); the database enforces them again. */
  readonly permissions: ReadonlySet<PermissionCode>;
  /** The Team tab (RAPP-231): people, presets and toggles. */
  readonly team: ReactNode;
  /** "Take photo with phone" for a document (RAPP-254). */
  readonly photoHandoff: ReactNode;
  /** The note under the wizard's document step (RAPP-302), for settings.organization. */
  readonly documentExplanation?: ReactNode;
  /** The participation authorization versions and editor (RAPP-304). */
  readonly authorization?: ReactNode;
  /** The question builder (RAPP-307). */
  readonly questions?: ReactNode;
  /** The Fitxa de la jugadora (RAPP-650): every team member who opens Settings reads it. */
  readonly profileLayout?: ReactNode;
  /** The entity referral form (RAPP-652), here until the menu groups the entity pages (RAPP-654). */
  readonly referralForm?: ReactNode;
  readonly documents: readonly InternalDocument[];
  readonly documentQuery: string;
  readonly entityManagement: ReactNode;
  readonly accessToken: string | undefined;
  readonly initialTab?: SettingsTab;
  readonly onTabChange?: (tab: SettingsTab) => void;
  readonly onSaveOrganization: (
    input: OrganizationSettingsInput & { readonly logoUrl: string | null },
  ) => Promise<void>;
  readonly onRegisterDocument: (input: {
    readonly objectKey: string;
    readonly name: string;
    readonly contentType: string;
    readonly fileSize: number;
  }) => Promise<void>;
  readonly onSearchDocuments: (query: string) => Promise<void>;
}

type PendingAction = 'organization' | 'document' | 'download';

export type SettingsTab =
  | 'organization'
  | 'authorization'
  | 'profile-layout'
  | 'referral-form'
  | 'questions'
  | 'staff'
  | 'documents'
  | 'entities';

/** The tabs a person may open, in display order (RAPP-231). */
function visibleSettingsTabs(permissions: ReadonlySet<PermissionCode>): readonly SettingsTab[] {
  const tabs: SettingsTab[] = [];
  if (permissions.has('settings.organization') || permissions.has('settings.branding')) {
    tabs.push('organization');
  }
  // The season's participation authorization (RAPP-304).
  if (permissions.has('settings.organization')) tabs.push('authorization');
  // The player profile layout (RAPP-650): read by all, edited by its designers.
  tabs.push('profile-layout');
  // The entity referral form (RAPP-652), until RAPP-654 gives it its menu item.
  if (permissions.has('settings.organization')) tabs.push('referral-form');
  // The registration questions staff add and reword (RAPP-307).
  if (permissions.has('settings.organization')) tabs.push('questions');
  if (permissions.has('team.manage')) tabs.push('staff');
  if (permissions.has('settings.documents')) tabs.push('documents');
  if (permissions.has('entities.manage')) tabs.push('entities');
  return tabs;
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({ title, intro }: { readonly title: string; readonly intro: string }) {
  return (
    <header className="space-y-2">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm leading-6 text-muted-foreground">{intro}</p>
    </header>
  );
}

function fileContentType(file: File): UploadContentType {
  return uploadContentTypeSchema.parse(file.type);
}

export function OrganizationSettingsPanel({
  organization,
  permissions,
  team,
  photoHandoff,
  documentExplanation,
  authorization,
  questions,
  profileLayout,
  referralForm,
  documents,
  documentQuery,
  entityManagement,
  accessToken,
  initialTab = 'organization',
  onTabChange,
  onSaveOrganization,
  onRegisterDocument,
  onSearchDocuments,
}: OrganizationSettingsPanelProps) {
  const { t } = useTranslation('settings');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [query, setQuery] = useState(documentQuery);
  const [name, setName] = useState(organization.name);
  const [contactEmail, setContactEmail] = useState(organization.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(organization.contact_phone ?? '');
  const [primaryColor, setPrimaryColor] = useState(organization.primary_color);
  const [secondaryColor, setSecondaryColor] = useState(organization.secondary_color);
  const [availableLanguages, setAvailableLanguages] = useState<SupportedLanguage[]>(
    organization.available_languages,
  );
  const [defaultLanguage, setDefaultLanguage] = useState<SupportedLanguage>(
    organization.default_language,
  );

  const tabs = visibleSettingsTabs(permissions);
  const openTab = tabs.includes(initialTab) ? initialTab : (tabs[0] ?? 'organization');
  const canEditOrganization = permissions.has('settings.organization');
  const canEditBranding = permissions.has('settings.branding');

  useEffect(() => setQuery(documentQuery), [documentQuery]);
  useEffect(() => {
    setName(organization.name);
    setContactEmail(organization.contact_email ?? '');
    setContactPhone(organization.contact_phone ?? '');
    setPrimaryColor(organization.primary_color);
    setSecondaryColor(organization.secondary_color);
    setAvailableLanguages(organization.available_languages);
    setDefaultLanguage(organization.default_language);
  }, [organization]);

  async function run(action: PendingAction, operation: () => Promise<void>, success?: string) {
    setPending(action);
    setMessage(null);
    try {
      await operation();
      setMessage(success ? { kind: 'success', text: success } : null);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof Error && error.message.length > 0 ? error.message : t('actionError'),
      });
    } finally {
      setPending(null);
    }
  }

  function toggleLanguage(language: SupportedLanguage) {
    const isLocked = organization.locked_default_language === language;
    if (isLocked) return;
    setAvailableLanguages((current) => {
      if (current.includes(language)) {
        const next = current.filter((entry) => entry !== language);
        if (defaultLanguage === language && next[0] !== undefined) setDefaultLanguage(next[0]);
        return next;
      }
      return [...current, language];
    });
  }

  function submitOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = organizationSettingsSchema.safeParse({
      name,
      contactEmail,
      contactPhone,
      primaryColor,
      secondaryColor,
      availableLanguages,
      defaultLanguage,
    });
    if (!parsed.success) {
      setMessage({
        kind: 'error',
        text: parsed.error.issues.map((issue) => issue.message).join(' '),
      });
      return;
    }
    void run(
      'organization',
      async () => {
        let logoUrl = organization.logo_url;
        if (logoFile !== null) {
          if (accessToken === undefined || mediaWorkerUrl.length === 0)
            throw new AppError('AUTH-2');
          const contentType = fileContentType(logoFile);
          if (!contentType.startsWith('image/')) throw new AppError('UPLOAD-2');
          const uploaded = await uploadFile({
            mediaWorkerUrl,
            accessToken,
            folder: 'organization-branding',
            file: { data: logoFile, contentType, byteLength: logoFile.size },
          });
          if (!uploaded.ok) throw uploaded.error;
          logoUrl = uploaded.value.objectKey;
        }
        await onSaveOrganization({ ...parsed.data, logoUrl });
        setLogoFile(null);
      },
      t('saved'),
    );
  }

  function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get('document');
    if (!(file instanceof File) || file.size === 0) return;
    void run(
      'document',
      async () => {
        if (accessToken === undefined || mediaWorkerUrl.length === 0) throw new AppError('AUTH-2');
        const contentType = fileContentType(file);
        const uploaded = await uploadFile({
          mediaWorkerUrl,
          accessToken,
          folder: 'documents',
          file: { data: file, contentType, byteLength: file.size },
        });
        if (!uploaded.ok) throw uploaded.error;
        await onRegisterDocument({
          objectKey: uploaded.value.objectKey,
          name: file.name,
          contentType,
          fileSize: file.size,
        });
        form.reset();
      },
      t('documentUploaded'),
    );
  }

  function downloadDocument(document: InternalDocument) {
    void run('download', async () => {
      if (accessToken === undefined || mediaWorkerUrl.length === 0) throw new AppError('AUTH-2');
      const objectUrl = await loadAuthenticatedMediaObjectUrl({
        objectKey: document.object_key,
        mediaWorkerUrl,
        accessToken,
      });
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = document.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    });
  }

  return (
    <Page data-testid="organization-settings">
      <PageHeader title={t('title')} description={t('intro')} />

      <div className="pointer-events-none fixed inset-x-4 top-4 z-50 sm:start-auto sm:end-6 sm:w-96">
        {(['success', 'error'] as const).map((kind) => (
          <div key={kind} role={kind === 'success' ? 'status' : 'alert'} aria-atomic="true">
            {message?.kind === kind ? (
              <div className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg">
                {kind === 'success' ? (
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <CircleAlert
                    className="mt-0.5 size-5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                )}
                <p className="min-w-0 flex-1 break-words text-sm font-medium">{message.text}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-my-1 shrink-0"
                  aria-label={t('common:close')}
                  onClick={() => setMessage(null)}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <Tabs
        defaultValue={openTab}
        className="gap-6"
        onValueChange={(value) => onTabChange?.(value as SettingsTab)}
      >
        <TabsList className="max-w-full overflow-x-auto" variant="line">
          {tabs.includes('organization') ? (
            <TabsTrigger value="organization">{t('tabOrganization')}</TabsTrigger>
          ) : null}
          {tabs.includes('authorization') ? (
            <TabsTrigger value="authorization">{t('tabAuthorization')}</TabsTrigger>
          ) : null}
          {tabs.includes('profile-layout') ? (
            <TabsTrigger value="profile-layout">{t('tabProfileLayout')}</TabsTrigger>
          ) : null}
          {tabs.includes('referral-form') ? (
            <TabsTrigger value="referral-form">{t('tabReferralForm')}</TabsTrigger>
          ) : null}
          {tabs.includes('questions') ? (
            <TabsTrigger value="questions">{t('tabQuestions')}</TabsTrigger>
          ) : null}
          {tabs.includes('staff') ? <TabsTrigger value="staff">{t('tabTeam')}</TabsTrigger> : null}
          {tabs.includes('documents') ? (
            <TabsTrigger value="documents">{t('tabDocuments')}</TabsTrigger>
          ) : null}
          {tabs.includes('entities') ? (
            <TabsTrigger value="entities">{t('tabEntities')}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="organization" className="space-y-6">
          <SectionHeader title={t('tabOrganization')} intro={t('intro')} />
          <form
            className="grid gap-5 rounded-xl border bg-card p-5"
            onSubmit={submitOrganization}
            onChange={() => setMessage(null)}
            data-testid="organization-settings-form"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('organizationName')}>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  disabled={!canEditOrganization}
                />
              </Field>
              <Field label={t('contactEmail')}>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  disabled={!canEditOrganization}
                />
              </Field>
              <Field label={t('contactPhone')}>
                <Input
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  disabled={!canEditOrganization}
                />
              </Field>
              <Field label={t('logo')}>
                <Input
                  name="logo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                  disabled={!canEditBranding}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{t('logoHelp')}</p>
            {organization.logo_url !== null && accessToken !== undefined ? (
              <AuthenticatedMediaImage
                objectKeyOrUrl={organization.logo_url}
                mediaWorkerUrl={mediaWorkerUrl}
                accessToken={accessToken}
                alt={organization.name}
                className="max-h-20 max-w-48 object-contain"
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('primaryColor')}>
                <div className="flex gap-2">
                  <Input
                    aria-label={`${t('primaryColor')} picker`}
                    type="color"
                    className="w-14 p-1"
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())}
                    disabled={!canEditBranding}
                  />
                  <Input
                    aria-label={`${t('primaryColor')} hex`}
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    disabled={!canEditBranding}
                  />
                </div>
              </Field>
              <Field label={t('secondaryColor')}>
                <div className="flex gap-2">
                  <Input
                    aria-label={`${t('secondaryColor')} picker`}
                    type="color"
                    className="w-14 p-1"
                    value={secondaryColor}
                    onChange={(event) => setSecondaryColor(event.target.value.toUpperCase())}
                    disabled={!canEditBranding}
                  />
                  <Input
                    aria-label={`${t('secondaryColor')} hex`}
                    value={secondaryColor}
                    onChange={(event) => setSecondaryColor(event.target.value)}
                    disabled={!canEditBranding}
                  />
                </div>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{t('contrastHelp')}</p>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{t('languages')}</legend>
              <div className="flex flex-wrap gap-4">
                {SUPPORTED_LANGUAGES.map((language) => (
                  <label key={language} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={availableLanguages.includes(language)}
                      disabled={
                        !canEditOrganization || organization.locked_default_language === language
                      }
                      onChange={() => toggleLanguage(language)}
                    />
                    <span lang={language}>{LANGUAGE_NATIVE_NAMES[language]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={t('defaultLanguage')}>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={defaultLanguage}
                disabled={!canEditOrganization || organization.locked_default_language !== null}
                onChange={(event) => setDefaultLanguage(event.target.value as SupportedLanguage)}
              >
                {availableLanguages.map((language) => (
                  <option key={language} value={language}>
                    {LANGUAGE_NATIVE_NAMES[language]}
                  </option>
                ))}
              </select>
            </Field>
            {organization.locked_default_language !== null ? (
              <p className="rounded-lg bg-muted p-3 text-sm">{t('languageLocked')}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t('fundingNotice')}</p>
            <Button type="submit" className="w-fit" disabled={pending !== null}>
              {pending === 'organization' ? t('working') : t('save')}
            </Button>
          </form>
          {documentExplanation}
        </TabsContent>

        <TabsContent value="staff" className="space-y-6">
          {team}
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <SectionHeader title={t('documentsTitle')} intro={t('documentsIntro')} />
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void onSearchDocuments(query);
            }}
          >
            <Input
              aria-label={t('documentSearch')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit" variant="outline">
              {t('documentSearch')}
            </Button>
          </form>
          <form
            className="grid gap-3 rounded-xl border bg-card p-4"
            onSubmit={submitDocument}
            data-testid="document-upload-form"
          >
            <Field label={t('documentUpload')}>
              <Input
                name="document"
                type="file"
                required
                accept="application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              />
            </Field>
            <p className="text-xs text-muted-foreground">{t('documentHelp')}</p>
            <Button type="submit" className="w-fit" disabled={pending !== null}>
              {pending === 'document' ? t('working') : t('documentUpload')}
            </Button>
          </form>
          {photoHandoff}
          {documents.length === 0 ? (
            <p className="rounded-xl border p-6 text-sm text-muted-foreground">
              {t('documentsEmpty')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('documentUpload')}</TableHead>
                    <TableHead>{t('email')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell>
                        <span className="font-medium">{document.name}</span>
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {document.content_type} · {Math.ceil(document.file_size / 1024)} KB
                        </span>
                      </TableCell>
                      <TableCell>{document.uploader_name}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => downloadDocument(document)}
                          disabled={pending !== null}
                        >
                          {t('download')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="authorization" className="space-y-6">
          <SectionHeader title={t('tabAuthorization')} intro={t('authorizationIntro')} />
          {authorization}
        </TabsContent>
        <TabsContent value="profile-layout" className="space-y-6">
          {profileLayout}
        </TabsContent>
        <TabsContent value="referral-form" className="space-y-6">
          {referralForm}
        </TabsContent>
        <TabsContent value="questions" className="space-y-6">
          <SectionHeader title={t('tabQuestions')} intro={t('questionsIntro')} />
          {questions}
        </TabsContent>
        <TabsContent value="entities">{entityManagement}</TabsContent>
      </Tabs>
    </Page>
  );
}
