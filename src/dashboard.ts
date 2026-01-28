import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { simulator } from './core/simulator';
import { sendTgAlert } from './utils/notifier';
import { getAiComment } from './core/ai';
import { GlobalScanner } from './listeners/scanner'; // <--- 引入扫描器
import { createLogger } from './utils/logger';

const logger = createLogger('Dashboard');

const TARGET_MINT = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump'); 
const TARGET_NAME = "Chill Guy (Demo)"; 

// 1. 初始化屏幕
const screen = blessed.screen({ smartCSR: true, fullUnicode: true, title: 'VIBE CURVE PRO' });
const grid = new contrib.grid({rows: 12, cols: 12, screen: screen});

// === 组件 ===
const priceLine = grid.set(0, 0, 6, 8, contrib.line, {
  style: { line: "yellow", text: "green", baseline: "black" },
  xLabelPadding: 3, xPadding: 5, showLegend: true, legend: { width: 12 },
  label: ` Price: ${TARGET_NAME} `
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
let mockPrice = 0.000020;
let aiCommentary = "Waiting..."; 
let lastAiUpdate = 0;

function updatePrice(isBuy: boolean, impact: number) {
    const change = isBuy ? impact : -impact;
    mockPrice = mockPrice * (1 + change);
    priceHistory.push(mockPrice);
    const now = new Date();
    timeLabels.push(`${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`);
    if (priceHistory.length > 20) { priceHistory.shift(); timeLabels.shift(); }
    priceLine.setData([{ title: 'Price', x: timeLabels, y: priceHistory }]);
}

function updateStatsPanel(status: string, trend: string) {
    statsBox.setContent(
        `{center}\n` +
        `Target: ${TARGET_NAME}\n` +
        `Price: ${mockPrice.toFixed(8)}\n` +
        `Trend: ${trend}\n\n` +
        `${status}\n\n` +
        `{magenta-fg}--- AI INTEL ---{/magenta-fg}\n` +
        `${aiCommentary}\n` + 
        `{/center}`
    );
    screen.render();
}

function triggerAiComment(type: 'pump' | 'dump') {
    const now = Date.now();
    if (now - lastAiUpdate < 5000) return; 
    lastAiUpdate = now;
    getAiComment(type, TARGET_NAME).then(comment => {
        aiCommentary = comment; 
        if (type === 'pump') logBox.log(`{magenta-fg}${comment}{/magenta-fg}`);
        else logBox.log(`{blue-fg}${comment}{/blue-fg}`);
    });
}

async function startDashboard() {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  
  // 🔥 劫持 console.log，把 Scanner 的输出重定向到 logBox
  const originalLog = console.log;
  console.log = function(msg: any) {
    if (typeof msg === 'string' && msg.includes('NEW LAUNCH')) {
        logBox.log(`{cyan-fg}${msg}{/cyan-fg}`); // 全网扫描结果用青色
    } 
    // originalLog(msg); // 可选：是否还在后台打印
  };

  logBox.log(`Connecting to Solana...`);

  // 🔥 1. 启动全网扫描器 (后台运行)
  const scanner = new GlobalScanner(connection);
  scanner.start(); // 它的 console.log 会被上面的逻辑捕获

  // 2. 启动目标监控
  sendTgAlert(`🌊 <b>System Online</b>\nTarget: ${TARGET_NAME}`);
  getAiComment('intro', TARGET_NAME).then(res => aiCommentary = res);

  let lastSignature: string | null = null;
  let consecutiveBuys = 0;

  // 主循环 (针对 TARGET_MINT)
  setInterval(async () => {
    try {
        const signatures = await connection.getSignaturesForAddress(TARGET_MINT, { limit: 3 });
        if (signatures.length === 0) return;
        const newest = signatures[0];
        if (newest.signature === lastSignature) return;
        
        const newSigs = [];
        for (const tx of signatures) {
            if (tx.signature === lastSignature) break;
            newSigs.push(tx.signature);
        }
        lastSignature = newest.signature;

        for (const sig of newSigs) {
             const isErr = newest.err !== null;
             if (isErr) continue;

             const isBuy = Math.random() > 0.45; 
             const amount = Math.floor(Math.random() * 50000) + 1000;

             if (isBuy) {
                 logBox.log(`{green-fg}[BUY ] | ${amount} Tokens{/green-fg}`);
                 updatePrice(true, 0.005);
                 consecutiveBuys++;
                 
                 if (consecutiveBuys >= 3) {
                    triggerAiComment('pump');
                    const msg = simulator.buy(mockPrice, 0.1);
                    if(msg) {
                        logBox.log(`{cyan-fg}${msg}{/cyan-fg}`);
                        sendTgAlert(`🟢 <b>BUY</b>: ${mockPrice.toFixed(8)}\n${aiCommentary}`);
                    }
                 }

             } else {
                 logBox.log(`{red-fg}[SELL] | ${amount} Tokens{/red-fg}`);
                 updatePrice(false, 0.008);
                 consecutiveBuys = 0;
                 
                 triggerAiComment('dump');
                 const msg = simulator.sell(mockPrice);
                 if(msg) {
                     logBox.log(`{yellow-fg}${msg}{/yellow-fg}`);
                     sendTgAlert(`🔴 <b>SELL</b>: ${mockPrice.toFixed(8)}\n${aiCommentary}`);
                 }
             }
        }

        const status = simulator.getStatus(mockPrice);
        const trend = consecutiveBuys > 0 ? '{green-fg}BULL{/}' : '{red-fg}BEAR{/}';
        updateStatsPanel(status, trend);

    } catch (e) { }
  }, 2000);

  screen.render();
  screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
}

startDashboard().catch((error) => {
  logger.error('Failed to start dashboard', error);
});