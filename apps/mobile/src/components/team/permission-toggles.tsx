/**
 * Every permission as a switch, grouped by area, each area with a switch for
 * all of it (RAPP-405), as the web admin's toggles. A permission the reader
 * does not hold is shown but locked, with the reason once above the list,
 * because the database refuses a change to it.
 */
import { SwitchCard } from '@/components/forms/switch-card';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { permissionsByArea, type PermissionCode } from '@ramassa/shared/permissions';

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
    <View className="gap-lg">
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
          <View key={area} className="gap-sm">
            <SwitchCard
              testID={`permission-area-${area}`}
              label={t(`team.area.${area}`)}
              labelWeight="bold"
              value={on === codes.length}
              isDisabled={!codes.some(holds)}
              onValueChange={(next) => setCodes(codes, next)}
            />
            {/* The permissions of the area sit in from its own switch. */}
            <View className="gap-sm ps-md">
              {codes.map((code) => (
                <SwitchCard
                  key={code}
                  testID={`permission-${code}`}
                  label={t(`permissions.${permissionKey(code)}.label`)}
                  description={t(`permissions.${permissionKey(code)}.description`)}
                  value={value.has(code)}
                  isDisabled={!holds(code)}
                  onValueChange={(next) => setCodes([code], next)}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
