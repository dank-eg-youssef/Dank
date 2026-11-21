import React, { useMemo, useState } from 'react';
import {
  Check,
  Film,
  Plus,
  Search,
  Smile,
  Sparkles,
  Sticker,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { UserSticker } from '../types/era';
import {
  ERA_EMOJI_CATEGORIES,
  ERA_EMOJIS,
  type EraEmojiCategory,
} from '../utils/eraEmojis';
import {
  ERA_GIFS,
  ERA_STICKER_PACKS,
  type EraGifItem,
  type EraSticker,
} from '../utils/stickers';
import { EraEmojiIcon } from './RichEmojiText';
import { StickerVisual } from './StickerVisual';

const ADDED_PACKS_STORAGE_KEY = 'era_added_sticker_packs';

function loadAddedPacks(): string[] {
  try {
    const raw = localStorage.getItem(ADDED_PACKS_STORAGE_KEY);
    if (!raw) return ERA_STICKER_PACKS.map((p) => p.id);
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string');
    }
  } catch {
    // ignore storage errors
  }
  return ERA_STICKER_PACKS.map((p) => p.id);
}

interface ChatMediaPickerProps {
  userStickers: UserSticker[];
  onPickEmoji: (emoji: string) => void;
  onSendPackSticker: (sticker: EraSticker) => void;
  onSendUserSticker: (sticker: UserSticker) => void;
  onDeleteUserSticker: (stickerDocId: string) => void;
  onSendGif: (gif: EraGifItem) => void;
  onOpenStickerMaker: () => void;
  onClose: () => void;
}

export const ChatMediaPicker: React.FC<ChatMediaPickerProps> = ({
  userStickers,
  onPickEmoji,
  onSendPackSticker,
  onSendUserSticker,
  onDeleteUserSticker,
  onSendGif,
  onOpenStickerMaker,
  onClose,
}) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'emoji' | 'stickers' | 'gifs'>('emoji');
  const [activeEmojiCat, setActiveEmojiCat] = useState<'all' | EraEmojiCategory>('all');
  const [showStore, setShowStore] = useState(false);
  const [addedPackIds, setAddedPackIds] = useState<string[]>(() => loadAddedPacks());
  const [activeStickerSection, setActiveStickerSection] = useState<string>('all');
  const [gifQuery, setGifQuery] = useState('');

  const togglePack = (packId: string) => {
    setAddedPackIds((prev) => {
      const exists = prev.includes(packId);
      const next = exists ? prev.filter((id) => id !== packId) : [...prev, packId];
      try {
        localStorage.setItem(ADDED_PACKS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const installedPacks = useMemo(
    () => ERA_STICKER_PACKS.filter((p) => addedPackIds.includes(p.id)),
    [addedPackIds]
  );

  const filteredGifs = useMemo(() => {
    const q = gifQuery.trim().toLowerCase();
    if (!q) return ERA_GIFS;
    return ERA_GIFS.filter(
      (g) =>
        g.titleEn.toLowerCase().includes(q) ||
        g.titleAr.toLowerCase().includes(q) ||
        g.keywords.some((kw) => kw.toLowerCase().includes(q))
    );
  }, [gifQuery]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="rounded-3xl bg-[var(--era-surface)] border border-[var(--era-border)] shadow-2xl overflow-hidden flex flex-col h-[310px] sm:h-[340px]"
    >
      {/* 3 Tabs Header: Emoji / Stickers / GIFs */}
      <div className="px-2.5 py-2 border-b border-[var(--era-border)] flex items-center justify-between gap-2 shrink-0 bg-[var(--era-elevated)]/60">
        <div className="grid grid-cols-3 gap-1 flex-1 bg-[var(--era-canvas)] p-1 rounded-full border border-[var(--era-border)]">
          <button
            type="button"
            onClick={() => {
              setActiveTab('emoji');
              setShowStore(false);
            }}
            className={`h-8 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'emoji'
                ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                : 'text-[var(--era-muted)] hover:text-[var(--era-text)]'
            }`}
          >
            <Smile className="w-3.5 h-3.5" />
            <span>{t.stickers.emojiTab}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stickers')}
            className={`h-8 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'stickers'
                ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                : 'text-[var(--era-muted)] hover:text-[var(--era-text)]'
            }`}
          >
            <Sticker className="w-3.5 h-3.5" />
            <span>{t.stickers.stickersTab}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('gifs');
              setShowStore(false);
            }}
            className={`h-8 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'gifs'
                ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                : 'text-[var(--era-muted)] hover:text-[var(--era-text)]'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>{t.stickers.gifsTab}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="w-8 h-8 rounded-full hover:bg-[var(--era-hover)] text-[var(--era-muted)] hover:text-[var(--era-text)] flex items-center justify-center shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* TAB 1: ERA CUSTOM 3D GLOSSY EMOJIS */}
      {activeTab === 'emoji' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 py-2 border-b border-[var(--era-border-subtle)] flex items-center gap-1.5 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setActiveEmojiCat('all')}
              className={`h-7 px-3 rounded-full text-[11px] font-bold shrink-0 cursor-pointer ${
                activeEmojiCat === 'all'
                  ? 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                  : 'bg-[var(--era-elevated)] text-[var(--era-muted)] hover:text-[var(--era-text)]'
              }`}
            >
              {language === 'ar' ? 'الكل (40)' : 'All (40)'}
            </button>
            {ERA_EMOJI_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveEmojiCat(cat.id)}
                className={`h-7 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  activeEmojiCat === cat.id
                    ? 'bg-[var(--era-accent-soft)] text-[var(--era-accent)] border border-[var(--era-accent-border)]'
                    : 'text-[var(--era-muted)] hover:bg-[var(--era-hover)]'
                }`}
              >
                <EraEmojiIcon char={cat.iconChar} className="w-4 h-4 object-contain" />
                <span>{language === 'ar' ? cat.labelAr : cat.labelEn}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3">
            {ERA_EMOJI_CATEGORIES.filter(
              (c) => activeEmojiCat === 'all' || c.id === activeEmojiCat
            ).map((cat) => {
              const items = ERA_EMOJIS.filter((em) => em.category === cat.id);
              return (
                <div key={cat.id} className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--era-muted)] px-1">
                    {language === 'ar' ? cat.labelAr : cat.labelEn}
                  </p>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                    {items.map((em) => (
                      <button
                        key={em.id}
                        type="button"
                        title={language === 'ar' ? em.nameAr : em.nameEn}
                        onClick={() => onPickEmoji(em.char)}
                        className="h-11 rounded-xl hover:bg-[var(--era-hover)] active:scale-90 flex items-center justify-center transition-transform cursor-pointer"
                      >
                        <img
                          src={em.cloudinaryUrl}
                          alt={em.char}
                          loading="lazy"
                          className="w-8 h-8 object-contain select-none pointer-events-none"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: STICKERS (My Stickers + 4 Free Packs + Sticker Store + Sticker Maker) */}
      {activeTab === 'stickers' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Sub-bar: Create Sticker + Store toggle + Quick Pack Filter */}
          <div className="px-3 py-2 border-b border-[var(--era-border-subtle)] flex items-center gap-1.5 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={onOpenStickerMaker}
              className="h-8 px-3 rounded-full bg-[var(--era-accent)] hover:bg-[var(--era-accent-hover)] text-[var(--era-accent-fg)] text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{t.stickers.createSticker}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowStore((v) => !v)}
              className={`h-8 px-3 rounded-full border text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                showStore
                  ? 'bg-[var(--era-accent-soft)] border-[var(--era-accent)] text-[var(--era-accent)]'
                  : 'bg-[var(--era-elevated)] border-[var(--era-border)] text-[var(--era-text)]'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>{t.stickers.stickerStore}</span>
            </button>

            {!showStore && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveStickerSection('all')}
                  className={`h-8 px-2.5 rounded-full text-[11px] font-semibold shrink-0 cursor-pointer ${
                    activeStickerSection === 'all'
                      ? 'bg-[var(--era-accent-soft)] text-[var(--era-accent)]'
                      : 'text-[var(--era-muted)] hover:bg-[var(--era-hover)]'
                  }`}
                >
                  {t.stickers.myStickers} ({userStickers.length})
                </button>
                {installedPacks.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setActiveStickerSection(pack.id)}
                    className={`h-8 px-2.5 rounded-full text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer ${
                      activeStickerSection === pack.id
                        ? 'bg-[var(--era-accent-soft)] text-[var(--era-accent)]'
                        : 'text-[var(--era-muted)] hover:bg-[var(--era-hover)]'
                    }`}
                  >
                    <span>{pack.previewEmoji}</span>
                    <span>{language === 'ar' ? pack.nameAr : pack.nameEn}</span>
                  </button>
                ))}
              </>
            )}
          </div>

          {showStore ? (
            /* STICKER STORE: 4 Free Sticker Packs */
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3">
              {ERA_STICKER_PACKS.map((pack) => {
                const isAdded = addedPackIds.includes(pack.id);
                return (
                  <div
                    key={pack.id}
                    className="rounded-2xl bg-[var(--era-canvas)] border border-[var(--era-border)] p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-xl bg-[var(--era-surface)] border border-[var(--era-border)] flex items-center justify-center text-xl shrink-0">
                          {pack.previewEmoji}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-[var(--era-text)] truncate">
                              {language === 'ar' ? pack.nameAr : pack.nameEn}
                            </p>
                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--era-accent-soft)] text-[var(--era-accent)] text-[9px] font-extrabold">
                              {t.stickers.freeBadge}
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--era-muted)]">
                            {pack.stickers.length} {t.stickers.stickersCount}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => togglePack(pack.id)}
                        className={`h-8 px-3 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer ${
                          isAdded
                            ? 'bg-[var(--era-elevated)] text-[var(--era-accent)] border border-[var(--era-accent-border)]'
                            : 'bg-[var(--era-accent)] text-[var(--era-accent-fg)]'
                        }`}
                      >
                        {isAdded ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        <span>{isAdded ? t.stickers.addedPack : t.stickers.addPack}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {pack.stickers.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => onSendPackSticker(st)}
                          className="p-1 rounded-2xl hover:bg-[var(--era-hover)] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                        >
                          <StickerVisual stickerId={st.id} size="sm" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* STICKERS PICKER GRID */
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-4">
              {/* My Stickers Section */}
              {(activeStickerSection === 'all' || userStickers.length > 0) &&
                activeStickerSection === 'all' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--era-muted)] flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-[var(--era-accent)]" />
                        {t.stickers.myStickers}
                      </span>
                    </div>

                    {userStickers.length === 0 ? (
                      <div className="rounded-2xl bg-[var(--era-canvas)] border border-dashed border-[var(--era-border)] p-3 text-center">
                        <p className="text-[11px] text-[var(--era-muted)]">{t.stickers.noMyStickers}</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {userStickers.map((us) => (
                          <div key={us.id} className="relative group flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => onSendUserSticker(us)}
                              className="p-1 rounded-2xl hover:bg-[var(--era-hover)] transition-transform active:scale-95 cursor-pointer"
                            >
                              <StickerVisual
                                stickerId={us.stickerId}
                                imageUrl={us.imageUrl}
                                label={us.label}
                                size="sm"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteUserSticker(us.id);
                              }}
                              aria-label={t.common.delete}
                              className="absolute -top-1 -end-1 w-5 h-5 rounded-full bg-black/80 text-red-400 border border-white/15 flex items-center justify-center opacity-85 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              {/* Installed Sticker Packs */}
              {installedPacks
                .filter((p) => activeStickerSection === 'all' || activeStickerSection === p.id)
                .map((pack) => (
                  <div key={pack.id} className="space-y-2">
                    <div className="px-1 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--era-muted)]">
                        {pack.previewEmoji} {language === 'ar' ? pack.nameAr : pack.nameEn}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--era-accent)]">
                        {pack.stickers.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {pack.stickers.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => onSendPackSticker(st)}
                          className="p-1 rounded-2xl hover:bg-[var(--era-hover)] flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                        >
                          <StickerVisual stickerId={st.id} size="sm" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GIFS */}
      {activeTab === 'gifs' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="p-2.5 border-b border-[var(--era-border-subtle)] shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--era-muted)] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                dir="auto"
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                placeholder={t.stickers.searchGifs}
                className="w-full h-9 ps-9 pe-3 rounded-full bg-[var(--era-canvas)] border border-[var(--era-border)] text-xs text-[var(--era-text)] placeholder:text-[var(--era-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--era-accent)]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-2.5">
            {filteredGifs.length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--era-muted)]">
                {t.stickers.noGifsFound}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredGifs.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => onSendGif(gif)}
                    className="group relative rounded-2xl overflow-hidden border border-[var(--era-border)] hover:border-[var(--era-accent)] bg-black/20 transition-all active:scale-97 cursor-pointer"
                  >
                    <img
                      src={gif.dataUrl}
                      alt={language === 'ar' ? gif.titleAr : gif.titleEn}
                      className="w-full h-24 object-cover"
                    />
                    <span className="absolute bottom-1.5 start-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-white text-[9px] font-extrabold tracking-wider">
                      GIF
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
