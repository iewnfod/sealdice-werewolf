import pkg from "../package.json";

const extName = "狼人杀";
const author = "Iewnfod";
const version = pkg.version;

function main() {
  // 注册扩展
  let ext = seal.ext.find(extName);
  if (!ext) {
    ext = seal.ext.new(extName, author, version);
    seal.ext.register(ext);
  }

  // 编写指令
  const werewolfCmd = seal.ext.newCmdItemInfo();
  werewolfCmd.name = '狼人杀';
  werewolfCmd.help = [].join("\n");

  werewolfCmd.solve = (ctx, msg, cmdArgs) => {
    let arg1 = cmdArgs.getArgN(1);

    switch (arg1) {
      case 'help': {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
      }
      default: {
        seal.replyToSender(ctx, msg, `未知命令：${arg1}`);
        return seal.ext.newCmdExecuteResult(true);
      }
    }
  }

  // 注册命令
  ext.cmdMap['狼人杀'] = werewolfCmd;
}

main();
