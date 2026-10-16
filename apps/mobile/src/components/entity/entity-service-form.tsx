/**
 * A partner entity's service submission on the phone (RAPP-414), as the web
 * portal's service editor: one language (Catalan, the team translates on
 * review), the category and its own fields, the provider, place, cost,
 * contact, schedule, link and availability, and the publication and end dates
 * she asks for. A contact she used before fills the contact fields in one
 * tap. The shared check runs before the save; a published service changes at
 * once, every other one goes to the team for review.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { DateTimeField } from '@/components/content/date-time-field';
import { SERVICE_AVAILABILITY_KEYS, SERVICE_COST_KEYS } from '@/components/content/service-labels';
import { ServiceMetadataFields } from '@/components/content/service-metadata-fields';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useEntityServiceActions } from '@/lib/entity-services';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type KeyboardTypeOptions } from 'react-native';
import { getErrorMessageKey, toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import {
  normalizedServiceMetadata,
  SERVICE_AVAILABILITIES,
  SERVICE_COST_TYPES,
  serviceMetadataDefaults,
  type AdminServiceCategory,
} from '@ramassa/shared/services';
import {
  createEntityServiceInputSchema,
  type EntityServiceInput,
  type EntityServiceRow,
  type OwnServiceContact,
} from '@ramassa/shared/services/entity';

type TextKey =
  | 'providerName'
  | 'location'
  | 'zone'
  | 'costDetails'
  | 'contactName'
  | 'contactRole'
  | 'contactPhone'
  | 'contactEmail'
  | 'schedule'
  | 'externalUrl';

interface TextFieldSpec {
  readonly key: TextKey;
  readonly label: string;
  readonly keyboard?: KeyboardTypeOptions;
  readonly isLink?: boolean;
}

const PLACE_FIELDS: readonly TextFieldSpec[] = [
  { key: 'providerName', label: 'fieldProviderName' },
  { key: 'location', label: 'fieldLocation' },
  { key: 'zone', label: 'fieldZone' },
];
const CONTACT_FIELDS: readonly TextFieldSpec[] = [
  { key: 'contactRole', label: 'fieldContactRole' },
  { key: 'contactPhone', label: 'fieldContactPhone', keyboard: 'phone-pad' },
  { key: 'contactEmail', label: 'fieldContactEmail', keyboard: 'email-address', isLink: true },
  { key: 'schedule', label: 'fieldSchedule' },
  { key: 'externalUrl', label: 'fieldExternalUrl', keyboard: 'url', isLink: true },
];

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function searchable(value: string): string {
  return value.normalize('NFKD').replaceAll(/\p{M}/gu, '').toLocaleLowerCase();
}

function SectionLabel({ children }: { readonly children: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
      {children}
    </Text>
  );
}

export function EntityServiceForm({
  categories,
  contacts,
  service,
  onSaved,
}: {
  readonly categories: readonly AdminServiceCategory[];
  readonly contacts: readonly OwnServiceContact[];
  readonly service?: EntityServiceRow;
  readonly onSaved: (serviceId: string) => void;
}) {
  const { t, i18n } = useTranslation('entity-services');
  const { t: tServices } = useTranslation('services');
  const { t: tAnnouncements } = useTranslation('announcements');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const { save } = useEntityServiceActions();
  const firstCategory = categories[0];
  const [categoryId, setCategoryId] = useState(service?.category_id ?? firstCategory?.id ?? '');
  const category = categories.find((item) => item.id === categoryId) ?? firstCategory;
  const [title, setTitle] = useState(service?.title.ca ?? '');
  const [description, setDescription] = useState(service?.description?.ca ?? '');
  const [text, setText] = useState<Record<TextKey, string>>({
    providerName: service?.provider_name ?? '',
    location: service?.location ?? '',
    zone: service?.zone ?? '',
    costDetails: service?.cost_details ?? '',
    contactName: service?.contact_name ?? '',
    contactRole: service?.contact_role ?? '',
    contactPhone: service?.contact_phone ?? '',
    contactEmail: service?.contact_email ?? '',
    schedule: service?.schedule ?? '',
    externalUrl: service?.external_url ?? '',
  });
  const [costType, setCostType] = useState(service?.cost_type ?? 'free');
  const [costAmount, setCostAmount] = useState(
    service?.cost_amount === null || service?.cost_amount === undefined
      ? ''
      : String(service.cost_amount),
  );
  const [availability, setAvailability] = useState(service?.availability ?? 'available');
  const [metadata, setMetadata] = useState<Record<string, unknown>>(() =>
    category === undefined ? {} : serviceMetadataDefaults(category, service?.metadata),
  );
  const [publishedAt, setPublishedAt] = useState(service?.published_at ?? null);
  const [expiresAt, setExpiresAt] = useState(service?.expires_at ?? null);
  const [isPickingContact, setIsPickingContact] = useState(false);
  const [isInvalid, setIsInvalid] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  if (category === undefined) {
    return (
      <Text accessibilityRole="alert" className={`text-start text-md text-error ${fontClass}`}>
        {t('formInvalid')}
      </Text>
    );
  }
  const activeCategory = category;

  const clearMessages = () => {
    setIsInvalid(false);
    setErrorCode(null);
  };
  const setField = (key: TextKey, value: string) => {
    clearMessages();
    setText((current) => ({ ...current, [key]: value }));
  };
  const contactQuery = searchable(text.contactName.trim());
  const contactMatches =
    !isPickingContact || contactQuery.length === 0
      ? []
      : contacts.filter((contact) =>
          [contact.name, contact.email, contact.phone].some(
            (value) => value !== null && searchable(value).includes(contactQuery),
          ),
        );

  const chooseContact = (contact: OwnServiceContact) => {
    clearMessages();
    setText((current) => ({
      ...current,
      contactName: contact.name ?? '',
      contactPhone: contact.phone ?? '',
      contactEmail: contact.email ?? '',
      contactRole: contact.role ?? '',
      providerName: contact.providerName ?? current.providerName,
    }));
    setIsPickingContact(false);
  };

  const submit = () => {
    clearMessages();
    const amount = costAmount.trim().replace(',', '.');
    const input: EntityServiceInput = {
      categoryId,
      title,
      description: blankToNull(description),
      providerName: blankToNull(text.providerName),
      location: blankToNull(text.location),
      zone: blankToNull(text.zone),
      costType,
      costAmount: amount.length === 0 ? null : Number(amount),
      costDetails: blankToNull(text.costDetails),
      contactName: blankToNull(text.contactName),
      contactPhone: blankToNull(text.contactPhone),
      contactEmail: blankToNull(text.contactEmail),
      contactRole: blankToNull(text.contactRole),
      schedule: blankToNull(text.schedule),
      externalUrl: blankToNull(text.externalUrl),
      availability,
      metadata: normalizedServiceMetadata(activeCategory, metadata),
      publishedAt,
      expiresAt,
    };
    if (!createEntityServiceInputSchema(activeCategory).safeParse(input).success) {
      playHaptic('warning');
      setIsInvalid(true);
      return;
    }
    save.mutate(
      { category: activeCategory, service: input, serviceId: service?.id ?? null },
      {
        onSuccess: (serviceId) => {
          playHaptic('success');
          onSaved(serviceId);
        },
        onError: (error) => {
          playHaptic('error');
          setErrorCode(toAppError(error).code);
        },
      },
    );
  };

  const textField = (field: TextFieldSpec) => (
    <AuthTextField
      key={field.key}
      testID={`entity-service-${field.key}`}
      label={t(field.label)}
      value={text[field.key]}
      onChangeText={(value) => setField(field.key, value)}
      keyboardType={field.keyboard}
      autoCapitalize={field.isLink ? 'none' : undefined}
      autoCorrect={field.isLink ? false : undefined}
    />
  );

  return (
    <View className="gap-lg">
      {service?.status === 'published' ? (
        <Text
          style={continuousCorners}
          className={`rounded-md bg-primary-light p-md text-start text-md text-primary-dark ${fontClass}`}
        >
          {t('publishedEditNotice')}
        </Text>
      ) : null}

      <View className="gap-xs">
        <SectionLabel>{t('fieldCategory')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {categories.map((candidate) => (
            <ChoiceOption
              key={candidate.id}
              testID={`entity-service-category-${candidate.slug}`}
              value={candidate.id}
              label={candidate.name[language] ?? candidate.name.ca}
              selected={candidate.id === categoryId}
              onSelect={() => {
                if (candidate.id === categoryId) return;
                clearMessages();
                setCategoryId(candidate.id);
                setMetadata(serviceMetadataDefaults(candidate));
              }}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>

      <AuthTextField
        testID="entity-service-title"
        label={t('fieldTitle')}
        value={title}
        onChangeText={(value) => {
          clearMessages();
          setTitle(value);
        }}
        maxLength={200}
      />
      <AuthTextField
        testID="entity-service-description"
        label={t('fieldDescription')}
        value={description}
        onChangeText={(value) => {
          clearMessages();
          setDescription(value);
        }}
        maxLength={10_000}
        multiline
      />
      {PLACE_FIELDS.map(textField)}

      <View className="gap-xs">
        <SectionLabel>{t('fieldCostType')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {SERVICE_COST_TYPES.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`entity-service-cost-${candidate}`}
              value={candidate}
              label={tServices(SERVICE_COST_KEYS[candidate])}
              selected={candidate === costType}
              onSelect={(value) => {
                clearMessages();
                setCostType(value);
                if (value === 'free') setCostAmount('');
              }}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>
      {costType === 'free' ? null : (
        <AuthTextField
          testID="entity-service-costAmount"
          label={t('fieldCostAmount')}
          value={costAmount}
          onChangeText={(value) => {
            clearMessages();
            setCostAmount(value);
          }}
          keyboardType="decimal-pad"
        />
      )}
      {textField({ key: 'costDetails', label: 'fieldCostDetails' })}

      <View className="gap-xs">
        <AuthTextField
          testID="entity-service-contactName"
          label={t('fieldContactName')}
          value={text.contactName}
          onChangeText={(value) => {
            setField('contactName', value);
            setIsPickingContact(true);
          }}
          autoCorrect={false}
        />
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('contactReuseHelp')}
        </Text>
        {!isPickingContact || contactQuery.length === 0 ? null : contactMatches.length === 0 ? (
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('contactNoMatches')}
          </Text>
        ) : (
          <View testID="entity-service-contact-results" className="gap-xs">
            {contactMatches.map((contact, index) => {
              const name = contact.name ?? contact.email ?? contact.phone ?? '';
              return (
                <PressableScale
                  key={`${contact.email ?? contact.phone ?? contact.name}-${index}`}
                  testID={`entity-service-contact-option-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  onPress={() => chooseContact(contact)}
                  haptic="selection"
                  style={continuousCorners}
                  className="min-h-recommended justify-center rounded-md border border-neutral-200 bg-white px-md"
                >
                  <Text className="text-start text-md text-neutral-900">{name}</Text>
                </PressableScale>
              );
            })}
          </View>
        )}
      </View>
      {CONTACT_FIELDS.map(textField)}

      <View className="gap-xs">
        <SectionLabel>{t('fieldAvailability')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {SERVICE_AVAILABILITIES.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`entity-service-availability-${candidate}`}
              value={candidate}
              label={tServices(SERVICE_AVAILABILITY_KEYS[candidate])}
              selected={candidate === availability}
              onSelect={(value) => {
                clearMessages();
                setAvailability(value);
              }}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>

      <ServiceMetadataFields
        // Another category has other fields, so its controls start again.
        key={activeCategory.id}
        fields={activeCategory.definition.fields}
        values={metadata}
        language={language}
        onChange={(key, value) => {
          clearMessages();
          setMetadata((current) => ({ ...current, [key]: value }));
        }}
      />

      <View className="gap-xs">
        <DateTimeField
          testID="entity-service-published-at"
          label={t('requestedPublishAt')}
          value={publishedAt}
          onChange={setPublishedAt}
          emptyLabel={tAnnouncements('modeNow')}
        />
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('requestedPublishHelp')}
        </Text>
      </View>
      <DateTimeField
        testID="entity-service-expires-at"
        label={t('expiresAt')}
        value={expiresAt}
        onChange={setExpiresAt}
        emptyLabel={tAnnouncements('noExpiry')}
      />

      {isInvalid ? (
        <Text
          testID="entity-service-form-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className={`text-start text-md text-error ${fontClass}`}
        >
          {t('formInvalid')}
        </Text>
      ) : null}
      {errorCode === null ? null : (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className={`text-start text-md text-error ${fontClass}`}
        >
          {tErrors(getErrorMessageKey(errorCode))}
        </Text>
      )}
      <PressableScale
        testID="entity-service-save"
        accessibilityRole="button"
        accessibilityLabel={service?.status === 'published' ? t('save') : t('submit')}
        onPress={submit}
        isBusy={save.isPending}
        isDisabled={save.isPending}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
      >
        <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
          {save.isPending ? t('saving') : service?.status === 'published' ? t('save') : t('submit')}
        </Text>
      </PressableScale>
    </View>
  );
}
