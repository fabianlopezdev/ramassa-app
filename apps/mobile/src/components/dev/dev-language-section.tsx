import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';
import { getLanguageDirection, SUPPORTED_LANGUAGES, useLanguage } from '@ramassa/shared/i18n';
import { DevButton, DevButtonRow, DevNote, DevRow, DevSection } from './dev-ui';

/**
 * Language and RTL (RAPP-19 scope item 2).
 *
 * The readout matters as much as the buttons. React Native only applies a
 * layout-direction flip on the NEXT app start, so right after switching to
 * ar/fa the app is in a split state: i18next says rtl, `I18nManager.isRTL` still
 * says ltr, and the UI has not mirrored. That is the single most confusing thing
 * about this app's i18n, so both values are shown side by side and the reload
 * button only appears when they actually disagree.
 */
export function DevLanguageSection() {
  const { language, direction, setLanguage } = useLanguage();
  const isNativeDirectionStale = I18nManager.isRTL !== (direction === 'rtl');

  return (
    <DevSection title="Language and direction">
      <DevRow label="i18next language" value={language} />
      <DevRow label="Derived direction" value={direction} />
      <DevRow label="Native I18nManager.isRTL" value={String(I18nManager.isRTL)} />

      <DevButtonRow>
        {SUPPORTED_LANGUAGES.map((code) => (
          <DevButton
            key={code}
            testID={`dev-language-${code}`}
            label={`${code} (${getLanguageDirection(code)})`}
            isActive={code === language}
            onPress={() => void setLanguage(code)}
          />
        ))}
      </DevButtonRow>

      {isNativeDirectionStale ? (
        <>
          <DevNote>
            Native layout direction is stale. React Native applies the flip on the next start only.
          </DevNote>
          <DevButtonRow>
            <DevButton
              label="Reload app to apply direction"
              onPress={() => void reloadAppAsync()}
            />
          </DevButtonRow>
        </>
      ) : (
        <DevNote>Native layout direction matches the language.</DevNote>
      )}
    </DevSection>
  );
}
