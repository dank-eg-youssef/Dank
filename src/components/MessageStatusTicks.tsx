import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { MessageStatus } from '../types/dank';

interface MessageStatusTicksProps {
  status?: MessageStatus | '';
  onDarkBubble?: boolean;
}

export const MessageStatusTicks: React.FC<MessageStatusTicksProps> = ({
  status,
  onDarkBubble = false,
}) => {
  const { t } = useLanguage();
  if (!status) return null;

  if (status === 'sent') {
    return (
      <span title={t.chat.statusSent} className="inline-flex items-center">
        <Check
          className={`w-3.5 h-3.5 stroke-[2.25] ${
            onDarkBubble ? 'text-slate-300/80' : 'text-slate-400'
          }`}
        />
      </span>
    );
  }

  if (status === 'delivered') {
    return (
      <span title={t.chat.statusDelivered} className="inline-flex items-center">
        <CheckCheck className="w-4 h-4 stroke-[2.25] text-slate-400" />
      </span>
    );
  }

  // 'seen' -> TWO RED checkmarks
  return (
    <span title={t.chat.statusSeen} className="inline-flex items-center">
      <CheckCheck className="w-4 h-4 stroke-[2.5] text-red-500" />
    </span>
  );
};
