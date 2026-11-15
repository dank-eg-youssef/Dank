import React, { useEffect, useState } from 'react';
import { AlarmClock, Calendar, Clock, Trash2, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ChatReminder, ScheduledMessage } from '../types/dank';

function toLocalDateInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalTimeInput(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function combineDateAndTime(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function formatScheduledTarget(ms: number, language: 'ar' | 'en', labels: { today: string; tomorrow: string }): string {
  const target = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();
  const diffDays = Math.round((startOfTarget - startOfToday) / 86_400_000);

  const timeStr = target.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (diffDays === 0) return `${labels.today} ${timeStr}`;
  if (diffDays === 1) return `${labels.tomorrow} ${timeStr}`;
  const datePart = target.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${datePart} ${timeStr}`;
}

interface ScheduleMessageModalProps {
  initialText?: string;
  editingSchedule?: ScheduledMessage | null;
  chatTitle: string;
  onSave: (params: { text: string; scheduledAtMs: number; scheduleId?: string }) => Promise<void>;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ScheduleMessageModal: React.FC<ScheduleMessageModalProps> = ({
  initialText = '',
  editingSchedule = null,
  chatTitle,
  onSave,
  onClose,
  onNotify,
}) => {
  const { t } = useLanguage();
  const defaultMs = editingSchedule
    ? editingSchedule.scheduledAt.toMillis()
    : Date.now() + 60 * 60 * 1000;

  const [messageText, setMessageText] = useState(
    editingSchedule ? editingSchedule.text : initialText
  );
  const [dateStr, setDateStr] = useState(() => toLocalDateInput(defaultMs));
  const [timeStr, setTimeStr] = useState(() => toLocalTimeInput(defaultMs));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingSchedule) {
      const ms = editingSchedule.scheduledAt.toMillis();
      setMessageText(editingSchedule.text);
      setDateStr(toLocalDateInput(ms));
      setTimeStr(toLocalTimeInput(ms));
    }
  }, [editingSchedule]);

  const applyPresetMs = (ms: number) => {
    setDateStr(toLocalDateInput(ms));
    setTimeStr(toLocalTimeInput(ms));
  };

  const applyTonight9pm = () => {
    const now = new Date();
    const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0, 0);
    if (tonight.getTime() <= Date.now() + 60_000) {
      tonight.setDate(tonight.getDate() + 1);
    }
    applyPresetMs(tonight.getTime());
  };

  const applyTomorrow8am = () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0);
    applyPresetMs(tomorrow.getTime());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = messageText.trim();
    if (!clean || saving) return;

    const targetMs = combineDateAndTime(dateStr, timeStr);
    if (!targetMs || targetMs <= Date.now() + 5000) {
      onNotify(t.schedule.futureTimeRequired);
      return;
    }

    setSaving(true);
    try {
      await onSave({
        text: clean,
        scheduledAtMs: targetMs,
        scheduleId: editingSchedule?.id,
      });
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-[var(--dank-text)] shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-[var(--dank-border)] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-5 h-5 text-[var(--dank-accent)] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">{t.schedule.scheduleMessage}</h3>
              <p dir="auto" className="text-[11px] text-[var(--dank-muted)] truncate">
                {chatTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-8 h-8 rounded-full hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-3.5">
          {/* Quick Presets */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPresetMs(Date.now() + 15 * 60 * 1000)}
              className="h-7 px-3 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] border border-[var(--dank-border)] text-[11px] font-semibold cursor-pointer"
            >
              {t.schedule.in15m}
            </button>
            <button
              type="button"
              onClick={() => applyPresetMs(Date.now() + 60 * 60 * 1000)}
              className="h-7 px-3 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] border border-[var(--dank-border)] text-[11px] font-semibold cursor-pointer"
            >
              {t.schedule.in1h}
            </button>
            <button
              type="button"
              onClick={applyTonight9pm}
              className="h-7 px-3 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] border border-[var(--dank-border)] text-[11px] font-semibold cursor-pointer"
            >
              {t.schedule.tonight9pm}
            </button>
            <button
              type="button"
              onClick={applyTomorrow8am}
              className="h-7 px-3 rounded-full bg-[var(--dank-accent-soft)] border border-[var(--dank-accent-border)] text-[var(--dank-accent)] text-[11px] font-bold cursor-pointer"
            >
              {t.schedule.tomorrow8am}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--dank-muted)] mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[var(--dank-accent)]" />
                {t.schedule.pickDate}
              </label>
              <input
                type="date"
                required
                value={dateStr}
                min={toLocalDateInput(Date.now())}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-sm text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--dank-muted)] mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-[var(--dank-accent)]" />
                {t.schedule.pickTime}
              </label>
              <input
                type="time"
                required
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-sm text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--dank-muted)] mb-1">
              {t.schedule.messageLabel}
            </label>
            <textarea
              rows={3}
              dir="auto"
              required
              autoFocus
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={t.schedule.messagePlaceholder}
              className="w-full p-3 rounded-2xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-sm text-[var(--dank-text)] placeholder:text-[var(--dank-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)] resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={!messageText.trim() || saving}
            className="w-full h-11 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
          >
            <Clock className="w-4 h-4" />
            <span>{editingSchedule ? t.schedule.updateSchedule : t.schedule.saveSchedule}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

interface ChatReminderModalProps {
  chatTitle: string;
  existingReminders: ChatReminder[];
  onSave: (params: { remindAtMs: number; note?: string }) => Promise<void>;
  onDeleteReminder: (reminderId: string) => Promise<void>;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const ChatReminderModal: React.FC<ChatReminderModalProps> = ({
  chatTitle,
  existingReminders,
  onSave,
  onDeleteReminder,
  onClose,
  onNotify,
}) => {
  const { t, language } = useLanguage();
  const defaultMs = Date.now() + 60 * 60 * 1000;
  const [dateStr, setDateStr] = useState(() => toLocalDateInput(defaultMs));
  const [timeStr, setTimeStr] = useState(() => toLocalTimeInput(defaultMs));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const applyPresetMs = (ms: number) => {
    setDateStr(toLocalDateInput(ms));
    setTimeStr(toLocalTimeInput(ms));
  };

  const applyTomorrow8am = () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0);
    applyPresetMs(tomorrow.getTime());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const targetMs = combineDateAndTime(dateStr, timeStr);
    if (!targetMs || targetMs <= Date.now() + 5000) {
      onNotify(t.schedule.futureTimeRequired);
      return;
    }

    setSaving(true);
    try {
      await onSave({ remindAtMs: targetMs, note: note.trim() || undefined });
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : t.errors.unexpected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--dank-surface)] border border-[var(--dank-border)] text-[var(--dank-text)] shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-[var(--dank-border)] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <AlarmClock className="w-5 h-5 text-[var(--dank-accent)] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">{t.schedule.setReminder}</h3>
              <p dir="auto" className="text-[11px] text-[var(--dank-muted)] truncate">
                {chatTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="w-8 h-8 rounded-full hover:bg-[var(--dank-hover)] flex items-center justify-center text-[var(--dank-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-4 space-y-3.5">
          {existingReminders.length > 0 && (
            <div className="space-y-1.5">
              {existingReminders.map((rem) => (
                <div
                  key={rem.id}
                  className="px-3 py-2 rounded-2xl bg-[var(--dank-accent-soft)] border border-[var(--dank-accent-border)] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--dank-accent)] truncate">
                      {t.schedule.activeReminder}:{' '}
                      {formatScheduledTarget(rem.remindAt.toMillis(), language, {
                        today: t.schedule.today,
                        tomorrow: t.schedule.tomorrow,
                      })}
                    </p>
                    {rem.note && (
                      <p dir="auto" className="text-[11px] text-[var(--dank-text)] truncate">
                        {rem.note}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onDeleteReminder(rem.id)}
                    title={t.schedule.cancelReminder}
                    className="w-8 h-8 rounded-full hover:bg-red-500/20 text-red-500 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyPresetMs(Date.now() + 15 * 60 * 1000)}
              className="h-7 px-3 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] border border-[var(--dank-border)] text-[11px] font-semibold cursor-pointer"
            >
              {t.schedule.in15m}
            </button>
            <button
              type="button"
              onClick={() => applyPresetMs(Date.now() + 60 * 60 * 1000)}
              className="h-7 px-3 rounded-full bg-[var(--dank-elevated)] hover:bg-[var(--dank-hover)] border border-[var(--dank-border)] text-[11px] font-semibold cursor-pointer"
            >
              {t.schedule.in1h}
            </button>
            <button
              type="button"
              onClick={applyTomorrow8am}
              className="h-7 px-3 rounded-full bg-[var(--dank-accent-soft)] border border-[var(--dank-accent-border)] text-[var(--dank-accent)] text-[11px] font-bold cursor-pointer"
            >
              {t.schedule.tomorrow8am}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--dank-muted)] mb-1">
                {t.schedule.pickDate}
              </label>
              <input
                type="date"
                required
                value={dateStr}
                min={toLocalDateInput(Date.now())}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-sm text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[var(--dank-muted)] mb-1">
                {t.schedule.pickTime}
              </label>
              <input
                type="time"
                required
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-sm text-[var(--dank-text)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--dank-muted)] mb-1">
              {t.schedule.reminderNote}
            </label>
            <input
              type="text"
              dir="auto"
              maxLength={180}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.schedule.reminderNotePlaceholder}
              className="w-full h-10 px-3.5 rounded-xl bg-[var(--dank-canvas)] border border-[var(--dank-border)] text-sm text-[var(--dank-text)] placeholder:text-[var(--dank-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--dank-accent)]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
          >
            <AlarmClock className="w-4 h-4" />
            <span>{t.schedule.saveReminder}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
