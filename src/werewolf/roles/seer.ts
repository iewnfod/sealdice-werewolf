import type { NightActionResult } from '../interfaces';
import type { PlayerState, WerewolfGame } from '../types';

type SeerDeps = {
  parseSeat: (value: string) => number | undefined;
  seatExistsAndAlive: (game: WerewolfGame, seat: number) => [boolean, string];
  pushLog: (game: WerewolfGame, text: string) => void;
  getSeatPlayer: (game: WerewolfGame, seat: number) => PlayerState | undefined;
  advanceNightStep: (game: WerewolfGame) => string;
};

export function handleSeerAction(game: WerewolfGame, player: PlayerState, args: string[], deps: SeerDeps): NightActionResult {
  const seat = deps.parseSeat(args[0]);
  if (!seat) {
    return [false, '行动格式：.狼人杀 行动 座号', ''];
  }

  const [ok, err] = deps.seatExistsAndAlive(game, seat);
  if (!ok) {
    return [false, err, ''];
  }

  game.night!.seerChecked = seat;
  const target = deps.getSeatPlayer(game, seat);
  const identity = target?.role === '狼人' ? '狼人' : '好人';
  deps.pushLog(game, `预言家 ${player.seat}.${player.name} 查验了 ${seat}号，结果：${identity}`);
  return [true, `你查验了 ${seat}号，结果：${identity}`, deps.advanceNightStep(game)];
}
