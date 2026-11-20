import { useSectionWash } from '@/components/layout/raised-surface';
import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import { useForumCategories } from './player-forum';

/**
 * The wash of a forum post's category (RAPP-893): the shade its card carries
 * in the list, so the post opens onto the same colour. `wash` is `undefined`
 * while the categories load and for a category with no colour, such as
 * `neutral`; `screenStyle` is then the screen's own style unchanged.
 */
export function useForumPostWash(
  categoryId: string | undefined,
  baseScreenStyle: ViewStyle,
): { readonly wash: string | undefined; readonly screenStyle: ViewStyle } {
  const categoriesQuery = useForumCategories();
  const colorName = categoriesQuery.data?.find((category) => category.id === categoryId)?.color;
  const wash = useSectionWash(colorName);
  return useMemo(
    () => ({
      wash,
      screenStyle:
        wash === undefined ? baseScreenStyle : { ...baseScreenStyle, backgroundColor: wash },
    }),
    [baseScreenStyle, wash],
  );
}
