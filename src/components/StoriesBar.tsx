import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { Story, UserPublic } from '../types/era';
import { Avatar } from './Avatar';

export interface StoryAuthorGroup {
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  stories: Story[];
  hasUnviewed: boolean;
}

interface StoriesBarProps {
  currentUser: UserPublic;
  stories: Story[];
  usersMap: Record<string, UserPublic>;
  viewedStoryIds: Set<string>;
  onOpenCreateStory: () => void;
  onOpenStoryGroup: (group: StoryAuthorGroup) => void;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({
  currentUser,
  stories,
  usersMap,
  viewedStoryIds,
  onOpenCreateStory,
  onOpenStoryGroup,
}) => {
  const { t } = useLanguage();
  const { myGroup, otherGroups } = useMemo(() => {
    const now = Date.now();
    const active = stories.filter((s) => {
      if (!s.expiresAt) return true;
      return s.expiresAt.toMillis() > now;
    });

    const grouped: Record<string, Story[]> = {};
    for (const s of active) {
      if (!grouped[s.authorId]) grouped[s.authorId] = [];
      grouped[s.authorId].push(s);
    }

    const toGroup = (authorId: string, list: Story[]): StoryAuthorGroup => {
      const sorted = [...list].sort(
        (a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)
      );
      const user = usersMap[authorId];
      return {
        authorId,
        authorName: user?.name || sorted[0].authorName,
        authorPhoto: user?.photoURL || sorted[0].authorPhoto,
        stories: sorted,
        hasUnviewed: sorted.some((s) => !viewedStoryIds.has(s.id)),
      };
    };

    const mine = grouped[currentUser.uid]
      ? toGroup(currentUser.uid, grouped[currentUser.uid])
      : null;

    const others = Object.entries(grouped)
      .filter(([uid]) => uid !== currentUser.uid)
      .map(([uid, list]) => toGroup(uid, list))
      .sort((a, b) => {
        if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
        const aLatest = a.stories[a.stories.length - 1]?.createdAt?.toMillis() || 0;
        const bLatest = b.stories[b.stories.length - 1]?.createdAt?.toMillis() || 0;
        return bLatest - aLatest;
      });

    return { myGroup: mine, otherGroups: others };
  }, [stories, currentUser.uid, usersMap, viewedStoryIds]);

  return (
    <div className="px-4 py-3 shrink-0 border-b border-[var(--era-border)] bg-[var(--era-canvas)]">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--era-muted)]">
          {t.stories.title}
        </span>
        <button
          type="button"
          onClick={onOpenCreateStory}
          className="text-xs font-bold text-[var(--era-accent)] hover:underline cursor-pointer"
        >
          {t.stories.addStoryShort}
        </button>
      </div>

      <div className="flex items-center gap-3.5 overflow-x-auto pb-1">
        {/* My Status Circle */}
        <div className="flex flex-col items-center gap-1.5 min-w-[64px] max-w-[70px]">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (myGroup) onOpenStoryGroup(myGroup);
                else onOpenCreateStory();
              }}
              title={myGroup ? t.stories.viewYourStory : t.stories.add24hStory}
              className={`rounded-full p-[2.5px] transition-transform hover:scale-105 cursor-pointer ${
                myGroup
                  ? 'bg-[var(--era-accent)]'
                  : 'border-2 border-dashed border-[var(--era-muted)]'
              }`}
            >
              <div className="rounded-full bg-[var(--era-canvas)] p-[2px]">
                <Avatar src={currentUser.photoURL} name={currentUser.name} size="md" />
              </div>
            </button>
            <button
              type="button"
              onClick={onOpenCreateStory}
              title={t.stories.postNewStory}
              aria-label={t.stories.postNewStory}
              className="absolute -bottom-0.5 -end-0.5 w-5 h-5 rounded-full bg-[var(--era-accent)] text-[var(--era-accent-fg)] border-2 border-[var(--era-canvas)] flex items-center justify-center shadow-xs hover:bg-[var(--era-accent-hover)] cursor-pointer"
            >
              <Plus className="w-3 h-3 stroke-[3]" />
            </button>
          </div>
          <span className="text-[11px] text-[var(--era-text)] font-medium truncate w-full text-center">
            {t.whatsapp.myStatus}
          </span>
        </div>

        {/* Others' Stories Circles */}
        {otherGroups.map((group) => (
          <button
            key={group.authorId}
            type="button"
            onClick={() => onOpenStoryGroup(group)}
            title={t.stories.viewUserStory(group.authorName)}
            className="flex flex-col items-center gap-1.5 min-w-[64px] max-w-[70px] group cursor-pointer"
          >
            <div
              className={`rounded-full p-[2.5px] transition-transform group-hover:scale-105 ${
                group.hasUnviewed ? 'bg-[var(--era-accent)]' : 'bg-[var(--era-elevated)]'
              }`}
            >
              <div className="rounded-full bg-[var(--era-canvas)] p-[2px]">
                <Avatar src={group.authorPhoto} name={group.authorName} size="md" />
              </div>
            </div>
            <span className="text-[11px] text-[var(--era-text)] font-medium truncate w-full text-center">
              {group.authorName.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
