import {
  AuthenticatedMediaImage,
  loadAuthenticatedMediaObjectUrl,
} from '@/components/content/authenticated-media-image';
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
  type StaffMember,
} from '@ramassa/shared/organization-settings';
import { uploadContentTypeSchema, type UploadContentType } from '@ramassa/shared/schemas';
import { uploadFile } from '@ramassa/shared/upload-client';

interface OrganizationSettingsPanelProps {
  readonly organization: OrganizationRow;
  readonly staffMembers: readonly StaffMember[];
  readonly documents: readonly InternalDocument[];
  readonly documentQuery: string;
  readonly entityManagement: ReactNode;
  readonly accessToken: string | undefined;
  readonly initialTab?: 'organization' | 'staff' | 'documents' | 'entities';
  readonly onTabChange?: (tab: 'organization' | 'staff' | 'documents' | 'entities') => void;
  readonly onSaveOrganization: (
    input: OrganizationSettingsInput & { readonly logoUrl: string | null },
  ) => Promise<void>;
  readonly onInviteStaff: (input: {
    readonly email: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly role: 'staff' | 'admin';
  }) => Promise<void>;
  readonly onSetStaffRole: (profileId: string, role: 'staff' | 'admin') => Promise<void>;
  readonly onRemoveStaff: (profileId: string) => Promise<void>;
  readonly onRegisterDocument: (input: {
    readonly objectKey: string;
    readonly name: string;
    readonly contentType: string;
    readonly fileSize: number;
  }) => Promise<void>;
  readonly onSearchDocuments: (query: string) => Promise<void>;
}

type PendingAction = 'organization' | 'invite' | 'role' | 'remove' | 'document' | 'download';

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
    <header className="max-w-3xl space-y-2">
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
  staffMembers,
  documents,
  documentQuery,
  entityManagement,
  accessToken,
  initialTab = 'organization',
  onTabChange,
  onSaveOrganization,
  onInviteStaff,
  onSetStaffRole,
  onRemoveStaff,
  onRegisterDocument,
  onSearchDocuments,
}: OrganizationSettingsPanelProps) {
  const { t } = useTranslation('settings');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [query, setQuery] = useState(documentQuery);
  const [removeProfileId, setRemoveProfileId] = useState<string | null>(null);
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
      setMessage(success ?? null);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.length > 0 ? error.message : t('actionError'),
      );
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
      setMessage(parsed.error.issues.map((issue) => issue.message).join(' '));
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

  function submitStaffInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    void run(
      'invite',
      async () => {
        await onInviteStaff({
          firstName: String(fields.get('first-name') ?? ''),
          lastName: String(fields.get('last-name') ?? ''),
          email: String(fields.get('email') ?? ''),
          role: fields.get('role') === 'admin' ? 'admin' : 'staff',
        });
        form.reset();
      },
      t('inviteSent'),
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
    <section className="space-y-6 p-4 sm:p-6" data-testid="organization-settings">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{t('intro')}</p>
      </header>

      {message ? (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      ) : null}

      <Tabs
        defaultValue={initialTab}
        className="gap-6"
        onValueChange={(value) =>
          onTabChange?.(value as 'organization' | 'staff' | 'documents' | 'entities')
        }
      >
        <TabsList className="max-w-full overflow-x-auto" variant="line">
          <TabsTrigger value="organization">{t('tabOrganization')}</TabsTrigger>
          <TabsTrigger value="staff">{t('tabStaff')}</TabsTrigger>
          <TabsTrigger value="documents">{t('tabDocuments')}</TabsTrigger>
          <TabsTrigger value="entities">{t('tabEntities')}</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="space-y-6">
          <SectionHeader title={t('tabOrganization')} intro={t('intro')} />
          <form
            className="grid max-w-3xl gap-5 rounded-xl border bg-card p-5"
            onSubmit={submitOrganization}
            data-testid="organization-settings-form"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('organizationName')}>
                <Input value={name} onChange={(event) => setName(event.target.value)} required />
              </Field>
              <Field label={t('contactEmail')}>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                />
              </Field>
              <Field label={t('contactPhone')}>
                <Input
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                />
              </Field>
              <Field label={t('logo')}>
                <Input
                  name="logo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
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
                  />
                  <Input
                    aria-label={`${t('primaryColor')} hex`}
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
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
                  />
                  <Input
                    aria-label={`${t('secondaryColor')} hex`}
                    value={secondaryColor}
                    onChange={(event) => setSecondaryColor(event.target.value)}
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
                      disabled={organization.locked_default_language === language}
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
                disabled={organization.locked_default_language !== null}
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
        </TabsContent>

        <TabsContent value="staff" className="space-y-6">
          <SectionHeader title={t('staffTitle')} intro={t('staffIntro')} />
          <form
            className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={submitStaffInvitation}
            data-testid="staff-invite-form"
          >
            <Field label={t('firstName')}>
              <Input name="first-name" required />
            </Field>
            <Field label={t('lastName')}>
              <Input name="last-name" required />
            </Field>
            <Field label={t('email')}>
              <Input name="email" type="email" required />
            </Field>
            <Field label={t('role')}>
              <select
                name="role"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="staff">{t('roleStaff')}</option>
                <option value="admin">{t('roleAdmin')}</option>
              </select>
            </Field>
            <Button type="submit" className="self-end" disabled={pending !== null}>
              {pending === 'invite' ? t('working') : t('invite')}
            </Button>
          </form>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('email')}</TableHead>
                  <TableHead>{t('role')}</TableHead>
                  <TableHead>{t('statusActive')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffMembers.map((member) => (
                  <TableRow key={member.profile_id}>
                    <TableCell>
                      <span className="font-medium">
                        {member.first_name} {member.last_name}
                      </span>
                      <br />
                      <span className="text-xs text-muted-foreground">{member.email}</span>
                    </TableCell>
                    <TableCell>
                      <select
                        aria-label={`${t('role')} ${member.email}`}
                        className="h-8 rounded-md border bg-background px-2"
                        value={member.role}
                        disabled={!member.is_active || pending !== null}
                        onChange={(event) =>
                          void run('role', () =>
                            onSetStaffRole(
                              member.profile_id,
                              event.target.value as 'staff' | 'admin',
                            ),
                          )
                        }
                      >
                        <option value="staff">{t('roleStaff')}</option>
                        <option value="admin">{t('roleAdmin')}</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      {member.is_active ? t('statusActive') : t('statusInactive')}
                    </TableCell>
                    <TableCell>
                      {member.is_active ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => setRemoveProfileId(member.profile_id)}
                        >
                          {t('remove')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {removeProfileId !== null ? (
            <div
              role="alertdialog"
              aria-modal="true"
              className="max-w-xl space-y-3 rounded-xl border border-destructive/30 bg-card p-4"
            >
              <p>{t('removeConfirm')}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    void run('remove', async () => {
                      await onRemoveStaff(removeProfileId);
                      setRemoveProfileId(null);
                    })
                  }
                >
                  {t('confirm')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setRemoveProfileId(null)}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <SectionHeader title={t('documentsTitle')} intro={t('documentsIntro')} />
          <form
            className="flex max-w-2xl gap-2"
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
            className="grid max-w-2xl gap-3 rounded-xl border bg-card p-4"
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

        <TabsContent value="entities">{entityManagement}</TabsContent>
      </Tabs>
    </section>
  );
}
