import { Connection } from '@solana/web3.js';
import { config } from './config';
// import { startPumpListener } from './listeners/pump'; // 注释掉这个
import { startSniperListener } from './listeners/sniper'; // <--- 引入这个
import { createLogger } from './utils/logger';

const logger = createLogger('Index');

async function main() {
  logger.info('Starting VibeCurve Bot...');

  const connection = new Connection(config.rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: config.wssUrl
  });

  const version = await connection.getVersion();
  logger.info(`Connected to Solana Node: ${version['solana-core']}`);

  // 启动狙击模式
  await startSniperListener(connection);

  logger.info('Bot is running. Sniper Scope is open.');

  await new Promise(_ => {});
}

main().catch((error) => {
  logger.error('Failed to start', error);
});