import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Text, View } from 'react-native';

/**
 * The terms text she reads before accepting (RAPP-21), on the onboarding terms
 * screen and when a new version asks her again (RAPP-613). Selectable, in the
 * form size and her language's font.
 */
export function TermsBody({ body }: { readonly body: string }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View style={continuousCorners} className="rounded-md bg-neutral-50 p-md">
      <Text
        selectable
        className={`text-start text-form leading-body text-neutral-800 ${languageFontClass}`}
      >
        {body}
      </Text>
    </View>
  );
}
