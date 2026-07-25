import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { ListItemTransition } from '@/components/motion/list-item-transition';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { SkeletonPulse } from '@/components/motion/skeleton-pulse';
import { SuccessPop } from '@/components/motion/success-pop';
import { HAPTIC_FEEDBACKS } from '@/lib/haptics/haptic-policy';
import { areHapticsEnabled, playHaptic, setHapticsEnabled } from '@/lib/haptics/haptics';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { DevButton, DevButtonRow, DevNote, DevRow, DevSection } from './dev-ui';

/**
 * The microinteractions gallery (RAPP-70 acceptance criterion).
 *
 * Every primitive in one place so QA can feel them without hunting for the
 * screen that happens to use one, and so the reduce-motion behaviour can be
 * checked by flipping the OS setting and watching this panel rather than by
 * reasoning about it. The readout at the top is the important part: it shows
 * what the app currently believes, which is what makes a mismatch obvious.
 */
export function DevMotionSection() {
  const isReducedMotion = useReducedMotion();
  const [hapticsOn, setHapticsOn] = useState(areHapticsEnabled);
  const [entranceKey, setEntranceKey] = useState(0);
  const [successKey, setSuccessKey] = useState<number | null>(null);
  const [shakeCode, setShakeCode] = useState<AppErrorCode | null>(null);
  const [listRows, setListRows] = useState<readonly number[]>([1, 2, 3]);

  function toggleHaptics() {
    const next = !hapticsOn;
    setHapticsEnabled(next);
    setHapticsOn(next);
  }

  return (
    <DevSection title="Microinteractions">
      <DevRow label="Reduce motion (OS)" value={isReducedMotion ? 'on' : 'off'} />
      <DevRow label="Haptics kill switch" value={hapticsOn ? 'enabled' : 'disabled'} />
      <DevNote>
        With reduce motion on, movement disappears but opacity and haptics remain: a state change
        must still be perceivable.
      </DevNote>
      <DevButtonRow>
        <DevButton
          label={hapticsOn ? 'Disable haptics' : 'Enable haptics'}
          onPress={toggleHaptics}
        />
      </DevButtonRow>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">Haptic vocabulary</Text>
      <DevButtonRow>
        {HAPTIC_FEEDBACKS.map((feedback) => (
          <DevButton key={feedback} label={feedback} onPress={() => playHaptic(feedback)} />
        ))}
      </DevButtonRow>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">PressableScale</Text>
      <PressableScale
        accessibilityLabel="Press me to feel the scale response"
        onPress={() => undefined}
        haptic="tapLight"
        className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
      >
        <Text className="text-md font-bold text-white">Press and hold me</Text>
      </PressableScale>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">FadeSlideIn (staggered)</Text>
      <View key={entranceKey} className="gap-xs">
        {[0, 1, 2, 3].map((index) => (
          <FadeSlideIn key={index} index={index}>
            <View className="rounded-md bg-neutral-100 px-md py-sm">
              <Text className="text-sm text-neutral-700">{`List item ${index + 1}`}</Text>
            </View>
          </FadeSlideIn>
        ))}
      </View>
      <DevButtonRow>
        <DevButton label="Replay entrance" onPress={() => setEntranceKey((key) => key + 1)} />
      </DevButtonRow>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">SuccessPop</Text>
      {successKey === null ? (
        <DevNote>Not shown. Trigger it to see the pop and feel the success haptic.</DevNote>
      ) : (
        <SuccessPop key={successKey} className="items-start">
          <View className="rounded-md bg-success px-md py-sm">
            <Text className="text-sm font-bold text-neutral-900">Signed up</Text>
          </View>
        </SuccessPop>
      )}
      <DevButtonRow>
        <DevButton label="Trigger success" onPress={() => setSuccessKey((key) => (key ?? 0) + 1)} />
      </DevButtonRow>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">ShakeOnError</Text>
      <ShakeOnError errorCode={shakeCode}>
        <View className="rounded-md bg-error/10 px-md py-sm">
          <Text className="text-sm font-medium text-error">
            {shakeCode ?? 'No error. Trigger one below.'}
          </Text>
        </View>
      </ShakeOnError>
      <DevButtonRow>
        {/* Two codes on purpose: one warns (fixable input), one errors. */}
        <DevButton label="Shake AUTH-6 (warning)" onPress={() => setShakeCode('AUTH-6')} />
        <DevButton label="Shake NETWORK-1 (error)" onPress={() => setShakeCode('NETWORK-1')} />
        <DevButton label="Clear" onPress={() => setShakeCode(null)} />
      </DevButtonRow>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">
        ListItemTransition (add/remove)
      </Text>
      <DevNote>Neighbours slide into place instead of jumping a whole row.</DevNote>
      <View className="gap-xs">
        {listRows.map((row) => (
          <ListItemTransition key={row}>
            <View className="rounded-md bg-neutral-100 px-md py-sm">
              <Text className="text-sm text-neutral-700">{`Row ${row}`}</Text>
            </View>
          </ListItemTransition>
        ))}
      </View>
      <DevButtonRow>
        <DevButton
          label="Add row"
          onPress={() => setListRows((rows) => [...rows, (rows.at(-1) ?? 0) + 1])}
        />
        <DevButton label="Remove first" onPress={() => setListRows((rows) => rows.slice(1))} />
        <DevButton label="Reset rows" onPress={() => setListRows([1, 2, 3])} />
      </DevButtonRow>

      <Text className="pt-xs text-sm font-semibold text-neutral-700">SkeletonPulse</Text>
      <View className="gap-xs">
        <SkeletonPulse className="h-lg w-full rounded-md" />
        <SkeletonPulse className="h-lg w-3/4 rounded-md" />
        <SkeletonPulse className="h-lg w-1/2 rounded-md" />
      </View>
    </DevSection>
  );
}
