import pkg from '../package.json';

type CampType = 'good' | 'wolf';
type GameMode = '屠边' | '屠城';
type RoleType = '狼人' | '预言家' | '女巫' | '猎人' | '守卫' | '村民';
type PhaseType = 'lobby' | 'sheriff' | 'night' | 'day' | 'ended';
type NightRole = '守卫' | '狼人' | '预言家' | '女巫';

interface PlayerState {
  userId: string;
  name: string;
  seat: number;
  role?: RoleType;
  alive: boolean;
}

interface GameConfig {
  mode: GameMode;
  playerCount: number;
  roleCounts: Record<RoleType, number>;
}

interface NightState {
  round: number;
  order: NightRole[];
  stepIndex: number;
  wolfTarget?: number;
  guardTarget?: number;
  seerChecked?: number;
  witchSaveUsed: boolean;
  witchPoisonUsed: boolean;
  witchSaveTarget?: number;
  witchPoisonTarget?: number;
}

interface WerewolfGame {
  groupId: string;
  groupName: string;
  hostUserId: string;
  config: GameConfig;
  phase: PhaseType;
  sheriffSeat?: number;
  players: PlayerState[];
  night?: NightState;
  sheriffVotes: Record<string, number>;
  dayVotes: Record<string, number>;
  logs: string[];
  winner?: string;
  createdAt: number;
  endedAt?: number;
}

interface GameHistoryItem {
  startedAt: number;
  endedAt: number;
  mode: GameMode;
  winner: string;
  rounds: number;
  summary: string[];
}

type StorageRoot = {
  games: Record<string, WerewolfGame>;
  histories: Record<string, GameHistoryItem[]>;
};

const extName = '狼人杀';
const author = 'Iewnfod';
const version = pkg.version;
const STORAGE_KEY = 'werewolf:state:v1';
const TIME_ZONE = 'Asia/Shanghai';
const DEFAULT_CONFIG: GameConfig = {
  mode: '屠边',
  playerCount: 9,
  roleCounts: {
    狼人: 3,
    预言家: 1,
    女巫: 1,
    猎人: 1,
    守卫: 1,
    村民: 2,
  },
};

function createDefaultStorage(): StorageRoot {
  return {
    games: {},
    histories: {},
  };
}

function createRet(showHelp = false): seal.CmdExecuteResult {
  const ret = seal.ext.newCmdExecuteResult(true);
  ret.showHelp = showHelp;
  return ret;
}

function nowUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function isRoleType(value: string): value is RoleType {
  return ['狼人', '预言家', '女巫', '猎人', '守卫', '村民'].includes(value);
}

function parseStorage(ext: seal.ExtInfo): StorageRoot {
  const raw = ext.storageGet(STORAGE_KEY);
  if (!raw) {
    return createDefaultStorage();
  }

  try {
    return JSON.parse(raw) as StorageRoot;
  } catch (_error) {
    return createDefaultStorage();
  }
}

function saveStorage(ext: seal.ExtInfo, storage: StorageRoot): void {
  ext.storageSet(STORAGE_KEY, JSON.stringify(storage));
}

function pushLog(game: WerewolfGame, text: string): void {
  const stamp = new Date().toLocaleString('zh-CN', {
    hour12: false,
    timeZone: TIME_ZONE,
  });
  game.logs.push(`[${stamp}] ${text}`);
}

function getPlayer(game: WerewolfGame, userId: string): PlayerState | undefined {
  return game.players.find((item) => item.userId === userId);
}

function getSeatPlayer(game: WerewolfGame, seat: number): PlayerState | undefined {
  return game.players.find((item) => item.seat === seat);
}

function getAlivePlayers(game: WerewolfGame): PlayerState[] {
  return game.players.filter((item) => item.alive);
}

function getAliveByRole(game: WerewolfGame, role: RoleType): PlayerState[] {
  return game.players.filter((item) => item.alive && item.role === role);
}

function formatAliveSeats(game: WerewolfGame): string {
  return getAlivePlayers(game)
    .map((item) => `${item.seat}.${item.name}`)
    .join('、');
}

function summarizeRoles(config: GameConfig): string {
  return (Object.keys(config.roleCounts) as RoleType[])
    .map((role) => `${role}x${config.roleCounts[role]}`)
    .join('，');
}

function countRoleTotal(config: GameConfig): number {
  return Object.values(config.roleCounts).reduce((sum, value) => sum + value, 0);
}

function parseSeat(value: string): number | undefined {
  const seat = Number(value);
  if (!Number.isInteger(seat) || seat <= 0) {
    return undefined;
  }

  return seat;
}

function parseMode(raw: string): GameMode | undefined {
  if (raw === '屠边' || raw === 'tb') {
    return '屠边';
  }

  if (raw === '屠城' || raw === 'tc') {
    return '屠城';
  }

  return undefined;
}

function cloneDefaultConfig(): GameConfig {
  return {
    mode: DEFAULT_CONFIG.mode,
    playerCount: DEFAULT_CONFIG.playerCount,
    roleCounts: {
      狼人: DEFAULT_CONFIG.roleCounts.狼人,
      预言家: DEFAULT_CONFIG.roleCounts.预言家,
      女巫: DEFAULT_CONFIG.roleCounts.女巫,
      猎人: DEFAULT_CONFIG.roleCounts.猎人,
      守卫: DEFAULT_CONFIG.roleCounts.守卫,
      村民: DEFAULT_CONFIG.roleCounts.村民,
    },
  };
}

function roleCamp(role: RoleType): CampType {
  return role === '狼人' ? 'wolf' : 'good';
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function buildRolePool(config: GameConfig): RoleType[] {
  const result: RoleType[] = [];
  (Object.keys(config.roleCounts) as RoleType[]).forEach((role) => {
    for (let i = 0; i < config.roleCounts[role]; i += 1) {
      result.push(role);
    }
  });

  return result;
}

function canStartGame(game: WerewolfGame): [boolean, string] {
  const roleTotal = countRoleTotal(game.config);
  if (roleTotal !== game.config.playerCount) {
    return [false, `角色数量总和(${roleTotal})与总人数(${game.config.playerCount})不一致`];
  }

  if (game.players.length !== game.config.playerCount) {
    return [false, `当前人数 ${game.players.length}/${game.config.playerCount}，请继续加入后再开局`];
  }

  return [true, 'ok'];
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
  const gods: RoleType[] = ['预言家', '女巫', '猎人', '守卫'];
  let god = 0;
  let villager = 0;

  getAlivePlayers(game).forEach((item) => {
    if (!item.role) {
      return;
    }

    if (item.role === '狼人') {
      return;
    }

    if (gods.includes(item.role)) {
      god += 1;
    } else {
      villager += 1;
    }
  });

  return { god, villager };
}

function judgeWinner(game: WerewolfGame): string | undefined {
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

function currentNightRole(game: WerewolfGame): NightRole | undefined {
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

function initNight(game: WerewolfGame): string {
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

function advanceNightStep(game: WerewolfGame): string {
  if (!game.night) {
    return '当前不在夜晚阶段。';
  }

  game.night.stepIndex += 1;
  if (game.night.stepIndex >= game.night.order.length) {
    return resolveNight(game);
  }

  return broadcastNightPrompt(game);
}

function killSeat(game: WerewolfGame, seat: number, reason: string): string | undefined {
  const target = getSeatPlayer(game, seat);
  if (!target || !target.alive) {
    return undefined;
  }

  target.alive = false;
  pushLog(game, `${target.seat}.${target.name}（${target.role}）死亡，原因：${reason}`);
  return `${target.seat}.${target.name}`;
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
  return `天亮了，昨夜结果：${deadText}。存活：${formatAliveSeats(game)}。请使用“.狼人杀 投票 座号”开始白天放逐投票，主持人使用“.狼人杀 结束投票”结算。`;
}

function tallyVotes(votes: Record<string, number>): [number | undefined, boolean] {
  const counter = new Map<number, number>();
  Object.values(votes).forEach((seat) => {
    const old = counter.get(seat) ?? 0;
    counter.set(seat, old + 1);
  });

  let maxSeat: number | undefined;
  let maxVotes = 0;
  let tie = false;

  counter.forEach((value, seat) => {
    if (value > maxVotes) {
      maxVotes = value;
      maxSeat = seat;
      tie = false;
    } else if (value === maxVotes) {
      tie = true;
    }
  });

  if (!maxSeat || maxVotes === 0) {
    return [undefined, false];
  }

  return [maxSeat, tie];
}

function createHistoryItem(game: WerewolfGame): GameHistoryItem {
  return {
    startedAt: game.createdAt,
    endedAt: game.endedAt ?? nowUnixTimestamp(),
    mode: game.config.mode,
    winner: game.winner ?? '未结算',
    rounds: game.night?.round ?? 0,
    summary: [...game.logs],
  };
}

function endGame(game: WerewolfGame, winner: string): string {
  game.phase = 'ended';
  game.winner = winner;
  game.endedAt = nowUnixTimestamp();
  pushLog(game, `游戏结束，胜者：${winner}`);
  return `游戏结束，胜者：${winner}。可使用“.狼人杀 历史”查看对局记录。`;
}

function renderStatus(game: WerewolfGame): string {
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
    `玩家：`,
    players,
  ];

  if (game.night && game.phase === 'night') {
    const role = currentNightRole(game);
    base.push(`当前夜晚：第${game.night.round}夜`);
    base.push(`当前行动角色：${role ?? '无'}`);
  }

  return base.join('\n');
}

function readGame(storage: StorageRoot, groupId: string): WerewolfGame | undefined {
  return storage.games[groupId];
}

function writeGame(storage: StorageRoot, game: WerewolfGame): void {
  storage.games[game.groupId] = game;
}

function removeGame(storage: StorageRoot, groupId: string): void {
  delete storage.games[groupId];
}

function persistFinishedGame(storage: StorageRoot, game: WerewolfGame): void {
  const list = storage.histories[game.groupId] ?? [];
  list.unshift(createHistoryItem(game));
  storage.histories[game.groupId] = list.slice(0, 20);
}

function parseConfigArgs(game: WerewolfGame, args: string[]): [boolean, string] {
  if (args.length >= 1) {
    const mode = parseMode(args[0]);
    if (!mode) {
      return [false, '模式需为“屠边/tb”或“屠城/tc”'];
    }

    game.config.mode = mode;
  }

  if (args.length >= 2) {
    const count = Number(args[1]);
    if (!Number.isInteger(count) || count <= 0) {
      return [false, '人数必须是正整数'];
    }

    game.config.playerCount = count;
  }

  for (let i = 2; i < args.length; i += 1) {
    const raw = args[i];
    const parts = raw.split('=');
    if (parts.length !== 2) {
      return [false, `参数格式错误：${raw}，应为 角色=数量`];
    }

    const roleRaw = parts[0];
    const value = Number(parts[1]);
    if (!isRoleType(roleRaw)) {
      return [false, `未知角色：${parts[0]}`];
    }

    if (!Number.isInteger(value) || value < 0) {
      return [false, `角色数量需为非负整数：${raw}`];
    }

    game.config.roleCounts[roleRaw] = value;
  }

  return [true, 'ok'];
}

function seatExistsAndAlive(game: WerewolfGame, seat: number): [boolean, string] {
  const player = getSeatPlayer(game, seat);
  if (!player) {
    return [false, `不存在座号 ${seat}`];
  }

  if (!player.alive) {
    return [false, `目标 ${seat}.${player.name} 已死亡`];
  }

  return [true, 'ok'];
}

function handleNightActionPrivate(game: WerewolfGame, userId: string, args: string[]): [boolean, string, string] {
  if (game.phase !== 'night' || !game.night) {
    return [false, '当前不是夜晚行动阶段。', ''];
  }

  const player = getPlayer(game, userId);
  if (!player || !player.alive || !player.role) {
    return [false, '你不是本局存活玩家。', ''];
  }

  const role = currentNightRole(game);
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
    const action = args[0];
    if (!action || action === '跳过') {
      pushLog(game, `女巫 ${player.seat}.${player.name} 选择跳过。`);
      return [true, '你选择了跳过。', advanceNightStep(game)];
    }

    const seat = parseSeat(args[1]);
    if (!seat) {
      return [false, '女巫行动格式：.狼人杀 行动 救 座号 / .狼人杀 行动 毒 座号', ''];
    }

    const [ok, err] = seatExistsAndAlive(game, seat);
    if (!ok) {
      return [false, err, ''];
    }

    if (action === '救') {
      if (game.night.witchSaveUsed) {
        return [false, '你的解药已使用过。', ''];
      }

      if (game.night.wolfTarget !== seat) {
        return [false, '本夜该座号不是被狼人袭击目标，不能使用解药。', ''];
      }

      game.night.witchSaveUsed = true;
      game.night.witchSaveTarget = seat;
      pushLog(game, `女巫 ${player.seat}.${player.name} 使用解药救下 ${seat}号。`);
      return [true, `你使用了解药救下 ${seat}号。`, advanceNightStep(game)];
    }

    if (action === '毒') {
      if (game.night.witchPoisonUsed) {
        return [false, '你的毒药已使用过。', ''];
      }

      game.night.witchPoisonUsed = true;
      game.night.witchPoisonTarget = seat;
      pushLog(game, `女巫 ${player.seat}.${player.name} 使用毒药，目标 ${seat}号。`);
      return [true, `你对 ${seat}号 使用了毒药。`, advanceNightStep(game)];
    }

    return [false, '女巫行动只支持“救”“毒”“跳过”。', ''];
  }

  const seat = parseSeat(args[0]);
  if (!seat) {
    return [false, '行动格式：.狼人杀 行动 座号', ''];
  }

  const [ok, err] = seatExistsAndAlive(game, seat);
  if (!ok) {
    return [false, err, ''];
  }

  if (role === '守卫') {
    game.night.guardTarget = seat;
    pushLog(game, `守卫 ${player.seat}.${player.name} 守护了 ${seat}号。`);
    return [true, `你守护了 ${seat}号。`, advanceNightStep(game)];
  }

  if (role === '狼人') {
    game.night.wolfTarget = seat;
    pushLog(game, `狼人已提交袭击目标 ${seat}号。`);
    return [true, `本夜狼人目标已记录：${seat}号。`, advanceNightStep(game)];
  }

  if (role === '预言家') {
    game.night.seerChecked = seat;
    const target = getSeatPlayer(game, seat);
    const identity = target?.role === '狼人' ? '狼人' : '好人';
    pushLog(game, `预言家 ${player.seat}.${player.name} 查验了 ${seat}号，结果：${identity}`);
    return [true, `你查验了 ${seat}号，结果：${identity}`, advanceNightStep(game)];
  }

  return [false, '暂不支持当前行动。', ''];
}

function findPrivateActionGame(storage: StorageRoot, userId: string): WerewolfGame | undefined {
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

function formatHelp(): string {
  return [
    '狼人杀扩展命令：',
    '.狼人杀 开始 [屠边|屠城] [人数] [角色=数量...]    创建房间并设置配置',
    '.狼人杀 加入                                      加入当前房间',
    '.狼人杀 退出                                      退出未开局房间',
    '.狼人杀 开局                                      发牌并进入警长投票阶段',
    '.狼人杀 投票警长 座号                            投票警长',
    '.狼人杀 结束警长投票                              结算警长并进入夜晚',
    '.狼人杀 投票 座号                                  白天投票放逐',
    '.狼人杀 结束投票                                  结算白天投票',
    '.狼人杀 下一夜                                    白天结束后进入下一夜',
    '.狼人杀 状态                                      查看当前局状态',
    '.狼人杀 历史 [序号]                                查看历史记录',
    '.狼人杀 结束                                      强制结束当前对局',
    '私聊命令：',
    '.狼人杀 行动 座号                                  （守卫/狼人/预言家）',
    '.狼人杀 行动 救 座号 | 毒 座号 | 跳过              （女巫）',
  ].join('\n');
}

function main(): void {
  let ext = seal.ext.find(extName);
  if (!ext) {
    ext = seal.ext.new(extName, author, version);
    seal.ext.register(ext);
  }

  const werewolfCmd = seal.ext.newCmdItemInfo();
  werewolfCmd.name = '狼人杀';
  werewolfCmd.help = formatHelp();

  werewolfCmd.solve = (ctx, msg, cmdArgs) => {
    const arg1 = cmdArgs.getArgN(1);
    const ret = createRet(false);
    const storage = parseStorage(ext);

    if (!arg1 || arg1 === 'help') {
      ret.showHelp = true;
      return ret;
    }

    if (ctx.isPrivate) {
      if (arg1 !== '行动') {
        seal.replyToSender(ctx, msg, '私聊仅支持“.狼人杀 行动 ...”');
        return ret;
      }

      const game = findPrivateActionGame(storage, ctx.player.userId);
      if (!game) {
        seal.replyToSender(ctx, msg, '未找到你可执行行动的夜晚对局。');
        return ret;
      }

      const args = cmdArgs.args.slice(2);
      const [ok, privateMsg, groupMsg] = handleNightActionPrivate(game, ctx.player.userId, args);
      if (!ok) {
        seal.replyToSender(ctx, msg, privateMsg);
        return ret;
      }

      writeGame(storage, game);
      saveStorage(ext, storage);
      seal.replyToSender(ctx, msg, privateMsg);
      if (groupMsg) {
        seal.replyGroup(ctx, msg, `[狼人杀] ${groupMsg}`);
      }
      return ret;
    }

    const groupId = ctx.group.groupId;
    const userId = ctx.player.userId;
    const game = readGame(storage, groupId);

    switch (arg1) {
      case '开始': {
        if (game && game.phase !== 'ended') {
          seal.replyToSender(ctx, msg, '本群已有进行中的对局，请先“.狼人杀 结束”或完成当前对局。');
          return ret;
        }

        const newGame: WerewolfGame = {
          groupId,
          groupName: ctx.group.groupName,
          hostUserId: userId,
          config: cloneDefaultConfig(),
          phase: 'lobby',
          players: [],
          sheriffVotes: {},
          dayVotes: {},
          logs: [],
          createdAt: nowUnixTimestamp(),
        };

        const args = cmdArgs.args.slice(2);
        const [ok, parseMsg] = parseConfigArgs(newGame, args);
        if (!ok) {
          seal.replyToSender(ctx, msg, parseMsg);
          return ret;
        }

        const host: PlayerState = {
          userId,
          name: ctx.player.name,
          seat: 1,
          alive: true,
        };
        newGame.players.push(host);
        pushLog(newGame, `${host.name} 创建了对局，模式 ${newGame.config.mode}。`);
        writeGame(storage, newGame);
        saveStorage(ext, storage);
        seal.replyToSender(
          ctx,
          msg,
          `[狼人杀] 已创建对局。模式：${newGame.config.mode}，人数：${newGame.config.playerCount}，角色：${summarizeRoles(newGame.config)}。\n当前玩家：1.${host.name}。其他玩家请使用“.狼人杀 加入”。`,
        );
        return ret;
      }
      case '加入': {
        if (!game) {
          seal.replyToSender(ctx, msg, '本群暂无对局，请先使用“.狼人杀 开始”。');
          return ret;
        }

        if (game.phase !== 'lobby') {
          seal.replyToSender(ctx, msg, '当前已开局，不能再加入。');
          return ret;
        }

        if (getPlayer(game, userId)) {
          seal.replyToSender(ctx, msg, '你已经在本局中。');
          return ret;
        }

        if (game.players.length >= game.config.playerCount) {
          seal.replyToSender(ctx, msg, '人数已满，主持人可直接“.狼人杀 开局”。');
          return ret;
        }

        const seat = game.players.length + 1;
        game.players.push({
          userId,
          name: ctx.player.name,
          seat,
          alive: true,
        });
        pushLog(game, `${seat}.${ctx.player.name} 加入了游戏。`);
        writeGame(storage, game);
        saveStorage(ext, storage);
        seal.replyToSender(
          ctx,
          msg,
          `[狼人杀] ${seat}.${ctx.player.name} 加入成功，当前人数 ${game.players.length}/${game.config.playerCount}。`,
        );
        return ret;
      }
      case '退出': {
        if (!game) {
          seal.replyToSender(ctx, msg, '本群暂无对局。');
          return ret;
        }

        if (game.phase !== 'lobby') {
          seal.replyToSender(ctx, msg, '已开局后不可退出。');
          return ret;
        }

        const player = getPlayer(game, userId);
        if (!player) {
          seal.replyToSender(ctx, msg, '你不在当前对局中。');
          return ret;
        }

        game.players = game.players.filter((item) => item.userId !== userId);
        game.players.forEach((item, index) => {
          item.seat = index + 1;
        });

        if (game.players.length <= 0) {
          removeGame(storage, groupId);
          saveStorage(ext, storage);
          seal.replyToSender(ctx, msg, '[狼人杀] 对局无人，已自动解散。');
          return ret;
        }

        if (game.hostUserId === userId) {
          game.hostUserId = game.players[0].userId;
        }

        pushLog(game, `${ctx.player.name} 退出了对局。`);
        writeGame(storage, game);
        saveStorage(ext, storage);
        seal.replyToSender(ctx, msg, '[狼人杀] 你已退出当前对局。');
        return ret;
      }
      case '开局': {
        if (!game) {
          seal.replyToSender(ctx, msg, '本群暂无对局。');
          return ret;
        }

        if (userId !== game.hostUserId) {
          seal.replyToSender(ctx, msg, '只有主持人可开局。');
          return ret;
        }

        if (game.phase !== 'lobby') {
          seal.replyToSender(ctx, msg, '当前阶段不可开局。');
          return ret;
        }

        const [ok, err] = canStartGame(game);
        if (!ok) {
          seal.replyToSender(ctx, msg, err);
          return ret;
        }

        const rolePool = shuffle(buildRolePool(game.config));
        game.players.forEach((item, index) => {
          item.role = rolePool[index];
        });

        game.phase = 'sheriff';
        game.sheriffVotes = {};
        game.dayVotes = {};
        pushLog(game, '游戏开局，进入警长投票阶段。');
        writeGame(storage, game);
        saveStorage(ext, storage);

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
            .join('、')}。\n请使用“.狼人杀 投票警长 座号”投票，主持人使用“.狼人杀 结束警长投票”结算。`,
        );
        return ret;
      }
      case '投票警长': {
        if (!game || game.phase !== 'sheriff') {
          seal.replyToSender(ctx, msg, '当前不是警长投票阶段。');
          return ret;
        }

        const player = getPlayer(game, userId);
        if (!player || !player.alive) {
          seal.replyToSender(ctx, msg, '你不是存活玩家，不能投票。');
          return ret;
        }

        const seat = parseSeat(cmdArgs.getArgN(2));
        if (!seat) {
          seal.replyToSender(ctx, msg, '用法：.狼人杀 投票警长 座号');
          return ret;
        }

        const [ok, err] = seatExistsAndAlive(game, seat);
        if (!ok) {
          seal.replyToSender(ctx, msg, err);
          return ret;
        }

        game.sheriffVotes[userId] = seat;
        pushLog(game, `${player.seat}.${player.name} 投票警长给 ${seat}号。`);
        writeGame(storage, game);
        saveStorage(ext, storage);
        seal.replyToSender(ctx, msg, `[狼人杀] 你已投票给 ${seat}号。`);
        return ret;
      }
      case '结束警长投票': {
        if (!game || game.phase !== 'sheriff') {
          seal.replyToSender(ctx, msg, '当前不是警长投票阶段。');
          return ret;
        }

        if (userId !== game.hostUserId) {
          seal.replyToSender(ctx, msg, '只有主持人可结束警长投票。');
          return ret;
        }

        const [seat, tie] = tallyVotes(game.sheriffVotes);
        if (!seat || tie) {
          game.sheriffSeat = undefined;
          pushLog(game, '警长投票平票或无人投票，本局无警长。');
        } else {
          game.sheriffSeat = seat;
          pushLog(game, `警长选举完成，${seat}号当选警长。`);
        }

        const prompt = initNight(game);
        writeGame(storage, game);
        saveStorage(ext, storage);
        const sheriffText = game.sheriffSeat ? `${game.sheriffSeat}号当选警长。` : '本局无警长。';
        seal.replyToSender(ctx, msg, `[狼人杀] 警长投票结束，${sheriffText}\n${prompt}`);
        return ret;
      }
      case '投票': {
        if (!game || game.phase !== 'day') {
          seal.replyToSender(ctx, msg, '当前不是白天投票阶段。');
          return ret;
        }

        const player = getPlayer(game, userId);
        if (!player || !player.alive) {
          seal.replyToSender(ctx, msg, '你不是存活玩家，不能投票。');
          return ret;
        }

        const seat = parseSeat(cmdArgs.getArgN(2));
        if (!seat) {
          seal.replyToSender(ctx, msg, '用法：.狼人杀 投票 座号');
          return ret;
        }

        const [ok, err] = seatExistsAndAlive(game, seat);
        if (!ok) {
          seal.replyToSender(ctx, msg, err);
          return ret;
        }

        game.dayVotes[userId] = seat;
        pushLog(game, `${player.seat}.${player.name} 放逐票投给 ${seat}号。`);
        writeGame(storage, game);
        saveStorage(ext, storage);
        seal.replyToSender(ctx, msg, `[狼人杀] 你已投票给 ${seat}号。`);
        return ret;
      }
      case '结束投票': {
        if (!game || game.phase !== 'day') {
          seal.replyToSender(ctx, msg, '当前不是白天投票阶段。');
          return ret;
        }

        if (userId !== game.hostUserId) {
          seal.replyToSender(ctx, msg, '只有主持人可结束投票。');
          return ret;
        }

        const [seat, tie] = tallyVotes(game.dayVotes);
        if (seat && !tie) {
          const dead = killSeat(game, seat, '白天放逐');
          if (dead) {
            pushLog(game, `${dead} 被白天放逐。`);
          }
        } else {
          pushLog(game, '白天投票平票或无人投票，无人被放逐。');
        }

        const winner = judgeWinner(game);
        let resultText = seat && !tie ? `${seat}号被放逐。` : '平票或无人投票，本轮无人出局。';
        if (winner) {
          resultText = `${resultText}\n${endGame(game, winner)}`;
        } else {
          resultText = `${resultText}\n白天阶段结束，主持人可使用“.狼人杀 下一夜”进入下一夜。`;
        }

        writeGame(storage, game);
        saveStorage(ext, storage);
        seal.replyToSender(ctx, msg, `[狼人杀] ${resultText}`);
        return ret;
      }
      case '下一夜': {
        if (!game) {
          seal.replyToSender(ctx, msg, '本群暂无对局。');
          return ret;
        }

        if (userId !== game.hostUserId) {
          seal.replyToSender(ctx, msg, '只有主持人可推进阶段。');
          return ret;
        }

        if (game.phase !== 'day') {
          seal.replyToSender(ctx, msg, '仅白天阶段可进入下一夜。');
          return ret;
        }

        const winner = judgeWinner(game);
        if (winner) {
          const text = endGame(game, winner);
          writeGame(storage, game);
          saveStorage(ext, storage);
          seal.replyToSender(ctx, msg, `[狼人杀] ${text}`);
          return ret;
        }

        const prompt = initNight(game);
        writeGame(storage, game);
        saveStorage(ext, storage);
        seal.replyToSender(ctx, msg, `[狼人杀] ${prompt}`);
        return ret;
      }
      case '状态': {
        if (!game) {
          seal.replyToSender(ctx, msg, '本群暂无对局。');
          return ret;
        }

        seal.replyToSender(ctx, msg, `[狼人杀]\n${renderStatus(game)}`);
        return ret;
      }
      case '结束': {
        if (!game) {
          seal.replyToSender(ctx, msg, '本群暂无对局。');
          return ret;
        }

        if (userId !== game.hostUserId && ctx.privilegeLevel < 50) {
          seal.replyToSender(ctx, msg, '只有主持人或管理员可结束对局。');
          return ret;
        }

        const winner = game.winner ?? '已终止';
        if (game.phase !== 'ended') {
          game.phase = 'ended';
          game.winner = winner;
          game.endedAt = nowUnixTimestamp();
          pushLog(game, '对局被手动结束。');
        }

        persistFinishedGame(storage, game);
        removeGame(storage, groupId);
        saveStorage(ext, storage);
        seal.replyToSender(ctx, msg, '[狼人杀] 当前对局已结束并归档。');
        return ret;
      }
      case '历史': {
        const histories = storage.histories[groupId] ?? [];
        if (histories.length <= 0) {
          seal.replyToSender(ctx, msg, '[狼人杀] 暂无历史记录。');
          return ret;
        }

        const index = parseSeat(cmdArgs.getArgN(2));
        if (!index) {
          const text = histories
            .map((item, i) => {
              return [
                `${i + 1}.`,
                `  模式：${item.mode}`,
                `  胜者：${item.winner}`,
                `  夜晚轮数：${item.rounds}`,
                `  结束时间：${new Date(item.endedAt * 1000).toLocaleString('zh-CN', { hour12: false, timeZone: TIME_ZONE })}`,
              ].join('\n');
            })
            .join('\n');
          seal.replyToSender(ctx, msg, `[狼人杀] 历史列表：\n${text}\n使用“.狼人杀 历史 序号”查看详情。`);
          return ret;
        }

        const target = histories[index - 1];
        if (!target) {
          seal.replyToSender(ctx, msg, '[狼人杀] 历史序号不存在。');
          return ret;
        }

        seal.replyToSender(ctx, msg, `[狼人杀] 第${index}局详情：\n${target.summary.join('\n')}`);
        return ret;
      }
      default: {
        seal.replyToSender(ctx, msg, `未知命令：${arg1}，可用“.狼人杀 help”查看帮助。`);
        return ret;
      }
    }
  };

  ext.cmdMap.狼人杀 = werewolfCmd;
}

main();
