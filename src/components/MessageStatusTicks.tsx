import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { MessageStatus } from '../types/dank';

interface MessageStatusTicksProps {
  status?: MessageStatus | '';
  onDarkBubble?: boolean;
  onSpotifyBubble?: boolean;
}

export const MessageStatusTicks: React.FC<MessageStatusTicksProps> = ({
  status,
  onDarkBubble = false,
  onSpotifyBubble = false,
}) => {
  const { t } = useLanguage();
  if (!status) return null;

  if (status === 'sent') {
    return (
      <span title={t.chat.statusSent} className="inline-flex items-center">
        <Check
          className={`w-3.5 h-3.5 stroke-[2.25] ${
            onSpotifyBubble
              ? 'text-[var(--dank-accent-fg)] opacity-65'
              : onDarkBubble
              ? 'text-[var(--dank-muted)]'
              : 'text-[var(--dank-muted)]'
          }`}
        />
      </span>
    );
  }

  if (status === 'delivered') {
    return (
      <span title={t.chat.statusDelivered} className="inline-flex items-center">
        <CheckCheck
          className={`w-4 h-4 stroke-[2.25] ${
            onSpotifyBubble
              ? 'text-[var(--dank-accent-fg)] opacity-65'
              : onDarkBubble
              ? 'text-[var(--dank-muted)]'
              : 'text-[var(--dank-muted)]'
          }`}
        />
      </span>
    );
  }

  return (
    <span title={t.chat.statusSeen} className="inline-flex items-center">
      <CheckCheck
        className={`w-4 h-4 stroke-[2.5] ${
          onSpotifyBubble ? 'text-[var(--dank-accent-fg)]' : 'text-[var(--dank-accent)]'
        }`}
      />
    </span>
  );
};
