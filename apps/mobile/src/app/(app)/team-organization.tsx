/**
 * The organization's settings on the phone (RAPP-403), as the web admin's
 * Organization tab. `settings.organization` holders change the name, the
 * contact email and phone, and the languages; `settings.branding` holders
 * change the logo and the two brand colours. A field the reader may not
 * change is shown but locked. Each colour shows its contrast with its text as
 * it is typed, and a colour under 4.5:1 cannot be saved, as the database also
 * refuses. A locked language (Catalan, when the grant requires it) stays on and
 * the default.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { useRefreshOrganizationBranding } from '@/components/branding/organization-branding-provider';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { teamScreens } from '@/lib/account-area';
import type { PickedPhoto } from '@/lib/content-upload';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { uploadOrganizationLogo } from '@/lib/logo-upload';
import { resolveMediaImageSource } from '@/lib/media-source';
import { toggleOrganizationLanguage } from '@/lib/organization-languages';
import { mobileClientEnv, supabase } from '@/lib/supabase';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import {
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import {
  fetchOrganizationSettings,
  organizationSettingsSchema,
  saveOrganizationSettings,
  validateBrandContrast,
} from '@ramassa/shared/organization-settings';

const HEX = /^#[0-9A-F]{6}$/i;
const logoStyle = { width: 160, height: 64 } as const;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const fontClass = useLanguageFontClass();
  return (
    <View
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function ColorField({
  testID,
  label,
  value,
  ratio,
  onChange,
  isLocked,
}: {
  readonly testID: string;
  readonly label: string;
  readonly value: string;
  /** The contrast with its text, or null while the colour is not a full hex value. */
  readonly ratio: number | null;
  readonly onChange: (value: string) => void;
  readonly isLocked: boolean;
}) {
  const { t, i18n } = useTranslation('settings');
  const fontClass = useLanguageFontClass();
  const isValid = HEX.test(value.trim());
  // In the reader's own number format, as the sentence writes 4,5 or 4.5.
  const ratioText =
    ratio === null
      ? ''
      : new Intl.NumberFormat(i18n.resolvedLanguage ?? 'ca', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(ratio);
  return (
    <View className="gap-xs">
      <View className="flex-row items-end gap-sm">
        <View
          accessible={false}
          className="mb-xs h-xl w-xl rounded-md border border-neutral-300"
          style={{ backgroundColor: isValid ? value.trim() : 'transparent' }}
        />
        <View className="flex-1">
          <AuthTextField
            testID={testID}
            label={label}
            value={value}
            onChangeText={onChange}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            editable={!isLocked}
          />
        </View>
      </View>
      {!isValid ? (
        <Text className={`text-start text-sm text-error ${fontClass}`}>{t('colorInvalid')}</Text>
      ) : ratio !== null && ratio < 4.5 ? (
        <Text
          testID={`${testID}-contrast`}
          className={`text-start text-sm text-error ${fontClass}`}
        >
          {t('contrastTooLow', { ratio: ratioText })}
        </Text>
      ) : null}
    </View>
  );
}

export default function TeamOrganizationScreen() {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { user, session } = useAuth();
  const { permissions } = useAccountAccess();
  const queryClient = useQueryClient();
  const refreshBranding = useRefreshOrganizationBranding();
  const canEditOrganization = permissions.has('settings.organization');
  const canEditBranding = permissions.has('settings.branding');
  const queryKey = ['team', user?.id ?? 'signed-out', 'organization'] as const;
  const organization = useQuery({
    queryKey,
    queryFn: () => fetchOrganizationSettings(supabase),
    enabled: user !== null && teamScreens(permissions).organization,
  });
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [languages, setLanguages] = useState<{
    readonly available: readonly SupportedLanguage[];
    readonly defaultLanguage: SupportedLanguage;
  }>({ available: ['ca'], defaultLanguage: 'ca' });
  const [logo, setLogo] = useState<PickedPhoto | null>(null);
  const [notice, setNotice] = useState<{ readonly ok: boolean; readonly text: string } | null>(
    null,
  );
  const row = organization.data;
  const locked = row?.locked_default_language ?? null;

  // The form starts from the saved settings, and again after each save.
  useEffect(() => {
    if (row === undefined) return;
    setName(row.name);
    setContactEmail(row.contact_email ?? '');
    setContactPhone(row.contact_phone ?? '');
    setPrimaryColor(row.primary_color);
    setSecondaryColor(row.secondary_color);
    setLanguages({ available: row.available_languages, defaultLanguage: row.default_language });
  }, [row]);

  const colorsValid = HEX.test(primaryColor.trim()) && HEX.test(secondaryColor.trim());
  const contrast = colorsValid
    ? validateBrandContrast({
        primaryColor: primaryColor.trim(),
        secondaryColor: secondaryColor.trim(),
      })
    : null;

  const save = useMutation({
    mutationFn: async () => {
      if (row === undefined) return;
      const input = {
        name,
        contactEmail,
        contactPhone,
        primaryColor,
        secondaryColor,
        availableLanguages: [...languages.available],
        defaultLanguage: languages.defaultLanguage,
      };
      organizationSettingsSchema.parse(input);
      const logoUrl = logo === null ? row.logo_url : await uploadOrganizationLogo(logo);
      await saveOrganizationSettings(supabase, { ...input, logoUrl });
    },
    onSuccess: async () => {
      playHaptic('success');
      setNotice({ ok: true, text: t('saved') });
      setLogo(null);
      refreshBranding();
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      playHaptic('error');
      setNotice({ ok: false, text: t('actionError') });
    },
  });

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset !== undefined) {
      setNotice(null);
      setLogo({ uri: asset.uri, width: asset.width, height: asset.height });
    }
  };

  const logoSource =
    logo !== null
      ? { uri: logo.uri }
      : resolveMediaImageSource({
          objectKeyOrUrl: row?.logo_url ?? null,
          mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
          accessToken: session?.access_token,
        });
  const canSave =
    row !== undefined &&
    !save.isPending &&
    name.trim().length > 0 &&
    colorsValid &&
    contrast?.ok === true;

  return (
    <SafeAreaView
      testID="team-organization"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="team-organization-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('tabOrganization')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>{t('intro')}</Text>
          </View>

          {row === undefined ? null : (
            <>
              <Section title={t('tabOrganization')}>
                <AuthTextField
                  testID="organization-name"
                  label={t('organizationName')}
                  value={name}
                  onChangeText={setName}
                  maxLength={200}
                  editable={canEditOrganization}
                />
                <AuthTextField
                  testID="organization-email"
                  label={t('contactEmail')}
                  value={contactEmail}
                  onChangeText={setContactEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={254}
                  editable={canEditOrganization}
                />
                <AuthTextField
                  testID="organization-phone"
                  label={t('contactPhone')}
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  keyboardType="phone-pad"
                  maxLength={254}
                  editable={canEditOrganization}
                />
              </Section>

              <Section title={t('logo')}>
                {logoSource === null ? null : (
                  <Image
                    testID="organization-logo"
                    source={logoSource}
                    style={logoStyle}
                    contentFit="contain"
                    accessibilityLabel={row.name}
                  />
                )}
                <PressableScale
                  testID="organization-choose-logo"
                  accessibilityRole="button"
                  accessibilityLabel={t('chooseLogo')}
                  onPress={() => void pickLogo()}
                  isDisabled={!canEditBranding}
                  haptic="tapLight"
                  style={continuousCorners}
                  className="min-h-recommended items-center justify-center self-start rounded-md border border-neutral-300 bg-white px-lg"
                >
                  <Text
                    className={`text-center text-md font-bold ${canEditBranding ? 'text-primary-dark' : 'text-neutral-400'} ${fontClass}`}
                  >
                    {t('chooseLogo')}
                  </Text>
                </PressableScale>
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                  {t('logoHelp')}
                </Text>
                <ColorField
                  testID="organization-primary-color"
                  label={t('primaryColor')}
                  value={primaryColor}
                  ratio={contrast?.primaryRatio ?? null}
                  onChange={(value) => {
                    setNotice(null);
                    setPrimaryColor(value);
                  }}
                  isLocked={!canEditBranding}
                />
                <ColorField
                  testID="organization-secondary-color"
                  label={t('secondaryColor')}
                  value={secondaryColor}
                  ratio={contrast?.secondaryRatio ?? null}
                  onChange={(value) => {
                    setNotice(null);
                    setSecondaryColor(value);
                  }}
                  isLocked={!canEditBranding}
                />
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                  {t('contrastHelp')}
                </Text>
              </Section>

              <Section title={t('languages')}>
                <View className="flex-row flex-wrap gap-sm">
                  {SUPPORTED_LANGUAGES.map((language) => (
                    <ChoiceOption
                      key={language}
                      testID={`organization-language-${language}`}
                      value={language}
                      label={LANGUAGE_NATIVE_NAMES[language]}
                      selected={languages.available.includes(language)}
                      onSelect={(next) => {
                        if (!canEditOrganization) return;
                        setNotice(null);
                        setLanguages((current) =>
                          toggleOrganizationLanguage(current, next, locked),
                        );
                      }}
                      languageFontClass={fontClass}
                    />
                  ))}
                </View>
                <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
                  {t('defaultLanguage')}
                </Text>
                <View className="flex-row flex-wrap gap-sm">
                  {languages.available.map((language) => (
                    <ChoiceOption
                      key={language}
                      testID={`organization-default-${language}`}
                      value={language}
                      label={LANGUAGE_NATIVE_NAMES[language]}
                      selected={language === languages.defaultLanguage}
                      onSelect={(next) => {
                        if (!canEditOrganization || locked !== null) return;
                        setNotice(null);
                        setLanguages((current) => ({ ...current, defaultLanguage: next }));
                      }}
                      languageFontClass={fontClass}
                    />
                  ))}
                </View>
                {locked === null ? null : (
                  <Text
                    className={`rounded-md bg-neutral-100 p-md text-start text-sm text-neutral-700 ${fontClass}`}
                  >
                    {t('languageLocked')}
                  </Text>
                )}
              </Section>

              <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                {t('fundingNotice')}
              </Text>
              <PressableScale
                testID="organization-save"
                accessibilityRole="button"
                accessibilityLabel={t('save')}
                onPress={() => {
                  setNotice(null);
                  save.mutate();
                }}
                isBusy={save.isPending}
                isDisabled={!canSave}
                haptic="tapLight"
                style={continuousCorners}
                className={`min-h-recommended items-center justify-center rounded-md px-lg ${
                  canSave ? 'bg-primary' : 'bg-neutral-200'
                }`}
              >
                <Text
                  className={`text-center text-md font-bold ${canSave ? 'text-white' : 'text-neutral-500'} ${fontClass}`}
                >
                  {save.isPending ? t('working') : t('save')}
                </Text>
              </PressableScale>
              {notice === null ? null : (
                <Text
                  testID="organization-notice"
                  accessibilityLiveRegion="polite"
                  className={`text-start text-md ${notice.ok ? 'text-success' : 'text-error'} ${fontClass}`}
                >
                  {notice.text}
                </Text>
              )}
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
