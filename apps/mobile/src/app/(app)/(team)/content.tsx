/**
 * The Content area (RAPP-340): the content types the person manages, as the
 * web admin's Content menu has them: announcements, events (RAPP-342) and
 * the knowledge base (RAPP-343) so far. With more than one type, chips at the top switch between their lists.
 * On a phone a row opens its own screen; on a tablet it opens beside the
 * list. Services join in a later slice of phase 4.
 */
import { AnnouncementDetail } from '@/components/content/announcement-detail';
import { AnnouncementList } from '@/components/content/announcement-list';
import { EventDetail } from '@/components/content/event-detail';
import { EventList } from '@/components/content/event-list';
import { KnowledgeDetail } from '@/components/content/knowledge-detail';
import { KnowledgeList } from '@/components/content/knowledge-list';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { TeamBackToHome } from '@/components/team/team-back-to-home';
import { useTeamLayout } from '@/components/team/team-layout-context';
import { contentKinds, type ContentKind } from '@/lib/team-shell';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const listPaneStyle = { flex: 1 } as const;
const DETAIL_MIN = 320;
const DETAIL_MAX = 480;

const KIND_LABELS = {
  announcements: 'announcements:title',
  events: 'events:title',
  knowledge: 'knowledge:title',
} as const satisfies Record<ContentKind, string>;

const DETAIL_ROUTES = {
  announcements: '/content-announcement',
  events: '/content-event',
  knowledge: '/content-knowledge',
} as const satisfies Record<ContentKind, string>;

export default function ContentScreen() {
  const { t } = useTranslation(['announcements', 'events', 'knowledge']);
  const { t: tNav } = useTranslation('nav');
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const isSplit = useTeamLayout() === 'sidebar';
  const { width } = useWindowDimensions();
  const { permissions } = useAccountAccess();
  const kinds = useMemo(() => contentKinds(permissions), [permissions]);
  const [chosenKind, setChosenKind] = useState<ContentKind | null>(null);
  const kind = chosenKind !== null && kinds.includes(chosenKind) ? chosenKind : kinds[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailStyle = useMemo(
    () => ({ width: Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, Math.round(width * 0.4))) }),
    [width],
  );

  const chooseKind = (next: ContentKind) => {
    setChosenKind(next);
    setSelectedId(null);
  };
  const open = useCallback(
    (id: string) => {
      if (kind === undefined) return;
      if (isSplit) setSelectedId(id);
      else push(`${DETAIL_ROUTES[kind]}/${id}` as Href);
    },
    [isSplit, kind, push],
  );

  const top = (
    <>
      <TeamBackToHome />
      <Text
        accessibilityRole="header"
        className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
      >
        {tNav('team.content')}
      </Text>
      {kinds.length > 1 ? (
        <View className="flex-row flex-wrap gap-sm">
          {kinds.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`content-kind-${candidate}`}
              value={candidate}
              label={t(KIND_LABELS[candidate])}
              selected={candidate === kind}
              onSelect={chooseKind}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      ) : null}
    </>
  );

  const showTitle = kinds.length < 2;
  const list =
    kind === 'events' ? (
      <EventList top={top} selectedId={selectedId} onOpen={open} showTitle={showTitle} />
    ) : kind === 'knowledge' ? (
      <KnowledgeList top={top} selectedId={selectedId} onOpen={open} showTitle={showTitle} />
    ) : (
      <AnnouncementList top={top} selectedId={selectedId} onOpen={open} showTitle={showTitle} />
    );
  const detail =
    selectedId === null ? null : kind === 'events' ? (
      <EventDetail key={selectedId} eventId={selectedId} onDeleted={() => setSelectedId(null)} />
    ) : kind === 'knowledge' ? (
      <KnowledgeDetail
        key={selectedId}
        articleId={selectedId}
        onDeleted={() => setSelectedId(null)}
      />
    ) : (
      <AnnouncementDetail
        key={selectedId}
        announcementId={selectedId}
        onDeleted={() => setSelectedId(null)}
      />
    );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      {isSplit ? (
        <View className="flex-1 flex-row">
          <View style={listPaneStyle}>{list}</View>
          <View style={detailStyle} className="border-s border-neutral-200 bg-white">
            {detail}
          </View>
        </View>
      ) : (
        <PageWidth className="flex-1">{list}</PageWidth>
      )}
    </SafeAreaView>
  );
}
