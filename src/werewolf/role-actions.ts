import { handleGuardAction } from './roles/guard';
import { handleSeerAction } from './roles/seer';
import { handleWitchAction } from './roles/witch';
import { handleWolfAction } from './roles/wolf';
import type { NightActionResult } from './interfaces';
import type { NightRole, PlayerState, StorageRoot, WerewolfGame } from './types';

type RoleActionDeps = {
  parseSeat: (value: string) => number | undefined;
  getPlayer: (game: WerewolfGame, userId: string) => PlayerState | undefined;
  getSeatPlayer: (game: WerewolfGame, seat: number) => PlayerState | undefined;
  seatExistsAndAlive: (game: WerewolfGame, seat: number) => [boolean, string];
  currentNightRole: (game: WerewolfGame) => NightRole | undefined;
  advanceNightStep: (game: WerewolfGame) => string;
  pushLog: (game: WerewolfGame, text: string) => void;
};

export function handleNightActionPrivate(
  game: WerewolfGame,
  userId: string,
  args: string[],
  deps: RoleActionDeps,
): NightActionResult {
  if (game.phase !== 'night' || !game.night) {
    return [false, '当前不是夜晚行动阶段。', ''];
  }

  const player = deps.getPlayer(game, userId);
  if (!player || !player.alive || !player.role) {
    return [false, '你不是本局存活玩家。', ''];
  }

  const role = deps.currentNightRole(game);
  if (!role) {
    return [false, '当前夜晚阶段异常。', ''];
  }

  if (role !== '狼人' && player.role !== role) {
    return [false, `当前应由${role}行动。`, ''];
  }

  if (role === '狼人' && player.role !== '狼人') {
    return [false, '当前应由狼人行动。', ''];
  }

  if (role === '女巫') {
    return handleWitchAction(game, player, args, {
      parseSeat: deps.parseSeat,
      seatExistsAndAlive: deps.seatExistsAndAlive,
      pushLog: deps.pushLog,
      advanceNightStep: deps.advanceNightStep,
    });
  }

  if (role === '守卫') {
    return handleGuardAction(game, player, args, {
      parseSeat: deps.parseSeat,
      seatExistsAndAlive: deps.seatExistsAndAlive,
      pushLog: deps.pushLog,
      advanceNightStep: deps.advanceNightStep,
    });
  }

  if (role === '狼人') {
    return handleWolfAction(game, player, args, {
      parseSeat: deps.parseSeat,
      seatExistsAndAlive: deps.seatExistsAndAlive,
      pushLog: deps.pushLog,
      advanceNightStep: deps.advanceNightStep,
    });
  }

  if (role === '预言家') {
    return handleSeerAction(game, player, args, {
      parseSeat: deps.parseSeat,
      seatExistsAndAlive: deps.seatExistsAndAlive,
      pushLog: deps.pushLog,
      getSeatPlayer: deps.getSeatPlayer,
      advanceNightStep: deps.advanceNightStep,
    });
  }

  return [false, '暂不支持当前行动。', ''];
}

export function findPrivateActionGame(
  storage: StorageRoot,
  userId: string,
  getPlayer: (game: WerewolfGame, uid: string) => PlayerState | undefined,
  currentNightRole: (game: WerewolfGame) => NightRole | undefined,
): WerewolfGame | undefined {
  return Object.values(storage.games).find((game) => {
    if (game.phase !== 'night' || !game.night) {
      return false;
    }

    const role = currentNightRole(game);
    const player = getPlayer(game, userId);
    if (!role || !player || !player.alive || !player.role) {
      return false;
    }

    if (role === '狼人') {
      return player.role === '狼人';
    }

    return player.role === role;
  });
}
