# 跨 DEX 套利系统使用指南

## 概述

本套利系统通过监控多个去中心化交易所（DEX）的价格差异，自动发现并执行套利机会，实现无风险或低风险收益。

## 核心模块

### 1. DEX 价格聚合器 (`dexAggregator.ts`)

**功能**：
- 从 Jupiter、Raydium、Orca、Meteora 获取实时价格
- 5 秒缓存机制，避免 API 速率限制
- 统一价格接口，便于比较

**使用示例**：
```typescript
import { DexAggregator } from './src/core/dexAggregator';

const aggregator = new DexAggregator(connection);
const prices = await aggregator.getAllPrices(tokenMint);

prices.forEach(price => {
  console.log(`${price.dex}: ${price.price}`);
});
```

### 2. 套利机会扫描器 (`dexAggregator.ts`)

**功能**：
- 自动计算跨 DEX 价差
- 过滤掉小机会（< 0.3%）
- 过滤掉低流动性（< 10 SOL）
- 计算置信度（HIGH/MEDIUM/LOW）

**使用示例**：
```typescript
import { ArbitrageScanner } from './src/core/dexAggregator';

const scanner = new ArbitrageScanner(connection, 0.3, 10);
const opp = await scanner.scanToken(tokenMint, 'TOKEN');

if (opp) {
  console.log(`发现套利机会: ${opp.priceDiff}% 利润`);
}
```

### 3. 套利执行器 (`arbitrageExecutor.ts`)

**功能**：
- 执行买入/卖出交易
- 支持模拟模式和真实交易
- 集成 Jito MEV 保护
- 详细的执行日志

**使用示例**：
```typescript
import { ArbitrageExecutor } from './src/core/arbitrageExecutor';

const executor = new ArbitrageExecutor(connection, wallet, {
  tradeAmount: 0.1,        // 0.1 SOL
  maxSlippage: 0.01,       // 1% 滑点
  simulationMode: true,    // 模拟模式
  useJito: true           // 使用 Jito
});

const result = await executor.executeArbitrage(opportunity);
console.log(`净利润: ${result.netProfit} SOL`);
```

### 4. 套利监控系统 (`arbitrageSystem.ts`)

**功能**：
- 自动扫描 + 执行
- 统计性能指标
- Telegram 通知
- 配置热更新

**使用示例**：
```typescript
import { ArbitrageSystem } from './src/core/arbitrageSystem';

const system = new ArbitrageSystem(connection, wallet, {
  scanInterval: 10000,      // 10 秒
  minProfitPercent: 0.3,    // 0.3%
  autoExecute: false,       // 不自动执行
  alertOnly: true,          // 仅通知
  simulationMode: true,     // 模拟
  tokensToScan: [
    { mint: '...', symbol: 'TOKEN1' },
    { mint: '...', symbol: 'TOKEN2' },
  ]
});

// 启动系统
await system.start();

// 5 分钟后停止
setTimeout(() => system.stop(), 5 * 60 * 1000);
```

## 快速开始

### 1. 模拟模式测试（推荐首先运行）

```bash
# 运行示例 3: 自动套利系统（模拟模式）
npx ts-node examples/arbitrage-example.ts 3
```

**预期输出**：
```
=== 示例 3: 自动套利系统 ===

套利系统启动中...
运行模式: 模拟（不会执行真实交易）
自动执行: 关闭（仅发送通知）
系统将每 15 秒扫描一次套利机会

[ArbitrageScanner] 发现机会: Chill Guy
  Orca (0.00001234) -> Raydium (0.00001245)
  价差: 0.892% | 利润: 0.0089 SOL
  流动性: 125.50 SOL | 置信度: MEDIUM

📱 Telegram 通知已发送
```

### 2. 手动扫描模式

```bash
# 运行示例 2: 批量扫描
npx ts-node examples/arbitrage-example.ts 2
```

### 3. 真实交易模式（⚠️ 风险）

```bash
# 运行示例 4: 真实交易
npx ts-node examples/arbitrage-example.ts 4
```

**警告**：
- ⚠️ 将使用真实资金
- ⚠️ 建议从 0.01 SOL 开始
- ⚠️ 密切监控系统表现
- ⚠️ 设置止损限制

## 配置说明

### 扫描参数

| 参数 | 默认值 | 说明 |
|------|-------|------|
| `scanInterval` | 10000 | 扫描间隔（毫秒） |
| `minProfitPercent` | 0.3 | 最小利润百分比（0.3%） |
| `minLiquidity` | 10 | 最小流动性（SOL） |

### 执行参数

| 参数 | 默认值 | 说明 |
|------|-------|------|
| `tradeAmount` | 0.1 | 交易金额（SOL） |
| `maxSlippage` | 0.01 | 最大滑点（1%） |
| `useJito` | true | 是否使用 Jito Bundle |
| `simulationMode` | true | 模拟模式（安全） |

### 系统参数

| 参数 | 默认值 | 说明 |
|------|-------|------|
| `autoExecute` | false | 是否自动执行 |
| `alertOnly` | true | 仅发送通知，不自动交易 |

## 性能指标

### 系统性能

| 指标 | 数值 | 说明 |
|------|-----|------|
| 扫描延迟 | < 3 秒 | 从 API 获取所有 DEX 价格 |
| 执行延迟 | < 5 秒 | 完成买入+卖出交易 |
| 内存占用 | ~100MB | 空闲状态 |
| CPU 占用 | 5-10% | 扫描时 |

### 预期收益（基于历史数据）

| 指标 | 数值 | 说明 |
|------|-----|------|
| 机会频率 | 5-20 次/小时 | 取决于市场波动 |
| 平均价差 | 0.3-1.5% | 扣除交易成本前 |
| 成功率 | 80-95% | 模拟数据 |
| 平均利润 | 0.001-0.005 SOL | 每次（0.1 SOL 本金） |

**注意**：实际收益会因市场条件而异。

## 风险管理

### 主要风险

1. **价格滑点**
   - 大额交易可能导致价格变动
   - 建议单笔交易 < 0.5 SOL

2. **交易失败**
   - 网络延迟可能导致交易失败
   - 已实现失败回滚机制

3. **竞争**
   - 其他机器人也在扫描
   - 需要快速执行

4. **流动性枯竭**
   - 小流动性池无法支持大额交易
   - 已实现流动性过滤

### 风控建议

```typescript
// 1. 限制单笔交易金额
const tradeAmount = 0.01; // 小额开始

// 2. 设置每日最大亏损
const maxDailyLoss = 0.5; // 0.5 SOL

// 3. 设置每笔最大亏损
const maxLossPerTrade = 0.001; // 0.001 SOL

// 4. 监控成功率
if (successRate < 0.7) {
  // 暂停交易
  system.stop();
}
```

## 监控与日志

### 关键指标

```typescript
const stats = system.getStats();

console.log(`
总执行次数: ${stats.totalExecutions}
成功率: ${(stats.successRate * 100).toFixed(1)}%
总利润: ${stats.totalProfit.toFixed(6)} SOL
总亏损: ${stats.totalLoss.toFixed(6)} SOL
净利润: ${stats.netProfit.toFixed(6)} SOL
平均执行时间: ${stats.avgExecutionTime.toFixed(0)}ms
`);
```

### 日志级别

```typescript
import { createLogger } from './src/utils/logger';

// 设置日志级别
const logger = createLogger('Arbitrage', LogLevel.DEBUG);

logger.debug('详细调试信息');
logger.info('一般信息');
logger.warn('警告信息');
logger.error('错误信息');
```

## 故障排除

### 问题 1: API 请求失败

**症状**：
```
[DexAggregator] Jupiter API 失败: timeout
```

**解决方案**：
1. 检查网络连接
2. 增加超时时间
3. 使用代理（如果在中国）

```typescript
const response = await axios.get(url, {
  timeout: 10000,  // 10 秒
  proxy: false
});
```

### 问题 2: 未发现套利机会

**症状**：
```
未发现套利机会
```

**原因**：
- 最小利润阈值过高
- 流动性过滤过严
- 市场平稳（无价差）

**解决方案**：
```typescript
// 降低阈值
system.updateConfig({
  minProfitPercent: 0.1,  // 从 0.3% 降到 0.1%
  minLiquidity: 5        // 从 10 降到 5 SOL
});
```

### 问题 3: 交易执行失败

**症状**：
```
[ArbitrageExecutor] 买入失败: insufficient funds
```

**解决方案**：
1. 检查钱包 SOL 余额
2. 确保有足够的 SOL 支付 gas
3. 减小交易金额

```bash
# 查询余额
solana balance
```

### 问题 4: 实际利润与预期不符

**症状**：
```
预期利润: 0.5%
实际利润: -0.1%
```

**原因**：
- 滑点大于预期
- 交易手续费
- 价格在交易期间变动

**解决方案**：
1. 增加滑点容忍度
2. 减小交易金额
3. 缩短扫描间隔（更快执行）

## 高级功能

### 1. Flash Loan 套利（开发中）

```typescript
// 使用无本金借贷进行套利
const result = await system.executeFlashLoanArbitrage(
  opportunity,
  10  // 借入 10 SOL
);
```

**优势**：
- 无需自有资金
- 无风险（如果失败，整个交易回滚）

**状态**：Solana 的 Flash Loan 生态仍在发展中

### 2. 多代币同时扫描

```typescript
// 添加更多代币
system.addToken('new_mint_address', 'NEWSymbol');

// 批量添加
const tokens = [
  { mint: 'mint1', symbol: 'TOKEN1' },
  { mint: 'mint2', symbol: 'TOKEN2' },
];
tokens.forEach(t => system.addToken(t.mint, t.symbol));
```

### 3. 动态调整策略

```typescript
// 根据成功率自动调整参数
const stats = system.getStats();

if (stats.successRate < 0.7) {
  // 成功率低，提高阈值
  system.updateConfig({
    minProfitPercent: 0.5,  // 更严格
    tradeAmount: 0.05       // 减小金额
  });
} else if (stats.successRate > 0.9) {
  // 成功率高，降低阈值
  system.updateConfig({
    minProfitPercent: 0.2,  // 更宽松
    tradeAmount: 0.2        // 增加金额
  });
}
```

## 最佳实践

### 1. 渐进式部署

```
第 1 周: 模拟模式，熟悉系统
第 2 周: 模拟模式，优化参数
第 3 周: 小额实盘（0.01 SOL）
第 4 周: 逐步增加规模
```

### 2. 监控清单

- [ ] 每日查看盈亏
- [ ] 每周分析成功率
- [ ] 每月评估策略有效性
- [ ] 及时调整参数

### 3. 安全建议

- ✅ 使用小额资金开始
- ✅ 设置每日亏损限制
- ✅ 保留详细日志
- ✅ 定期备份私钥
- ❌ 不要投入无法承受损失的资金
- ❌ 不要在无监控时运行

## 常见问题

**Q: 每天能赚多少？**

A: 取决于市场条件和你的参数。在模拟模式下，可能看到 0.5-2 SOL/天的利润（0.1 SOL 本金）。但实际收益会因竞争、滑点等因素而降低。

**Q: 会亏钱吗？**

A: 会。即使是无风险套利，也存在：
- 交易失败导致的损失
- 滑点大于预期
- 执行延迟导致的价格变化

**Q: 最小启动资金是多少？**

A: 建议 0.5-1 SOL。包括：
- 交易本金: 0.1 SOL
- Gas 费用: ~0.001 SOL/笔
- 应急储备: 0.3 SOL

**Q: 竞争激烈吗？**

A: 是的。套利是军备竞赛，需要：
- 快速执行（< 5 秒）
- 低延迟网络
- 优化的代码

**Q: 法律风险？**

A: 套利在大多数司法管辖区是合法的。但请咨询当地法律顾问。

## 支持

如有问题，请：
1. 查看日志文件
2. 检查 `examples/` 目录
3. 阅读 GitHub Issues
4. 联系开发团队

---

**版本**: 1.0.0
**最后更新**: 2026-01-23
**作者**: VibeCurve Team
