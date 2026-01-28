/**
 * 真实数据版本的 Dashboard
 * 替换掉所有 Math.random() 为真实链上数据
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { simulator } from './core/simulator';
import { sendTgAlert } from './utils/notifier';
import { getAiComment } from './core/ai';
import { GlobalScanner } from './listeners/scanner';
import { SmartListener } from './listeners/smartListener'; // 新的智能监听器
import { createLogger } from './utils/logger';

const logger = createLogger('DashboardReal');

const TARGET_MINT = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump');
const TARGET_NAME = "Chill Guy (Demo)";

// 1. 初始化屏幕
const screen = blessed.screen({ smartCSR: true, fullUnicode: true, title: 'VIBE CURVE PRO - REAL DATA' });
const grid = new contrib.grid({rows: 12, cols: 12, screen: screen});

// === 组件 ===
const priceLine = grid.set(0, 0, 6, 8, contrib.line, {
  style: { line: "yellow", text: "green", baseline: "black" },
  xLabelPadding: 3, xPadding: 5, showLegend: true, legend: { width: 12 },
  label: ` Price: ${TARGET_NAME} (REAL) `
});

const logBox = grid.set(6, 0, 6, 8, contrib.log, {
  fg: "green", selectedFg: "green", label: ' Transaction & Scanner Feed ', tags: true, bufferLength: 50
});

const statsBox = grid.set(0, 8, 5, 4, blessed.box, {
  tags: true, label: ' AI Analyst ', style: { border: { fg: 'magenta' }, fg: 'white' },
  content: '{center}\n\nLoading...{/center}'
});

const jitoBox = grid.set(5, 8, 2, 4, contrib.donut, {
  label: ' MEV ', radius: 8, arcWidth: 3, remainColor: 'black', yPadding: 2,
  data: [{percent: 100, label: 'Active', color: 'green'}]
});

const pnlLine = grid.set(7, 8, 5, 4, contrib.line, {
    style: { line: "red", text: "white", baseline: "black" },
    label: ' PnL ', minY: -0.1, maxY: 0.1
});

// === 状态 ===
const priceHistory: number[] = [];
const timeLabels: string[] = [];
let currentPrice = 0;
let aiCommentary = "Initializing...";
let lastAiUpdate = 0;
let consecutiveBuys = 0;

/**
 * 更新价格图表（使用真实数据）
 */
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

/**
 * 更新统计面板
 */
function updateStatsPanel(status: string, trend: string) {
    statsBox.setContent(
        `{center}\n` +
        `Target: ${TARGET_NAME}\n` +
        `Price: ${currentPrice.toFixed(8)}\n` +
        `Trend: ${trend}\n\n` +
        `${status}\n\n` +
        `{magenta-fg}--- AI INTEL ---{/magenta-fg}\n` +
        `${aiCommentary}\n` +
        `{/center}`
    );
    screen.render();
}

/**
 * 触发 AI 评论
 */
function triggerAiComment(type: 'pump' | 'dump') {
    const now = Date.now();
    if (now - lastAiUpdate < 5000) return;
    lastAiUpdate = now;

    getAiComment(type, TARGET_NAME).then(comment => {
        aiCommentary = comment;
        if (type === 'pump') {
            logBox.log(`{magenta-fg}${comment}{/magenta-fg}`);
        } else {
            logBox.log(`{blue-fg}${comment}{/blue-fg}`);
        }
    });
}

/**
 * 处理真实交易事件
 */
function handleTrade(trade: any) {
    const isBuy = trade.type === 'buy';

    if (isBuy) {
        logBox.log(`{green-fg}[BUY ] | ${trade.amount.toFixed(2)} Tokens | ${trade.price.toFixed(8)} SOL{/green-fg}`);
        consecutiveBuys++;

        if (consecutiveBuys >= 3) {
            triggerAiComment('pump');
            const msg = simulator.buy(currentPrice, 0.1);
            if (msg) {
                logBox.log(`{cyan-fg}${msg}{/cyan-fg}`);
                sendTgAlert(`🟢 <b>BUY</b>: ${currentPrice.toFixed(8)}\n${aiCommentary}`);
            }
        }
    } else {
        logBox.log(`{red-fg}[SELL] | ${trade.amount.toFixed(2)} Tokens | ${trade.price.toFixed(8)} SOL{/red-fg}`);
        consecutiveBuys = 0;

        triggerAiComment('dump');
        const msg = simulator.sell(currentPrice);
        if (msg) {
            logBox.log(`{yellow-fg}${msg}{/yellow-fg}`);
            sendTgAlert(`🔴 <b>SELL</b>: ${currentPrice.toFixed(8)}\n${aiCommentary}`);
        }
    }

    const status = simulator.getStatus(currentPrice);
    const trend = consecutiveBuys > 0 ? '{green-fg}BULL{/}' : '{red-fg}BEAR{/}';
    updateStatsPanel(status, trend);
}

/**
 * 启动真实数据 Dashboard
 */
async function startRealDataDashboard() {
    logBox.log('Initializing VibeCurve Pro...');
    logBox.log('Loading real-time market data...');

    // 启动全球扫描器
    const scanner = new GlobalScanner(new Connection(config.rpcUrl));
    scanner.start();

    // 初始化 AI
    getAiComment('intro', TARGET_NAME).then(res => aiCommentary = res);

    // 🔥 创建智能监听器（核心改进）
    const smartListener = new SmartListener({
        targetMint: TARGET_MINT,
        rpcUrl: config.rpcUrl,
        pollInterval: 3000,
        onTrade: handleTrade, // 真实交易回调
        onPriceUpdate: (price, trend) => {
            updatePriceChart(price);
            logBox.log(`{cyan-fg}Price Update: ${price.toFixed(8)} SOL (${trend}){/cyan-fg}`);
        }
    });

    // 启动监听
    await smartListener.start();

    logBox.log('{green-fg}✓ System Online - Using REAL chain data{/green-fg}');
    sendTgAlert(`🌊 <b>VibeCurve Online</b>\nTarget: ${TARGET_NAME}\nMode: REAL DATA`);

    // 键盘事件
    screen.key(['escape', 'q', 'C-c'], () => {
        smartListener.stop();
        process.exit(0);
    });
}

// 启动
startRealDataDashboard().catch((error) => {
  logger.error('Failed to start real data dashboard', error);
});
