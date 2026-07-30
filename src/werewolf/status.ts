import { summarizeRoles } from './config';
import { currentNightRole } from './flow';
import type { WerewolfGame } from './types';

export function renderStatus(game: WerewolfGame): string {
  const players = game.players
    .map((item) => {
      const role = game.phase === 'ended' ? `（${item.role ?? '未知'}）` : '';
      const state = item.alive ? '存活' : '死亡';
      const sheriff = game.sheriffSeat === item.seat ? '👑' : '';
      return `${item.seat}.${item.name}${sheriff} ${state}${role}`;
    })
    .join('\n');

  const base = [
    `模式：${game.config.mode}`,
    `阶段：${game.phase}`,
    `人数：${game.players.length}/${game.config.playerCount}`,
    `角色：${summarizeRoles(game.config)}`,
    '玩家：',
    players,
  ];

  if (game.night && game.phase === 'night') {
    const role = currentNightRole(game);
    base.push(`当前夜晚：第${game.night.round}夜`);
    base.push(`当前行动角色：${role ?? '无'}`);
  }

  return base.join('\n');
}
