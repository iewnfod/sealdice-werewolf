import { TIME_ZONE } from './types';
import type { GameHistoryItem } from './types';

export function renderHistoryList(histories: GameHistoryItem[]): string {
  return histories
    .map((item) => {
      return [
        `ID: ${item.id}`,
        `  模式：${item.mode}`,
        `  胜者：${item.winner}`,
        `  夜晚轮数：${item.rounds}`,
        `  结束时间：${new Date(item.endedAt * 1000).toLocaleString('zh-CN', { hour12: false, timeZone: TIME_ZONE })}`,
      ].join('\n');
    })
    .join('\n');
}

export function renderHistoryDetail(item: GameHistoryItem): string {
  return [`ID: ${item.id}`, ...item.summary].join('\n');
}
