const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const filePath = path.join(__dirname, '..', 'header.txt');

try {
  // 读取文件内容
  let content = fs.readFileSync(filePath, 'utf8');

  // 获取当前 Unix 时间戳（秒）
  const timestamp = Math.floor(Date.now() / 1000);

  // 正则匹配 @timestamp 行，并替换为新的时间戳
  // 支持格式：// @timestamp    1772169212  （空格数量可变）
  content = content.replace(
    /^(\s*\/\/\s*@timestamp\s+)\d+/m,
    `$1${timestamp}`
  );

  content = content.replace(
    /^(\s*\/\/\s*@version\s+)[\d\.]+/m,
    `$1${pkg.version}`
  );

  // 写入文件
  fs.writeFileSync(filePath, content, 'utf8');

  console.log(`✅ @timestamp 已更新为 ${timestamp}`);
  console.log(`✅ @version 已更新为 ${pkg.version}`);
} catch (err) {
  console.error('❌ 更新失败:', err);
  process.exit(1);
}
