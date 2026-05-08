import { findHistoryById } from '../storage';
import { renderHistoryDetail, renderHistoryList } from '../history';
import { nowUnixTimestamp } from '../time';
import type { CommandContext } from '../interfaces';
import type { WerewolfGame } from '../types';

type MetaDeps = {
  renderStatus: (game: WerewolfGame) => string;
  pushLog: (game: WerewolfGame, text: string) => void;
  persistFinishedGame: (storage: any, game: WerewolfGame) => void;
  removeGame: (storage: any, groupId: string) => void;
  saveStorage: (ext: seal.ExtInfo, storage: any) => void;
};

export function handleMetaCommands(arg1: string, command: CommandContext, deps: MetaDeps): boolean {
  const { ctx, msg, cmdArgs, ext, storage, groupId, userId, game } = command;
  if (arg1 === '状态') {
    if (!game) {
      seal.replyToSender(ctx, msg, '本群暂无对局。');
      return true;
    }

    seal.replyToSender(ctx, msg, `[狼人杀]\n${deps.renderStatus(game)}`);
    return true;
  }

  if (arg1 === '结束') {
    if (!game) {
      seal.replyToSender(ctx, msg, '本群暂无对局。');
      return true;
    }

    if (userId !== game.hostUserId && ctx.privilegeLevel < 50) {
      seal.replyToSender(ctx, msg, '只有主持人或管理员可结束对局。');
      return true;
    }

    const winner = game.winner ?? '已终止';
    if (game.phase !== 'ended') {
      game.phase = 'ended';
      game.winner = winner;
      game.endedAt = nowUnixTimestamp();
      deps.pushLog(game, '对局被手动结束。');
    }

    deps.persistFinishedGame(storage, game);
    deps.removeGame(storage, groupId);
    deps.saveStorage(ext, storage);
    seal.replyToSender(ctx, msg, '[狼人杀] 当前对局已结束并归档。');
    return true;
  }

  if (arg1 === '历史') {
    const histories = storage.histories[groupId] ?? [];
    if (histories.length <= 0) {
      seal.replyToSender(ctx, msg, '[狼人杀] 暂无历史记录。');
      return true;
    }

    const historyId = cmdArgs.getArgN(2);
    if (!historyId) {
      const text = renderHistoryList(histories);
      seal.replyToSender(ctx, msg, `[狼人杀] 历史列表：\n${text}\n使用“.狼人杀 历史 ID”查看详情。`);
      return true;
    }

    const target = findHistoryById(storage, groupId, historyId);
    if (!target) {
      seal.replyToSender(ctx, msg, '[狼人杀] 历史ID不存在。');
      return true;
    }

    seal.replyToSender(ctx, msg, `[狼人杀] 历史详情：\n${renderHistoryDetail(target)}`);
    return true;
  }

  return false;
}
