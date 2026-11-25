/**
 * The club's base documents in Ajuda (RAPP-972): the season start guide, the
 * safeguarding protocol, the code of conduct. The team writes them with the
 * guides editor in the club's base-documents category; this long card opens
 * that category's list, where each document opens like a guide. Until the club
 * has published one, there is no card.
 */
import { RaisedIconCard } from '@/components/layout/raised-icon-card';
import { selectBaseDocumentsCategory, selectPlayerGuides } from '@/lib/player-guides';
import { usePlayerKnowledgeArticles, usePlayerKnowledgeCategories } from '@/lib/player-knowledge';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';

export function BaseDocumentsCard() {
  const { push } = useRouter();
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const categories = usePlayerKnowledgeCategories().data;
  const articles = usePlayerKnowledgeArticles().data;
  const category = useMemo(
    () => selectBaseDocumentsCategory(categories, selectPlayerGuides(articles)),
    [articles, categories],
  );
  const categoryId = category?.id;
  const open = useCallback(() => {
    if (categoryId === undefined) return;
    push({ pathname: '/guides/[categoryId]', params: { categoryId } } as unknown as Href);
  }, [categoryId, push]);
  if (category === null) return null;
  const title = resolveLocalizedText(category.name, language)?.text ?? '';
  return (
    <RaisedIconCard
      testID="ajuda-open-base-documents"
      icon="document"
      title={title}
      accessibilityLabel={title}
      languageFontClass={languageFontClass}
      onOpen={open}
    />
  );
}
