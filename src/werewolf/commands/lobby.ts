import { nowUnixTimestamp } from '../time';
import type { CommandContext } from '../interfaces';
import type { GameConfig, PlayerState, StorageRoot, WerewolfGame } from '../types';

type LobbyDeps = {
  cloneDefaultConfig: () => GameConfig;
  parseConfigArgs: (game: WerewolfGame, args: string[]) => [boolean, string];
  summarizeRoles: (config: GameConfig) => string;
  canStartGame: (game: WerewolfGame) => [boolean, string];
  buildRolePool: (config: GameConfig) => string[];
  shuffle: <T>(arr: T[]) => T[];
  initNight: (game: WerewolfGame) => string;
  getPlayer: (game: WerewolfGame, userId: string) => PlayerState | undefined;
  pushLog: (game: WerewolfGame, text: string) => void;
  writeGame: (storage: StorageRoot, game: WerewolfGame) => void;
  removeGame: (storage: StorageRoot, groupId: string) => void;
  saveStorage: (ext: seal.ExtInfo, storage: StorageRoot) => void;
};

export function handleLobbyCommands(arg1: string, command: CommandContext, deps: LobbyDeps): boolean {
  const { ctx, msg, cmdArgs, ext, storage, groupId, userId, game } = command;

  if (arg1 === '开始') {
    if (game && game.phase !== 'ended') {
      seal.replyToSender(ctx, msg, '本群已有进行中的对局，请先“.狼人杀 结束”或完成当前对局。');
      return true;
    }

    const newGame: WerewolfGame = {
      groupId,
      groupName: ctx.group.groupName,
      hostUserId: userId,
      config: deps.cloneDefaultConfig(),
      phase: 'lobby',
      players: [],
      sheriffVotes: {},
      dayVotes: {},
      logs: [],
      createdAt: nowUnixTimestamp(),
    };

    const args = cmdArgs.args.slice(2);
    const [ok, parseMsg] = deps.parseConfigArgs(newGame, args);
    if (!ok) {
      seal.replyToSender(ctx, msg, parseMsg);
      return true;
    }

    const host: PlayerState = {
      userId,
      name: ctx.player.name,
      seat: 1,
      alive: true,
    };
    newGame.players.push(host);
    deps.pushLog(newGame, `${host.name} 创建了对局，模式 ${newGame.config.mode}。`);
    deps.writeGame(storage, newGame);
    deps.saveStorage(ext, storage);
    seal.replyToSender(
      ctx,
      msg,
      `[狼人杀] 已创建对局。模式：${newGame.config.mode}，人数：${newGame.config.playerCount}，角色：${deps.summarizeRoles(newGame.config)}。\n当前玩家：1.${host.name}。其他玩家请使用“.狼人杀 加入”。`,
    );
    return true;
  }

  if (arg1 === '加入') {
    if (!game) {
      seal.replyToSender(ctx, msg, '本群暂无对局，请先使用“.狼人杀 开始”。');
      return true;
    }

    if (game.phase !== 'lobby') {
      seal.replyToSender(ctx, msg, '当前已开局，不能再加入。');
      return true;
    }

    if (deps.getPlayer(game, userId)) {
      seal.replyToSender(ctx, msg, '你已经在本局中。');
      return true;
    }

    if (game.players.length >= game.config.playerCount) {
      seal.replyToSender(ctx, msg, '人数已满，主持人可直接“.狼人杀 开局”。');
      return true;
    }

    const seat = game.players.length + 1;
    game.players.push({
      userId,
      name: ctx.player.name,
      seat,
      alive: true,
    });
    deps.pushLog(game, `${seat}.${ctx.player.name} 加入了游戏。`);
    deps.writeGame(storage, game);
    deps.saveStorage(ext, storage);
    seal.replyToSender(ctx, msg, `[狼人杀] ${seat}.${ctx.player.name} 加入成功，当前人数 ${game.players.length}/${game.config.playerCount}。`);
    return true;
  }

  if (arg1 === '退出') {
    if (!game) {
      seal.replyToSender(ctx, msg, '本群暂无对局。');
      return true;
    }

    if (game.phase !== 'lobby') {
      seal.replyToSender(ctx, msg, '已开局后不可退出。');
      return true;
    }

    const player = deps.getPlayer(game, userId);
    if (!player) {
      seal.replyToSender(ctx, msg, '你不在当前对局中。');
      return true;
    }

    game.players = game.players.filter((item) => item.userId !== userId);
    game.players.forEach((item, index) => {
      item.seat = index + 1;
    });

    if (game.players.length <= 0) {
      deps.removeGame(storage, groupId);
      deps.saveStorage(ext, storage);
      seal.replyToSender(ctx, msg, '[狼人杀] 对局无人，已自动解散。');
      return true;
    }

    if (game.hostUserId === userId) {
      game.hostUserId = game.players[0].userId;
    }

    deps.pushLog(game, `${ctx.player.name} 退出了对局。`);
    deps.writeGame(storage, game);
    deps.saveStorage(ext, storage);
    seal.replyToSender(ctx, msg, '[狼人杀] 你已退出当前对局。');
    return true;
  }

  if (arg1 === '开局') {
    if (!game) {
      seal.replyToSender(ctx, msg, '本群暂无对局。');
      return true;
    }

    if (userId !== game.hostUserId) {
      seal.replyToSender(ctx, msg, '只有主持人可开局。');
      return true;
    }

    if (game.phase !== 'lobby') {
      seal.replyToSender(ctx, msg, '当前阶段不可开局。');
      return true;
    }

    const [ok, err] = deps.canStartGame(game);
    if (!ok) {
      seal.replyToSender(ctx, msg, err);
      return true;
    }

    const rolePool = deps.shuffle(deps.buildRolePool(game.config));
    game.players.forEach((item, index) => {
      item.role = rolePool[index] as any;
    });

    game.sheriffVotes = {};
    game.dayVotes = {};
    const nightPrompt = deps.initNight(game);
    deps.pushLog(game, '游戏开局，进入第一夜。');
    deps.writeGame(storage, game);
    deps.saveStorage(ext, storage);

    game.players.forEach((item) => {
      const fake = seal.newMessage();
      fake.messageType = 'private';
      fake.sender = {
        nickname: item.name,
        userId: item.userId,
      };
      const privateCtx = seal.createTempCtx(ctx.endPoint, fake);
      seal.replyPerson(privateCtx, fake, `[狼人杀] 你的身份是：${item.role}`);
    });

    seal.replyToSender(
      ctx,
      msg,
      `[狼人杀] 开局成功，座位：${game.players
        .map((item) => `${item.seat}.${item.name}`)
        .join('、')}。\n${nightPrompt}`,
    );
    return true;
  }

  return false;
}
