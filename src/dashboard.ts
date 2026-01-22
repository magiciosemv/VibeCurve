import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { simulator } from './core/simulator';

// 🚨 目标代币 (确保这个代币现在有人玩，不然没数据)
const TARGET_MINT = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump'); 

// 1. 初始化屏幕
const screen = blessed.screen({
  smartCSR: true,
  title: '🌊 VIBE CURVE PRO TRADER'
});

// 2. 布局网格 (Grid)
// rows: 12, cols: 12 是标准网格划分
const grid = new contrib.grid({rows: 12, cols: 12, screen: screen});

// === 组件定义 ===

// A. 价格走势图 (占据左上角: 0,0, 宽高: 6x8)
const priceLine = grid.set(0, 0, 6, 8, contrib.line, {
  style: { 
    line: "yellow", 
    text: "green", 
    baseline: "black" 
  },
  xLabelPadding: 3,
  xPadding: 5,
  showLegend: true,
  legend: { width: 12 },
  label: ' Bonding Curve Price Action '
});

// B. 交易日志 (占据底部: 6,0, 宽高: 6x8)
const logBox = grid.set(6, 0, 6, 8, contrib.log, {
  fg: "green",
  selectedFg: "green",
  label: ' Real-time Transaction Feed ',
  tags: true,          // <--- 关键修复：开启标签解析，让颜色代码生效！
  bufferLength: 50     // 限制缓冲区，防止内存溢出
});

// C. 策略状态栏 (占据右上角: 0,8, 宽高: 4x4)
const statsBox = grid.set(0, 8, 4, 4, blessed.box, {
  tags: true,
  label: ' Strategy Engine ',
  style: { 
    border: { fg: 'cyan' },
    fg: 'white'
  },
  content: '{center}\n\nInitializing...{/center}'
});

// D. Jito 状态 (占据右中: 4,8, 宽高: 2x4)
const jitoBox = grid.set(4, 8, 2, 4, contrib.donut, {
  label: ' MEV Bundle Status ',
  radius: 8,
  arcWidth: 3,
  remainColor: 'black',
  yPadding: 2,
  data: [{percent: 100, label: 'Jito', color: 'magenta'}]
});

// E. 盈亏曲线 (占据右下: 6,8, 宽高: 6x4)
const pnlLine = grid.set(6, 8, 6, 4, contrib.line, {
    style: { 
      line: "red", 
      text: "white", 
      baseline: "black" 
    },
    label: ' Simulated PnL ',
    minY: -0.1,
    maxY: 0.1
});

// === 核心逻辑 ===

const priceHistory: number[] = [];
const timeLabels: string[] = [];
let mockPrice = 0.000020; // 初始基准价格

// 更新价格图表
function updatePrice(isBuy: boolean, impact: number) {
    const change = isBuy ? impact : -impact;
    mockPrice = mockPrice * (1 + change);
    
    priceHistory.push(mockPrice);
    const now = new Date();
    timeLabels.push(`${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`);

    // 保持图表只显示最近 20 个点
    if (priceHistory.length > 20) {
        priceHistory.shift();
        timeLabels.shift();
    }

    priceLine.setData([
        { title: 'Price', x: timeLabels, y: priceHistory }
    ]);
}

async function startDashboard() {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  
  logBox.log(`Connecting to ${config.rpcUrl.slice(0, 25)}...`);
  logBox.log(`Target: ${TARGET_MINT.toBase58()}`);

  let lastSignature: string | null = null;
  
  // 简单的自动交易策略变量
  let consecutiveBuys = 0;

  // 主循环：每 2 秒刷新一次数据
  setInterval(async () => {
    try {
        // 1. 获取最新签名
        const signatures = await connection.getSignaturesForAddress(TARGET_MINT, { limit: 3 });
        if (signatures.length === 0) return;
        
        const newest = signatures[0];
        if (newest.signature === lastSignature) return; // 没新数据

        // 2. 找出新交易
        const newSigs = [];
        for (const tx of signatures) {
            if (tx.signature === lastSignature) break;
            newSigs.push(tx.signature);
        }
        lastSignature = newest.signature;

        // 3. 处理每一笔新交易 (Simulation Mode)
        for (const sig of newSigs) {
             // 为了演示流畅度，我们不每次都去调 getParsedTransaction (太慢且易限流)
             // 而是根据 signatures 里的 err 状态做一个简单的模拟演示
             // *真实生产环境请接回 sniper.ts 的 analyzeTransaction*
             
             // 假设：偶数秒是买，奇数秒是卖 (或者随机)，纯粹为了展示 UI 效果
             // 真实逻辑：await connection.getParsedTransaction...
             
             const isErr = newest.err !== null;
             if (isErr) {
                 logBox.log(`{red-fg}[FAIL] Failed Tx{/red-fg}`);
                 continue;
             }

             // 随机模拟买卖压力 (Demo Effect)
             const isBuy = Math.random() > 0.45; 
             const amount = Math.floor(Math.random() * 50000) + 1000;

             if (isBuy) {
                 // 使用 [BUY ] 标签代替 Emoji，确保不乱码
                 logBox.log(`{green-fg}[BUY ] | ${amount} Tokens | ${sig.slice(0,6)}...{/green-fg}`);
                 updatePrice(true, 0.005);
                 consecutiveBuys++;
                 
                 // 策略触发：连续 3 次买入 -> 跟单
                 if (consecutiveBuys === 3) {
                    const msg = simulator.buy(mockPrice, 0.1);
                    if(msg) logBox.log(`{cyan-fg}${msg}{/cyan-fg}`);
                 }

             } else {
                 logBox.log(`{red-fg}[SELL] | ${amount} Tokens | ${sig.slice(0,6)}...{/red-fg}`);
                 updatePrice(false, 0.008);
                 consecutiveBuys = 0;
                 
                 // 策略触发：有人砸盘 -> 止损
                 const msg = simulator.sell(mockPrice);
                 if(msg) logBox.log(`{yellow-fg}${msg}{/yellow-fg}`);
             }
        }

        // 4. 更新右上角状态栏
        const status = simulator.getStatus(mockPrice);
        const trendColor = consecutiveBuys > 0 ? '{green-fg}' : '{red-fg}';
        const trendText = consecutiveBuys > 0 ? 'BULLISH' : 'BEARISH';

        statsBox.setContent(
            `{center}\n` +
            `Target: ${TARGET_MINT.toBase58().slice(0,4)}...${TARGET_MINT.toBase58().slice(-4)}\n\n` +
            `Price: ${mockPrice.toFixed(8)} SOL\n` +
            `Trend: ${trendColor}${trendText}{/}\n\n` +
            `${status}\n` +
            `{/center}`
        );
        
        screen.render();

    } catch (e) {
        // 忽略网络抖动，保持界面稳定
    }
  }, 2000);

  // 初始渲染
  screen.render();
  
  // 监听退出键
  screen.key(['escape', 'q', 'C-c'], function(ch, key) {
    return process.exit(0);
  });
}

startDashboard();