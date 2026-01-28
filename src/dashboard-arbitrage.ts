/**
 * VibeCurve Pro Dashboard - 套利版
 * 集成跨 DEX 套利系统
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { simulator } from './core/simulator';
import { sendTgAlert } from './utils/notifier';
import { getAiComment } from './core/ai';
import { ArbitrageSystem } from './core/arbitrageSystem';
import { GlobalScanner } from './listeners/scanner';
import { createLogger } from './utils/logger';

const logger = createLogger('DashboardArbitrage');

const TARGET_MINT = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump');
const TARGET_NAME = "Chill Guy (Demo)";

// 1. 初始化屏幕
const screen = blessed.screen({ smartCSR: true, fullUnicode: true, title: 'VIBE CURVE PRO - ARBITRAGE EDITION' });
const grid = new contrib.grid({rows: 15, cols: 15, screen: screen});

// === 组件布局 ===
const priceLine = grid.set(0, 0, 5, 8, contrib.line, {
  style: { line: "yellow", text: "green", baseline: "black" },
  xLabelPadding: 3, xPadding: 5, showLegend: true, legend: { width: 12 },
  label: ` Price: ${TARGET_NAME} `
});

const logBox = grid.set(5, 0, 6, 8, contrib.log, {
  fg: "green", selectedFg: "green", label: ' Activity Feed ', tags: true, bufferLength: 100
});

const arbBox = grid.set(11, 0, 4, 8, contrib.table, {
  fg: "cyan", selectedFg: "cyan", label: ' Arbitrage Opportunities ', columnSpacing: 3,
  columns: ['Token', 'Buy', 'Sell', 'Profit%']
});

const statsBox = grid.set(0, 8, 4, 7, blessed.box, {
  tags: true, label: ' System Status ', style: { border: { fg: 'magenta' }, fg: 'white' },
  content: '{center}Initializing...{/center}'
});

const arbitrageStatsBox = grid.set(4, 8, 3, 7, blessed.box, {
  tags: true, label: ' Arbitrage Performance ', style: { border: { fg: 'cyan' }, fg: 'white' },
  content: '{center}Waiting...{/center}'
});

const pnlLine = grid.set(7, 8, 4, 7, contrib.line, {
    style: { line: "red", text: "white", baseline: "black" },
    label: ' PnL Curve ', minY: -0.5, maxY: 0.5
});

const controlBox = grid.set(11, 8, 4, 7, blessed.box, {
  tags: true, label: ' Controls ', style: { border: { fg: 'yellow' }, fg: 'white' },
  content: '{center}\n\nAuto Mode: OFF\nSimulation: ON\n\nPress SPACE to start{/center}'
});

// === 状态变量 ===
const priceHistory: number[] = [];
const timeLabels: string[] = [];
let currentPrice = 0;
let aiCommentary = "Initializing...";
let arbitrageSystem: ArbitrageSystem;
let pnlHistory: number[] = [0];
let isRunning = false;

// === UI 更新函数 ===

function updatePriceChart(price: number) {
    currentPrice = price;
    priceHistory.push(price);
    const now = new Date();
    timeLabels.push(`${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`);

    if (priceHistory.length > 20) {
        priceHistory.shift();
        timeLabels.shift();
    }

    priceLine.setData([{ title: 'Price', x: timeLabels, y: priceHistory }]);
    screen.render();
}

function updateStatsPanel(mode: string, sim: string) {
    statsBox.setContent(
        `{center}{bold}SYSTEM STATUS{/bold}\n\n` +
        `Target: ${TARGET_NAME}\n` +
        `Price: ${currentPrice.toFixed(8)} SOL\n\n` +
        `Auto Mode: ${mode}\n` +
        `Simulation: ${sim}\n\n` +
        `{magenta-fg}--- AI INTEL ---{/magenta-fg}\n` +
        `${aiCommentary}\n` +
        `{/center}`
    );
    screen.render();
}

function updateArbitrageStats() {
    if (!arbitrageSystem) return;

    const stats = arbitrageSystem.getStats();

    arbitrageStatsBox.setContent(
        `{center}{bold}ARBITRAGE STATS{/bold}\n\n` +
        `Total Executions: ${stats.performance.totalExecutions}\n` +
        `Success Rate: ${(stats.performance.successRate * 100).toFixed(1)}%\n` +
        `Total Profit: ${stats.performance.totalProfit.toFixed(6)} SOL\n` +
        `Total Loss: ${stats.performance.totalLoss.toFixed(6)} SOL\n` +
        `Net Profit: {bold}${stats.performance.netProfit >= 0 ? 'green-fg' : 'red-fg'}${stats.performance.netProfit.toFixed(6)} SOL{/bold}\n` +
        `Avg Time: ${stats.performance.avgExecutionTime.toFixed(0)}ms\n` +
        `Scanning Tokens: ${stats.system.tokensScanning}{/center}`
    );
    screen.render();
}

function updateArbitrageTable(opportunities: any[]) {
    const tableData = opportunities.slice(0, 5).map(opp => [
        opp.tokenSymbol,
        opp.buyDex,
        opp.sellDex,
        opp.priceDiff.toFixed(2) + '%'
    ]);

    arbBox.setData({ headers: ['Token', 'Buy', 'Sell', 'Profit%'], data: tableData });
    screen.render();
}

function updatePnlChart(pnl: number) {
    pnlHistory.push(pnl);
    if (pnlHistory.length > 30) pnlHistory.shift();

    pnlLine.setData([{
        title: 'Cumulative PnL (SOL)',
        x: pnlHistory.map((_, i) => i.toString()),
        y: pnlHistory
    }]);
    screen.render();
}

function updateControlBox() {
    const autoStatus = isRunning ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}';
    const simStatus = arbitrageSystem && arbitrageSystem.getConfig().simulationMode
        ? '{yellow-fg}ON{/yellow-fg}'
        : '{red-fg}OFF{/red-fg}';

    controlBox.setContent(
        `{center}\n` +
        `Auto Arbitrage: ${autoStatus}\n` +
        `Simulation Mode: ${simStatus}\n\n` +
        `[SPACE] Toggle Auto\n` +
        `[M] Toggle Simulation\n` +
        `[S] Manual Scan\n` +
        `[Q] Quit{/center}`
    );
    screen.render();
}

// === 事件处理 ===

function handleArbitrageOpportunity(opp: any) {
    logBox.log(`{cyan-fg}[ARBITRAGE] ${opp.tokenSymbol}: ${opp.buyDex} -> ${opp.sellDex} | +${opp.priceDiff.toFixed(2)}%{/cyan-fg}`);
    logBox.log(`  Estimated Profit: ${opp.estimatedProfit.toFixed(4)} SOL | Liquidity: ${opp.liquidity.toFixed(1)} SOL`);

    // 更新表格
    updateArbitrageTable([opp]);

    // 发送 Telegram 通知
    sendTgAlert(
        `💰 <b>套利机会</b>\n` +
        `代币: ${opp.tokenSymbol}\n` +
        `路径: ${opp.buyDex} -> ${opp.sellDex}\n` +
        `利润: <b>${opp.priceDiff.toFixed(2)}%</b>\n` +
        `流动性: ${opp.liquidity.toFixed(2)} SOL\n` +
        `置信度: ${opp.confidence}`
    );
}

function handleArbitrageResult(result: any) {
    if (result.success) {
        logBox.log(`{green-fg}[EXECUTED] Profit: ${result.netProfit.toFixed(6)} SOL | Time: ${result.executionTime}ms{/green-fg}`);
        updatePnlChart(result.netProfit);
    } else {
        logBox.log(`{red-fg}[FAILED] ${result.error}{/red-fg}`);
    }

    // 更新统计
    updateArbitrageStats();
}

// === 主程序 ===

async function startArbitrageDashboard() {
    logBox.log('{green-fg}🚀 Initializing VibeCurve Pro (Arbitrage Edition)...{/green-fg}');

    // 初始化 AI
    getAiComment('intro', TARGET_NAME).then(res => aiCommentary = res);

    // 初始化套利系统
    logBox.log('Initializing arbitrage system...');

    arbitrageSystem = new ArbitrageSystem(
        new Connection(config.rpcUrl),
        config.payer,
        {
            scanInterval: 15000,      // 15 秒扫描
            minProfitPercent: 0.3,    // 0.3% 最小利润
            minLiquidity: 10,         // 10 SOL
            tradeAmount: 0.01,        // 0.01 SOL
            simulationMode: true,     // 模拟模式
            autoExecute: false,       // 不自动执行
            alertOnly: true,          // 仅通知
            tokensToScan: [
                { mint: TARGET_MINT.toBase58(), symbol: TARGET_NAME },
            ]
        }
    );

    // 设置回调
    arbitrageSystem.on('opportunity', handleArbitrageOpportunity);
    arbitrageSystem.on('executed', handleArbitrageResult);

    logBox.log('{green-fg}✓ Arbitrage system ready{/green-fg}');

    // 启动全球扫描器
    logBox.log('Starting global scanner...');
    const scanner = new GlobalScanner(new Connection(config.rpcUrl));
    scanner.start();

    // 初始 UI 更新
    updateStatsPanel('OFF', 'ON');
    updateArbitrageStats();
    updateControlBox();

    // 键盘事件
    screen.key(['space'], () => {
        if (!isRunning) {
            logBox.log('{yellow-fg}[SYSTEM] Starting arbitrage system...{/yellow-fg}');
            arbitrageSystem.start();
            isRunning = true;
            updateStatsPanel('ON', arbitrageSystem.getConfig().simulationMode ? 'ON' : 'OFF');
        } else {
            logBox.log('{yellow-fg}[SYSTEM] Stopping arbitrage system...{/yellow-fg}');
            arbitrageSystem.stop();
            isRunning = false;
            updateStatsPanel('OFF', arbitrageSystem.getConfig().simulationMode ? 'ON' : 'OFF');
        }
        updateControlBox();
    });

    screen.key(['m', 'M'], () => {
        if (arbitrageSystem) {
            const currentMode = arbitrageSystem.getConfig().simulationMode;
            arbitrageSystem.updateConfig({ simulationMode: !currentMode });
            const newMode = !currentMode ? 'ON' : 'OFF';
            logBox.log(`{yellow-fg}[SYSTEM] Simulation mode: ${newMode}{/yellow-fg}`);
            updateStatsPanel(isRunning ? 'ON' : 'OFF', newMode);
            updateControlBox();
        }
    });

    screen.key(['s', 'S'], async () => {
        logBox.log('{yellow-fg}[SYSTEM] Manual scan triggered...{/yellow-fg}');
        const opportunities = await arbitrageSystem.manualScan();
        logBox.log(`{cyan-fg}[SCAN] Found ${opportunities.length} opportunities{/cyan-fg}`);

        if (opportunities.length > 0) {
            updateArbitrageTable(opportunities);
        }
    });

    screen.key(['escape', 'q', 'Q', 'C-c'], () => {
        if (isRunning) arbitrageSystem.stop();
        process.exit(0);
    });

    logBox.log('{green-fg}✓ All systems online{/green-fg}');
    logBox.log('');
    logBox.log('{bold}Controls:{/bold}');
    logBox.log('  [SPACE] - Start/Stop arbitrage system');
    logBox.log('  [M]     - Toggle simulation mode');
    logBox.log('  [S]     - Manual scan');
    logBox.log('  [Q]     - Quit');
    logBox.log('');
    logBox.log('{yellow-fg}System is ready. Press SPACE to start arbitrage.{/yellow-fg}');

    screen.render();
}

// 启动
startArbitrageDashboard().catch((error) => {
  logger.error('Failed to start arbitrage dashboard', error);
});
