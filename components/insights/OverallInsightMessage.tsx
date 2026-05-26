'use client';

import { type ReactNode } from 'react';
import { BarChart3, CircleAlert, CircleCheck, Info } from 'lucide-react';

function stripOverallCardPrefix(message: string): string {
  return String(message ?? '')
    .replace(/^(?:\u2705|\u26A0\uFE0F|\u2139\uFE0F|\u{1F525})\s*/u, '')
    .trim();
}

function getOverallCardMeta(index: number, card: string): { icon: ReactNode } {
  const text = card.toLowerCase();
  if (index === 0) {
    if (text.includes('outperforming your usual level') || text.includes('better than your usual level')) {
      return { icon: <BarChart3 size={18} className="insight-message-icon insight-level-great" /> };
    }
    if (text.includes('above your usual level')) {
      return { icon: <BarChart3 size={18} className="insight-message-icon insight-level-warning" /> };
    }
    return { icon: <BarChart3 size={18} className="insight-message-icon insight-level-info" /> };
  }
  if (index === 1) {
    if (text.includes('costing you strokes')) {
      return { icon: <CircleAlert size={18} className="insight-message-icon insight-level-warning" /> };
    }
    if (text.includes('helping your score') || text.includes('saving strokes')) {
      return { icon: <CircleCheck size={18} className="insight-message-icon insight-level-success" /> };
    }
    return { icon: <Info size={18} className="insight-message-icon insight-level-info" /> };
  }
  if (text.includes('inconsistent')) {
    return { icon: <CircleAlert size={18} className="insight-message-icon insight-level-warning" /> };
  }
  if (text.includes('consistent')) {
    return { icon: <CircleCheck size={18} className="insight-message-icon insight-level-success" /> };
  }
  return { icon: <Info size={18} className="insight-message-icon insight-level-info" /> };
}

export default function OverallInsightMessage({ card, index }: { card: string; index: number }) {
  const meta = getOverallCardMeta(index, card);
  return (
    <div className="insight-message">
      <div className="insight-message-content">
        {meta.icon}
        <span className="insight-message-text">{stripOverallCardPrefix(card)}</span>
      </div>
    </div>
  );
}
