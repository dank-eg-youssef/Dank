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
            onDarkBubble ? 'text-sky-100/75' : 'text-slate-400 dark:text-[#8C9FB1]'
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
            onDarkBubble ? 'text-sky-100/80' : 'text-slate-400 dark:text-[#8C9FB1]'
          }`}
        />
      </span>
    );
  }

  return (
    <span title={t.chat.statusSeen} className="inline-flex items-center">
      <CheckCheck className="w-4 h-4 stroke-[2.5] text-[#2AABEE]" />
    </span>
  );
};
