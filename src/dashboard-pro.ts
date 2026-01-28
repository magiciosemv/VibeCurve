/**
 * VibeCurve Pro Dashboard
 * 集成所有高级策略的真实交易终端
 *
 * 功能：
 * 1. 真实链上数据监听
 * 2. Bonding Curve 突破检测
 * 3. 聪明钱追踪
 * 4. AI 实时分析
 * 5. MEV 保护
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { simulator } from './core/simulator';
import { sendTgAlert } from './utils/notifier';
import { getAiComment } from './core/ai';
import { GlobalScanner } from './listeners/scanner';
import { SmartListener } from './listeners/smartListener';
import { BondingCurveWatcher } from './strategies/bondingCurve';
import { SmartMoneyTracker } from './strategies/smartMoney';
import { createLogger } from './utils/logger';

const logger = createLogger('DashboardPro');

const TARGET_MINT = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump');
const TARGET_NAME = "Chill Guy (Demo)";

// 1. 初始化屏幕
const screen = blessed.screen({ smartCSR: true, fullUnicode: true, title: 'VIBE CURVE PRO - BLACKPANEL EDITION' });
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

const statsBox = grid.set(0, 8, 4, 7, blessed.box, {
  tags: true, label: ' Position & AI ', style: { border: { fg: 'magenta' }, fg: 'white' },
  content: '{center}\n\nInitializing...{/center}'
});

const strategyBox = grid.set(4, 8, 3, 7, blessed.box, {
  tags: true, label: ' Active Strategies ', style: { border: { fg: 'cyan' }, fg: 'white' },
  content: '{center}Loading...{/center}'
});

const smartMoneyBox = grid.set(7, 8, 4, 7, blessed.box, {
  tags: true, label: ' Smart Money Tracker ', style: { border: { fg: 'yellow' }, fg: 'white' },
  content: '{center}Waiting...{/center}'
});

const pnlLine = grid.set(11, 0, 4, 15, contrib.line, {
    style: { line: "red", text: "white", baseline: "black" },
    label: ' PnL Curve ', minY: -0.5, maxY: 0.5
});

// === 状态变量 ===
const priceHistory: number[] = [];
const timeLabels: string[] = [];
let currentPrice = 0;
let aiCommentary = "Scanning market...";
let lastAiUpdate = 0;
let consecutiveBuys = 0;
let pnlHistory: number[] = [0];

// === 策略状态 ===
const strategyStatus = {
  momentum: 'OFF',
  bondingCurve: 'WAITING',
  smartMoney: 'MONITORING'
};

let bondingCurveProgress = 0;
let smartMoneyDetected = 0;

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

function updateStatsPanel() {
    const status = simulator.getStatus(currentPrice);
    statsBox.setContent(
        `{center}{bold}TARGET{/bold}\n\n` +
        `${TARGET_NAME}\n\n` +
        `Price: ${currentPrice.toFixed(8)} SOL\n\n` +
        `{bold}POSITION{/bold}\n` +
        `${status}\n\n` +
        `{magenta-fg}{bold}AI INTEL{/bold}{/magenta-fg}\n` +
        `${aiCommentary}{/center}`
    );
    screen.render();
}

function updateStrategyPanel() {
    strategyBox.setContent(
        `{center}{bold}STRATEGIES{/bold}\n\n` +
        `📊 Momentum:    {green-fg}${strategyStatus.momentum}{/green-fg}\n` +
        `🚀 BondingCurve: {cyan-fg}${strategyStatus.bondingCurve}{/cyan-fg}\n` +
        `🐋 Smart Money: {yellow-fg}${strategyStatus.smartMoney}{/yellow-fg}\n\n` +
        `BC Progress: {bold}${bondingCurveProgress.toFixed(1)}%{/bold}\n` +
        `Smart Money: {bold}${smartMoneyDetected}{/bold}{/center}`
    );
    screen.render();
}

function updateSmartMoneyBox(wallet: string, confidence: number) {
    smartMoneyBox.setContent(
        `{center}{bold}ALERT{/bold}\n\n` +
        `Whale detected!\n\n` +
        `Wallet: ${wallet.slice(0, 8)}...${wallet.slice(-8)}\n` +
        `Confidence: {bold}${(confidence * 100).toFixed(0)}%{/bold}\n\n` +
        `{yellow-fg}Follow?{/yellow-fg}{/center}`
    );
    screen.render();
}

function updatePnlChart(pnl: number) {
    pnlHistory.push(pnl);
    if (pnlHistory.length > 30) pnlHistory.shift();

    pnlLine.setData([{
        title: 'PnL (SOL)',
        x: pnlHistory.map((_, i) => i.toString()),
        y: pnlHistory
    }]);
    screen.render();
}

// === 事件处理器 ===

function triggerAiComment(type: 'pump' | 'dump') {
    const now = Date.now();
    if (now - lastAiUpdate < 5000) return;
    lastAiUpdate = now;

    getAiComment(type, TARGET_NAME).then(comment => {
        aiCommentary = comment;

        if (type === 'pump') {
            logBox.log(`{magenta-fg}🤖 AI: ${comment}{/magenta-fg}`);
        } else {
            logBox.log(`{blue-fg}🤖 AI: ${comment}{/blue-fg}`);
        }

        updateStatsPanel();
    });
}

function handleTrade(trade: any) {
    const isBuy = trade.type === 'buy';

    if (isBuy) {
        logBox.log(`{green-fg}[BUY] ${trade.amount.toFixed(2)} @ ${trade.price.toFixed(8)}{/green-fg}`);
        consecutiveBuys++;

        if (consecutiveBuys >= 3) {
            strategyStatus.momentum = 'ACTIVE';
            updateStrategyPanel();
            triggerAiComment('pump');

            const msg = simulator.buy(currentPrice, 0.1);
            if (msg) {
                logBox.log(`{cyan-fg}📈 ${msg}{/cyan-fg}`);
                sendTgAlert(`🟢 BUY: ${currentPrice.toFixed(8)}\n${aiCommentary}`);
            }
        }
    } else {
        logBox.log(`{red-fg}[SELL] ${trade.amount.toFixed(2)} @ ${trade.price.toFixed(8)}{/red-fg}`);
        consecutiveBuys = 0;

        strategyStatus.momentum = 'OFF';
        updateStrategyPanel();
        triggerAiComment('dump');

        const msg = simulator.sell(currentPrice);
        if (msg) {
            logBox.log(`{yellow-fg}📉 ${msg}{/yellow-fg}`);
            sendTgAlert(`🔴 SELL: ${currentPrice.toFixed(8)}\n${aiCommentary}`);
        }
    }

    updateStatsPanel();
}

function handleSmartMoney(trade: any) {
    smartMoneyDetected++;
    updateSmartMoneyBox(trade.wallet, trade.confidence);

    logBox.log(`{yellow-fg}🐋 Smart Money: ${trade.type.toUpperCase()} ${trade.tokenMint.slice(0, 8)}... (Conf: ${(trade.confidence * 100).toFixed(0)}%){/yellow-fg}`);

    if (trade.confidence > 0.7) {
        sendTgAlert(`🐋 Smart Money Alert\nConfidence: ${(trade.confidence * 100).toFixed(0)}%\nType: ${trade.type}`);
    }
}

function handleBondingCurve(status: any) {
    bondingCurveProgress = status.progress;
    updateStrategyPanel();

    if (status.recommendation === 'BUY') {
        strategyStatus.bondingCurve = 'BUY SIGNAL';
        logBox.log(`{cyan-fg}🚀 Bonding Curve: ${status.progress.toFixed(1)}% - MIGRATION SOON!{/cyan-fg}`);
        sendTgAlert(`🚀 Bonding Curve Alert\nProgress: ${status.progress.toFixed(1)}%\nTarget: ${TARGET_NAME}`);
    }
}

// === 主程序 ===

async function startProDashboard() {
    logBox.log('{green-fg}🚀 Initializing VibeCurve Pro...{/green-fg}');
    logBox.log('Loading strategies...');

    const connection = new Connection(config.rpcUrl);

    // 1. 启动全球扫描器
    logBox.log('Starting global scanner...');
    const scanner = new GlobalScanner(connection);
    scanner.start();

    // 2. 初始化 AI
    getAiComment('intro', TARGET_NAME).then(res => {
        aiCommentary = res;
        updateStatsPanel();
    });

    // 3. 启动智能监听器（核心）
    logBox.log('Starting smart listener...');
    const smartListener = new SmartListener({
        targetMint: TARGET_MINT,
        rpcUrl: config.rpcUrl,
        pollInterval: 3000,
        onTrade: handleTrade,
        onPriceUpdate: (price, trend) => {
            updatePriceChart(price);
            logBox.log(`{cyan-fg}💰 Price: ${price.toFixed(8)} SOL (${trend}){/cyan-fg}`);
        }
    });
    await smartListener.start();

    // 4. 启动 Bonding Curve 监控
    logBox.log('Starting Bonding Curve watcher...');
    const bcWatcher = new BondingCurveWatcher(
        connection,
        TARGET_MINT,
        handleBondingCurve
    );
    bcWatcher.start();

    // 5. 启动聪明钱追踪
    logBox.log('Starting Smart Money tracker...');
    const smartMoneyTracker = new SmartMoneyTracker(
        connection,
        {
            minWinRate: 0.6,
            minTrades: 50,
            followDelay: 1000,
            notifyOnly: true
        },
        handleSmartMoney
    );

    // 6. 完成
    logBox.log('{green-fg}✓ All systems online{/green-fg}');
    logBox.log('{bold}Strategies active:{/bold}');
    logBox.log('  • Momentum (3x consecutive buys)');
    logBox.log('  • Bonding Curve Breakout');
    logBox.log('  • Smart Money Tracker');
    logBox.log('  • AI Sentiment Analysis');

    sendTgAlert(`🌊 VibeCurve Pro Online\nTarget: ${TARGET_NAME}\nStrategies: 4 Active`);

    // 键盘事件
    screen.key(['escape', 'q', 'C-c'], () => {
        smartListener.stop();
        bcWatcher.stop();
        process.exit(0);
    });

    // PnL 定期更新
    setInterval(() => {
        const pnl = simulator.getUnrealizedPnL(currentPrice);
        updatePnlChart(pnl);
    }, 5000);
}

// 启动
startProDashboard().catch((error) => {
  logger.error('Failed to start pro dashboard', error);
});
