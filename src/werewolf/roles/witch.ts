import type { NightActionResult } from '../interfaces';
import type { PlayerState, WerewolfGame } from '../types';

type WitchDeps = {
  parseSeat: (value: string) => number | undefined;
  seatExistsAndAlive: (game: WerewolfGame, seat: number) => [boolean, string];
  pushLog: (game: WerewolfGame, text: string) => void;
  advanceNightStep: (game: WerewolfGame) => string;
};

export function handleWitchAction(game: WerewolfGame, player: PlayerState, args: string[], deps: WitchDeps): NightActionResult {
  const action = args[0];
  if (!action || action === '跳过') {
    deps.pushLog(game, `女巫 ${player.seat}.${player.name} 选择跳过。`);
    return [true, '你选择了跳过。', deps.advanceNightStep(game)];
  }

  const seat = deps.parseSeat(args[1]);
  if (!seat) {
    return [false, '女巫行动格式：.狼人杀 行动 救 座号 / .狼人杀 行动 毒 座号', ''];
  }

  const [ok, err] = deps.seatExistsAndAlive(game, seat);
  if (!ok) {
    return [false, err, ''];
  }

  if (action === '救') {
    if (game.night!.witchSaveUsed) {
      return [false, '你的解药已使用过。', ''];
    }

    if (game.night!.wolfTarget !== seat) {
      return [false, '本夜该座号不是被狼人袭击目标，不能使用解药。', ''];
    }

    if (game.night!.guardTarget === seat) {
      return [false, '该目标已被守卫守护，无需使用解药。', ''];
    }

    game.night!.witchSaveUsed = true;
    game.night!.witchSaveTarget = seat;
    deps.pushLog(game, `女巫 ${player.seat}.${player.name} 使用解药救下 ${seat}号。`);
    return [true, `你使用了解药救下 ${seat}号。`, deps.advanceNightStep(game)];
  }

  if (action === '毒') {
    if (game.night!.witchPoisonUsed) {
      return [false, '你的毒药已使用过。', ''];
    }

    game.night!.witchPoisonUsed = true;
    game.night!.witchPoisonTarget = seat;
    deps.pushLog(game, `女巫 ${player.seat}.${player.name} 使用毒药，目标 ${seat}号。`);
    return [true, `你对 ${seat}号 使用了毒药。`, deps.advanceNightStep(game)];
  }

  return [false, '女巫行动只支持“救”“毒”“跳过”。', ''];
}
