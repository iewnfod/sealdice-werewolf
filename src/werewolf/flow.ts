import { nowUnixTimestamp } from './time';
import { formatAliveSeats, getAliveByRole, getAlivePlayers, getSeatPlayer, pushLog } from './core';
import { GOD_ROLES } from './types';
import type { CampType, NightRole, RoleType, WerewolfGame } from './types';

function roleCamp(role: RoleType): CampType {
  return role === '狼人' ? 'wolf' : 'good';
}

function aliveCampCount(game: WerewolfGame): { wolf: number; good: number } {
  let wolf = 0;
  let good = 0;
  getAlivePlayers(game).forEach((item) => {
    if (!item.role) {
      return;
    }

    if (roleCamp(item.role) === 'wolf') {
      wolf += 1;
    } else {
      good += 1;
    }
  });

  return { wolf, good };
}

function aliveGodAndVillager(game: WerewolfGame): { god: number; villager: number } {
  let god = 0;
  let villager = 0;

  getAlivePlayers(game).forEach((item) => {
    if (!item.role) {
      return;
    }

    if (item.role === '狼人') {
      return;
    }

    if (GOD_ROLES.includes(item.role)) {
      god += 1;
    } else {
      villager += 1;
    }
  });

  return { god, villager };
}

export function judgeWinner(game: WerewolfGame): string | undefined {
  const camp = aliveCampCount(game);
  if (camp.wolf <= 0) {
    return '好人阵营';
  }

  if (game.config.mode === '屠城') {
    if (camp.wolf >= camp.good) {
      return '狼人阵营';
    }
    return undefined;
  }

  const side = aliveGodAndVillager(game);
  if (side.god <= 0 || side.villager <= 0) {
    return '狼人阵营';
  }

  return undefined;
}

function nightOrderFor(game: WerewolfGame): NightRole[] {
  const result: NightRole[] = [];
  if (getAliveByRole(game, '守卫').length > 0) {
    result.push('守卫');
  }

  if (getAliveByRole(game, '狼人').length > 0) {
    result.push('狼人');
  }

  if (getAliveByRole(game, '预言家').length > 0) {
    result.push('预言家');
  }

  if (getAliveByRole(game, '女巫').length > 0) {
    result.push('女巫');
  }

  return result;
}

export function currentNightRole(game: WerewolfGame): NightRole | undefined {
  if (!game.night) {
    return undefined;
  }

  return game.night.order[game.night.stepIndex];
}

function broadcastNightPrompt(game: WerewolfGame): string {
  if (!game.night) {
    return '';
  }

  const role = currentNightRole(game);
  if (!role) {
    return '';
  }

  if (role === '狼人') {
    return `第${game.night.round}夜：狼人请私聊机器人使用“.狼人杀 行动 座号”选择刀人。`;
  }

  if (role === '女巫') {
    const canSave = game.night.witchSaveUsed ? '已用解药' : '可用解药';
    const canPoison = game.night.witchPoisonUsed ? '已用毒药' : '可用毒药';
    return `第${game.night.round}夜：女巫请私聊行动（${canSave}，${canPoison}）。格式：“.狼人杀 行动 救 座号” 或 “.狼人杀 行动 毒 座号” 或 “.狼人杀 行动 跳过”。`;
  }

  return `第${game.night.round}夜：${role}请私聊机器人使用“.狼人杀 行动 座号”。`;
}

export function initNight(game: WerewolfGame): string {
  const order = nightOrderFor(game);
  game.phase = 'night';
  game.night = {
    round: (game.night?.round ?? 0) + 1,
    order,
    stepIndex: 0,
    witchSaveUsed: game.night?.witchSaveUsed ?? false,
    witchPoisonUsed: game.night?.witchPoisonUsed ?? false,
  };
  pushLog(game, `进入第${game.night.round}夜。`);

  return broadcastNightPrompt(game);
}

export function killSeat(game: WerewolfGame, seat: number, reason: string): string | undefined {
  const target = getSeatPlayer(game, seat);
  if (!target || !target.alive) {
    return undefined;
  }

  target.alive = false;
  pushLog(game, `${target.seat}.${target.name}（${target.role}）死亡，原因：${reason}`);
  return `${target.seat}.${target.name}`;
}

export function endGame(game: WerewolfGame, winner: string): string {
  game.phase = 'ended';
  game.winner = winner;
  game.endedAt = nowUnixTimestamp();
  pushLog(game, `游戏结束，胜者：${winner}`);
  return `游戏结束，胜者：${winner}。可使用“.狼人杀 历史”查看对局记录。`;
}

function resolveNight(game: WerewolfGame): string {
  if (!game.night) {
    return '夜晚阶段信息缺失。';
  }

  const { wolfTarget, guardTarget, witchSaveTarget, witchPoisonTarget } = game.night;
  const dead: string[] = [];

  if (wolfTarget && wolfTarget !== guardTarget && wolfTarget !== witchSaveTarget) {
    const name = killSeat(game, wolfTarget, '夜晚袭击');
    if (name) {
      dead.push(name);
    }
  }

  if (witchPoisonTarget) {
    const name = killSeat(game, witchPoisonTarget, '女巫毒药');
    if (name && !dead.includes(name)) {
      dead.push(name);
    }
  }

  const winner = judgeWinner(game);
  if (winner) {
    return endGame(game, winner);
  }

  game.phase = 'day';
  game.dayVotes = {};
  const deadText = dead.length > 0 ? dead.join('、') : '平安夜';
  pushLog(game, `天亮了，死亡结果：${deadText}`);

  if (game.night.round === 1) {
    game.phase = 'sheriff';
    game.sheriffVotes = {};
    game.pendingNightReport = deadText;
    return '天亮了，请先竞选警长。请使用“.狼人杀 投票警长 座号”投票，主持人使用“.狼人杀 结束警长投票”结算。';
  }

  return `天亮了，昨夜结果：${deadText}。存活：${formatAliveSeats(game)}。请使用“.狼人杀 投票 座号”开始白天放逐投票，主持人使用“.狼人杀 结束投票”结算。`;
}

export function advanceNightStep(game: WerewolfGame): string {
  if (!game.night) {
    return '当前不在夜晚阶段。';
  }

  game.night.stepIndex += 1;
  if (game.night.stepIndex >= game.night.order.length) {
    return resolveNight(game);
  }

  return broadcastNightPrompt(game);
}
