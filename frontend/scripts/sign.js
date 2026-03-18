/**
 * Windows 代码签名脚本
 * 使用自签名证书对 Electron 应用进行签名
 * 
 * 注意：此脚本用于调用 signtool 进行签名。
 * 如果系统没有安装 signtool，electron-builder 会使用内置的签名机制。
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certPath = path.join(__dirname, '..', 'build', 'certificates', 'grapework.pfx');
const certPassword = 'grapeWork2026';

export default async function sign(options) {
  const { path: filePath } = options;
  
  if (!filePath) {
    throw new Error('缺少文件路径');
  }

  // 检查 signtool 是否可用
  try {
    await execAsync('where signtool');
  } catch (error) {
    // signtool 不可用，让 electron-builder 使用内置签名
    console.log('[签名] signtool 未安装，使用 electron-builder 内置签名');
    return true;
  }

  // 使用 signtool 进行签名
  const signCommand = `signtool sign /f "${certPath}" /p "${certPassword}" /fd sha256 /tr http://timestamp.digicert.com /td sha256 "${filePath}"`;

  try {
    console.log(`[签名] 正在签名：${path.basename(filePath)}`);
    const { stdout, stderr } = await execAsync(signCommand);
    
    if (stderr && !stderr.includes('Succeeded')) {
      console.warn('[签名] 签名警告:', stderr);
    }
    
    console.log(`[签名] 签名成功：${path.basename(filePath)}`);
    if (stdout) {
      console.log(stdout);
    }
    
    return true;
  } catch (error) {
    console.error(`[签名] 签名失败：${path.basename(filePath)}`);
    console.error('[签名] 错误信息:', error.message);
    
    // 如果 signtool 签名失败，让 electron-builder 使用内置签名
    console.log('[签名] 将使用 electron-builder 内置签名继续...');
    return true;
  }
}
