/**
 * Every permission as a switch, grouped by area, each area with a switch for
 * all of it (RAPP-405), as the web admin's toggles. A permission the reader
 * does not hold is shown but locked, with the reason once above the list,
 * because the database refuses a change to it.
 */
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Switch, Text, View } from 'react-native';
import { permissionsByArea, type PermissionCode } from '@ramassa/shared/permissions';
import { tokens } from '@ramassa/shared/tokens';

const trackColor = { false: tokens.colors.neutral[300], true: tokens.colors.primary.DEFAULT };

/** i18next reads `.` as nesting, so a permission code is keyed with `_`. */
const permissionKey = (code: PermissionCode) => code.replace('.', '_');

export function PermissionToggles({
  value,
  onChange,
  holds,
}: {
  readonly value: ReadonlySet<PermissionCode>;
  readonly onChange: (next: ReadonlySet<PermissionCode>) => void;
  readonly holds: (code: PermissionCode) => boolean;
}) {
  const { t } = useTranslation('settings');
  const fontClass = useLanguageFontClass();
  const areas = permissionsByArea();
  const lockedAny = areas.some(({ codes }) => codes.some((code) => !holds(code)));

  const setCodes = (codes: readonly PermissionCode[], on: boolean) => {
    const next = new Set(value);
    for (const code of codes) {
      if (!holds(code)) continue;
      if (on) next.add(code);
      else next.delete(code);
    }
    onChange(next);
  };

  return (
    <View className="gap-md">
      {lockedAny ? (
        <Text
          className={`rounded-md bg-neutral-100 p-md text-start text-sm text-neutral-700 ${fontClass}`}
        >
          {t('team.lockedHint')}
        </Text>
      ) : null}
      {areas.map(({ area, codes }) => {
        const on = codes.filter((code) => value.has(code)).length;
        return (
          <View key={area} className="gap-sm rounded-md border border-neutral-200 p-md">
            <View className="flex-row items-center justify-between gap-sm">
              <Text
                accessibilityRole="header"
                className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}
              >
                {t(`team.area.${area}`)}
              </Text>
              <Switch
                testID={`permission-area-${area}`}
                accessibilityLabel={t(`team.area.${area}`)}
                value={on === codes.length}
                disabled={!codes.some(holds)}
                onValueChange={(next) => setCodes(codes, next)}
                trackColor={trackColor}
              />
            </View>
            {codes.map((code) => (
              <View key={code} className="flex-row items-start justify-between gap-md py-xs">
                <View className="flex-1 gap-xs">
                  <Text className={`text-start text-md font-medium text-neutral-900 ${fontClass}`}>
                    {t(`permissions.${permissionKey(code)}.label`)}
                  </Text>
                  <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                    {t(`permissions.${permissionKey(code)}.description`)}
                  </Text>
                </View>
                <Switch
                  testID={`permission-${code}`}
                  accessibilityLabel={t(`permissions.${permissionKey(code)}.label`)}
                  value={value.has(code)}
                  disabled={!holds(code)}
                  onValueChange={(next) => setCodes([code], next)}
                  trackColor={trackColor}
                />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
