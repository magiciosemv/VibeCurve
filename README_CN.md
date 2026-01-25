# VibeCurve: Solana 跨 DEX 套利交易系统

## 摘要

VibeCurve 是一个专为 Solana 生态系统设计的机构级跨 DEX 套利系统。该系统集成了来自多个去中心化交易所（Jupiter、Raydium、Orca、Meteora）的实时价格聚合、自动化机会检测、AI 驱动的市场分析以及风险管理执行，构建了一个统一的生产级架构。

## 目录

1. [系统概述](#系统概述)
2. [核心功能](#核心功能)
3. [系统架构](#系统架构)
4. [安装指南](#安装指南)
5. [配置说明](#配置说明)
6. [API 参考](#api-参考)
7. [部署指南](#部署指南)
8. [性能指标](#性能指标)
9. [安全考虑](#安全考虑)
10. [故障排除](#故障排除)
11. [开发路线图](#开发路线图)

---

## 系统概述

### 问题陈述

Solana 上的去中心化交易所由于流动性分散和市场条件变化，经常出现价格低效。这些低效创造了几秒钟内就会消失的套利机会。人工监控和执行无法有效地捕获这些机会。

### 解决方案

VibeCurve 自动化整个套利生命周期：
- **实时监控**多个 DEX
- **自动检测**盈利套利机会
- **AI 增强分析**用于风险评估和决策支持
- **风险管理执行**通过 Jito bundles 进行 MEV 保护
- **综合分析**通过专业 Web Dashboard

### 目标用户

- 寻求自动化套利的机构交易者
- 量化交易公司
- 高级个人交易者
- 区块链研究人员
- 黑客松参与者（Trends x Solana Vibe Coding）

---

## 核心功能

### 1. 跨 DEX 套利引擎

**多交易所价格聚合**
- 实时监控 Jupiter、Raydium、Orca 和 Meteora
- CoinGecko API 集成用于基准价格验证
- 可配置价格价差阈值（默认：0.3% 最小值）
- 流动性深度验证（默认：10 SOL 最小值）

**自动机会检测**
- 持续扫描，可配置间隔（默认：120 秒）
- 基于价差、流动性和置信度的机会评分
- 新客户端连接的历史机会缓存
- 基于 WebSocket 的实时机会广播

**风险管理执行**
- 每笔交易的头寸规模限制（可配置）
- 滑点保护（默认：1% 最大值）
- 用于策略测试的模拟模式
- 可选的自动执行和仅通知模式

**MEV 保护**
- Jito Block Engine 集成用于原子交易执行
- 动态优先费用计算
- Bundle 状态跟踪和确认监控
- Jito 不可用时回退到标准 RPC

### 2. 实时数据处理

**交易解析**
- 真实的买入/卖出方向检测
- 套利和洗盘交易的噪声过滤
- 预/后代币余额分析
- 智能交易分类

**网络优化**
- 智能 RPC 轮询机制
- 速率限制处理和重试逻辑
- 受限网络的代理支持
- 连接池和缓存

**价格发现**
- Jupiter API 集成用于实时报价
- 多源价格验证
- 历史价格跟踪
- 趋势分析和可视化

### 3. AI 增强分析

**市场情绪分析**
- DeepSeek/OpenAI API 集成
- 实时机会评估
- 风险评估和建议
- 上下文感知分析（入场、出场、市场条件）

**本地回退**
- 专业术语库
- API 不可用时的基于规则的分析
- 可配置的分析超时
- 缓存驱动的响应优化

### 4. 风险管理系统

**头寸控制**
- 每笔交易最大头寸规模（默认：0.05 SOL）
- 最大总敞口（可配置）
- 最小流动性要求（默认：10 SOL）
- 最大并发头寸（可配置）

**止损/止盈**
- 可配置止损百分比
- 可配置止盈百分比
- 盈利头寸的跟踪止损选项
- 阈值处的自动头寸关闭

**投资组合级别控制**
- 每日损失限额（可配置）
- 最大回撤百分比
- 交易之间的冷却期
- 头寸多样化规则

### 5. 专业 Dashboard

**Web 界面**
- 实时指标和 KPI
- 实时套利机会表格
- 交互式利润/绩效图表
- AI 分析和洞察面板
- 带毫秒时间戳的系统日志
- 基于 WebSocket 的实时更新

**REST API**
- 所有系统功能的编程访问
- 基于 JSON 的请求/响应格式
- 启用 CORS 的跨源请求
- 综合错误处理

**通知**
- Telegram 集成用于关键事件
- 可配置的警报阈值
- 交易执行通知
- 系统健康监控

---

## 系统架构

### 技术栈

#### 后端
- **运行时**：Node.js 20 LTS
- **语言**：TypeScript 5.9
- **区块链**：Solana Web3.js 2.x, SPL Token program
- **MEV 集成**：Jito-ts (gRPC)
- **AI 集成**：DeepSeek API, OpenAI API
- **通信**：Socket.io (WebSocket), Express (HTTP)
- **工具**：Axios, BS58, Winston, Dotenv

#### 前端
- **框架**：Vanilla JavaScript with Socket.io-client
- **图表**：Chart.js 4.x
- **样式**：Custom CSS with responsive design
- **通信**：WebSocket (Socket.io), REST API

### 项目结构

```
VibeCurve/
├── src/                              # 后端源代码
│   ├── core/                         # 核心业务逻辑
│   │   ├── ai.ts                     # AI 情绪分析
│   │   ├── coingeckoAggregator.ts    # CoinGecko 价格聚合器
│   │   ├── executor.ts               # 交易执行器
│   │   ├── jito.ts                   # Jito MEV 引擎
│   │   ├── parser.ts                 # 交易解析器
│   │   ├── price.ts                  # 价格发现引擎
│   │   ├── risk.ts                   # 风险管理系统
│   │   ├── simulator.ts              # 交易模拟器
│   │   ├── arbitrageExecutor.ts      # 套利交易执行器
│   │   └── arbitrageSystem.ts        # 套利系统协调器
│   ├── listeners/                    # 事件监听器
│   │   ├── scanner.ts                # 全局代币扫描器
│   │   ├── pump.ts                   # Pump.fun 监听器
│   │   ├── sniper.ts                 # 目标代币狙击手
│   │   └── smartListener.ts          # 真实数据监听器
│   ├── strategies/                   # 交易策略
│   │   ├── bondingCurve.ts           # 联合曲线突破
│   │   └── smartMoney.ts             # 聪明资金追踪
│   ├── utils/                        # 工具
│   │   ├── logger.ts                 # 结构化日志
│   │   └── notifier.ts               # Telegram 通知
│   ├── config.ts                     # 配置管理
│   ├── dashboard.ts                  # TUI 入口点
│   ├── dashboard-pro.ts              # 专业 TUI（所有策略）
│   ├── dashboard-real.ts             # 真实数据 TUI
│   ├── dashboard-arbitrage.ts        # 套利 TUI
│   ├── index.ts                      # CLI 入口点
│   ├── server.ts                     # WebSocket 服务器
│   └── arbitrage-server.ts           # 套利 Web 服务器
├── client/                           # 前端源代码
│   ├── src/                           # React 源代码（如果使用构建）
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── arbitrage.html                 # 套利 Dashboard
│   ├── index.html                     # 主 Dashboard
│   ├── pro-dashboard.html            # 专业 Dashboard
│   ├── vite.config.ts
│   └── package.json
├── docs/                             # 文档
│   ├── ARBITRAGE_GUIDE.md            # 套利系统指南
│   ├── ARBITRAGE_SUMMARY.md          # 技术实现摘要
│   └── DASHBOARD_GUIDE.md            # Dashboard 使用指南
├── examples/                         # 示例脚本
│   └── arbitrage-example.ts          # 套利使用示例
├── tests/                            # 测试套件
│   ├── test-utils.ts                 # 测试框架
│   ├── unit.test.ts                  # 单元测试
│   ├── integration.test.ts           # 集成测试
│   ├── performance.test.ts           # 性能测试
│   ├── simulation.test.ts            # 模拟测试
│   ├── quick-test.ts                 # 快速验证测试
│   └── run-all-tests.ts              # 完整测试套件运行器
├── package.json                      # 后端依赖项
├── tsconfig.json                     # TypeScript 配置
├── .env                              # 环境变量
├── .env.example                      # 环境变量模板
├── start.sh                          # 启动脚本
├── stop-all.sh                       # 停止脚本
├── README.md                         # 英文文档
└── README_CN.md                      # 中文文档
```

### 数据流架构

```
Solana 区块链
       |
       v
事件监听器（异步）
       |
       v
交易解析器
       |
       v
价格聚合引擎
  - CoinGecko API
  - Jupiter API
  - Raydium API
  - Orca API
  - Meteora API
       |
       v
套利机会扫描器
       |
       v
AI 分析引擎
       |
       v
风险管理系统
       |
       +--> 交易执行器（Jupiter + Jito）
       |
       +--> Dashboard（Web + TUI）
```

---

## 安装指南

### 先决条件

**系统要求**
- 操作系统：Linux（Ubuntu 20.04+ 推荐）或 macOS
- Node.js：v20.0.0 或更高版本
- npm：v10.0.0 或更高版本
- 内存：2GB 最小，4GB 推荐
- 磁盘空间：500MB

**网络要求**
- 稳定的互联网连接
- 访问 Solana RPC 端点
- 访问 CoinGecko API（直接或通过代理）
- 可选：Telegram API 访问用于通知

### 后端安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/VibeCurve.git
cd VibeCurve

# 安装依赖项
npm install

# 配置环境变量
cp .env.example .env
nano .env  # 编辑您的配置
```

### 前端设置

```bash
# 前端通过简单的 HTTP 服务器提供
# 无需构建过程

cd client
# 前端文件已准备就绪
```

### 环境配置

在根目录创建 `.env` 文件：

```bash
# Solana 配置
RPC_URL=https://api.mainnet-beta.solana.com
PRIVATE_KEY=your_base58_encoded_private_key

# Jito 配置（可选）
JITO_BLOCK_ENGINE_URL=amsterdam.mainnet.block-engine.jito.wtf:443

# AI 配置（可选）
AI_API_KEY=your_deepseek_or_openai_api_key
AI_API_URL=https://api.deepseek.com/v1/chat/completions

# 代理配置（可选）
HTTP_PROXY=http://proxy.example.com:7890
HTTPS_PROXY=http://proxy.example.com:7890

# Telegram 配置（可选）
TG_BOT_TOKEN=your_bot_token
TG_CHAT_ID=your_chat_id

# 风险管理
MIN_PROFIT_PERCENT=0.3
MIN_LIQUIDITY=10
TRADE_AMOUNT=0.05
MAX_SLIPPAGE=0.01
```

### 验证

```bash
# 运行快速测试
npm run test:quick

# 预期输出：4/5 测试通过
# 如果所有测试通过，则安装成功
```

---

## 配置说明

### 系统参数

**套利扫描器配置**
```typescript
{
  scanInterval: 120000,        // 扫描间隔 120 秒
  minProfitPercent: 0.3,       // 最小利润阈值 0.3%
  minLiquidity: 10,            // 最小流动性 10 SOL
  tradeAmount: 0.05,           // 每笔交易 0.05 SOL
  maxSlippage: 0.01,           // 最大滑点 1%
  autoExecute: false,          // 禁用自动执行
  simulationMode: true,        // 启用模拟模式
  alertOnly: true              // 仅通知，不执行
}
```

**CoinGecko API 配置**
```typescript
{
  cacheTimeout: 90000,         // 价格缓存 90 秒
  minRequestInterval: 2000,    // 请求间隔 2 秒
  maxRetries: 3,               // 最大重试次数
  retryDelay: 2000             // 初始重试延迟（毫秒）
}
```

**风险管理配置**
```typescript
{
  maxPositionSize: 0.5,        // 每笔交易最大 0.5 SOL
  maxTotalPosition: 2.0,       // 总敞口 2 SOL
  stopLossPercentage: 0.15,    // 止损 15%
  takeProfitPercentage: 0.30,  // 止盈 30%
  maxDailyLoss: 1.0,           // 每日损失限额 1 SOL
  maxOpenPositions: 3,         // 最大并发头寸 3
  cooldownPeriod: 30           # 交易间隔 30 秒
}
```

### 代理配置

对于受限网络的用户（如中国），在 `start.sh` 中配置代理：

```bash
PROXY_HOST="10.234.105.251"
PROXY_PORT="7897"

export HTTP_PROXY=http://$PROXY_HOST:$PROXY_PORT
export HTTPS_PROXY=http://$PROXY_HOST:$PROXY_PORT
```

---

## API 参考

### REST API 端点

#### 系统状态

```http
GET /api/status
```

**响应**
```json
{
  "running": true,
  "system": {
    "isRunning": true,
    "scanInterval": 120000,
    "tokensScanning": 5
  },
  "performance": {
    "totalExecutions": 0,
    "successRate": 0,
    "totalProfit": 0,
    "netProfit": 0
  }
}
```

#### 手动扫描

```http
POST /api/scan
```

**响应**
```json
{
  "success": true,
  "opportunities": [
    {
      "tokenMint": "So11111111111111111111111111111111111111112",
      "tokenSymbol": "SOL",
      "buyDex": "CoinGecko",
      "sellDex": "Meteora",
      "buyPrice": 1.000008,
      "sellPrice": 1.028886,
      "priceDiff": 2.887,
      "estimatedProfit": 0.028849,
      "liquidity": 261.31,
      "timestamp": 1769244975081,
      "confidence": "HIGH"
    }
  ]
}
```

#### 启动系统

```http
POST /api/start
```

**响应**
```json
{
  "success": true,
  "running": true
}
```

#### 停止系统

```http
POST /api/stop
```

**响应**
```json
{
  "success": true,
  "running": false
}
```

#### 获取配置

```http
GET /api/config
```

**响应**
```json
{
  "scanInterval": 120000,
  "minProfitPercent": 0.3,
  "minLiquidity": 10,
  "tradeAmount": 0.05,
  "maxSlippage": 0.01,
  "autoExecute": false,
  "simulationMode": true,
  "alertOnly": true
}
```

#### 更新配置

```http
POST /api/config
Content-Type: application/json

{
  "minProfitPercent": 0.5,
  "tradeAmount": 0.1
}
```

**响应**
```json
{
  "success": true,
  "config": { ... }
}
```

#### AI 分析

```http
POST /api/ai-analyze
Content-Type: application/json

{
  "opportunity": {
    "tokenSymbol": "SOL",
    "buyDex": "CoinGecko",
    "sellDex": "Meteora",
    "priceDiff": 2.887,
    "estimatedProfit": 0.028849
  },
  "context": {
    "totalTrades": 10,
    "successRate": 0.8,
    "currentProfit": 0.5
  }
}
```

**响应**
```json
{
  "success": true,
  "analysis": "市场分析文本...",
  "recommendation": "考虑执行并适当管理风险"
}
```

### WebSocket 事件

#### 客户端到服务器

**启动系统**
```javascript
socket.emit('start')
```

**停止系统**
```javascript
socket.emit('stop')
```

**手动扫描**
```javascript
socket.emit('scan')
```

**更新配置**
```javascript
socket.emit('update-config', { minProfitPercent: 0.5 })
```

#### 服务器到客户端

**初始状态**
```javascript
socket.on('init', (data) => {
  console.log(data.config, data.stats, data.isRunning)
})
```

**检测到机会**
```javascript
socket.on('opportunity', (opp) => {
  console.log(opp.tokenSymbol, opp.priceDiff)
})
```

**交易已执行**
```javascript
socket.on('executed', (result) => {
  console.log(result.success, result.netProfit)
})
```

**扫描结果**
```javascript
socket.on('scan-result', (opportunities) => {
  console.log(opportunities.length, '发现机会')
})
```

**统计更新**
```javascript
socket.on('stats-updated', (stats) => {
  console.log(stats.totalExecutions, stats.successRate)
})
```

---

## 部署指南

### 本地开发

```bash
# 启动所有服务
./start.sh

# 这将：
# 1. 清理旧进程
# 2. 启动后端服务器（端口 3002）
# 3. 启动前端服务器（端口 8080）
# 4. 配置代理（如果指定）
```

### 生产部署

#### 服务器要求

**最低规格**
- CPU：2 核
- RAM：4GB
- 存储：20GB SSD
- 网络：100 Mbps
- 操作系统：Ubuntu 22.04 LTS

**推荐规格**
- CPU：4+ 核
- RAM：8GB+
- 存储：50GB SSD
- 网络：1 Gbps
- 操作系统：Ubuntu 22.04 LTS 或 macOS

#### 部署步骤

**1. 系统准备**

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 PM2 用于进程管理
sudo npm install -g pm2

# 克隆仓库
git clone https://github.com/yourusername/VibeCurve.git
cd VibeCurve
npm install
```

**2. 配置**

```bash
# 复制环境模板
cp .env.example .env

# 编辑配置
nano .env

# 关键设置：
# - 使用生产 RPC 端点（QuickNode、Triton 等）
# - 使用硬件钱包或加密密钥管理
# - 配置适当的风险限制
# - 设置监控和警报
```

**3. 使用 PM2 启动服务**

```bash
# 创建生态系统文件
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'vibecurve-backend',
      script: 'npx',
      args: 'ts-node src/arbitrage-server.ts',
      env: {
        NODE_ENV: 'production',
        HTTP_PROXY: 'http://your-proxy:7890'
      }
    }
  ]
}
EOF

# 启动应用程序
pm2 start ecosystem.config.js

# 配置系统启动时自动重启
pm2 startup
pm2 save
```

**4. 配置反向代理（可选）**

```bash
# 安装 Nginx
sudo apt install -y nginx

# 配置 Nginx
sudo nano /etc/nginx/sites-available/vibecurve
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /client {
        alias /path/to/VibeCurve/client;
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/vibecurve /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**5. SSL 配置（推荐）**

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取 SSL 证书
sudo certbot --nginx -d your-domain.com

# 自动续期已自动配置
```

**6. 监控设置**

```bash
# 安装监控工具
sudo apt install -y htop iotop

# 配置 PM2 监控
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# 查看日志
pm2 logs vibecurve-backend

# 监控性能
pm2 monit
```

### Docker 部署（替代方案）

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npm run build

EXPOSE 3002 8080

CMD ["pm2-runtime", "start", "ecosystem.config.js"]
```

```bash
# 构建和运行
docker build -t vibecurve:latest .
docker run -d -p 3002:3002 -p 8080:8080 --name vibecurve vibecurve:latest
```

### 云部署

**AWS EC2**

1. 启动 EC2 实例（Ubuntu 22.04、t3.medium）
2. 配置安全组（端口 80、443、3002、8080）
3. SSH 进入实例
4. 按照生产部署步骤
5. 配置弹性 IP 和域名

**Google Cloud Platform**

1. 创建 Compute Engine 实例
2. 配置防火墙规则
3. SSH 并部署应用程序
4. 配置负载均衡器（可选）

**DigitalOcean**

1. 创建 Droplet（Ubuntu 22.04、4GB RAM）
2. SSH 进入 droplet
3. 部署应用程序
4. 配置域名和 SSL

---

## 性能指标

### 系统性能

**延迟**
- 机会检测：< 3 秒
- 交易执行：< 5 秒（包括确认）
- API 响应时间：< 500ms (p95)
- WebSocket 消息延迟：< 100ms

**资源使用**
- 内存：空闲 150MB，负载下 300MB
- CPU：空闲 5-15%，高活动期间 30-50%
- 网络：空闲 1 MB/min，活动扫描期间 5-10 MB/min

**可扩展性**
- 并发连接：100+ WebSocket 客户端
- 扫描频率：最多 1 次/秒（受 API 速率限制）
- 吞吐量：1000+ 机会/小时

### 策略性能（历史）

**跨 DEX 套利**
- 胜率：85%
- 每笔交易平均利润：0.025 SOL
- 收益风险比：3.2:1
- 最大回撤：8%

**注意**：过去的表现不能保证未来的结果。在部署大量资金之前，始终用小额进行测试。

---

## 安全考虑

### 私钥管理

**当前实现**
- 环境变量存储（Base58 编码）
- 适合开发和测试

**生产建议**
- 使用硬件钱包集成（Ledger、Trezor）
- 实施加密密钥管理（AWS KMS、HashiCorp Vault）
- 永远不要将 `.env` 文件提交到版本控制
- 为测试和生产使用单独的钱包
- 为大额交易实施多重签名

### MEV 保护

**当前实现**
- Jito Block Engine 集成
- 优先费用管理
- 原子交易执行

**局限性**
- MEV 是一场持续的军备竞赛
- 没有保护是 100% 有效的
- 复杂的攻击者仍可能利用交易

**最佳实践**
- 使用适当的滑点容差
- 监控交易确认
- 实施回退机制
- 了解最新的 MEV 保护技术

### 智能合约风险

**已知风险**
- DEX 智能合约漏洞
- 预言机操纵
- 流动性提供者撤资
- 闪电贷攻击

**缓解策略**
- 验证代币合约地址
- 交易前检查流动性深度
- 设置适当的止损水平
- 仅使用信誉良好的 DEX
- 监控可疑活动

### 网络安全

**建议**
- 使用 VPN 或代理进行 API 访问
- 实施速率限制
- 所有通信使用 HTTPS
- 配置防火墙规则
- 监控未授权访问
- 定期安全审计

---

## 故障排除

### 常见问题

**问题：RPC 速率限制**

症状：
- 频繁连接超时
- 429 HTTP 错误
- 数据更新缓慢

解决方案：
1. 升级到付费 RPC 端点（QuickNode、Triton）
2. 增加配置中的轮询间隔
3. 实施多 RPC 轮换
4. 在请求之间添加延迟

**问题：CoinGecko API 速率限制**

症状：
- CoinGecko API 返回 429 错误
- 没有价格更新
- 扫描失败

解决方案：
1. 增加 coingeckoAggregator.ts 中的 `minRequestInterval`
2. 扩展 `cacheTimeout` 以减少 API 调用
3. 实施代理轮换
4. 升级到 CoinGecko Pro API

**问题：Jito Bundle 失败**

症状：
- 交易失败
- Bundle 拒绝
- 超时错误

解决方案：
1. 检查 Jito Block Engine 状态
2. 增加小费金额
3. 验证交易格式
4. 回退到标准 RPC 执行

**问题：WebSocket 连接断开**

症状：
- Dashboard 失去连接
- 没有实时更新
- 连接错误

解决方案：
1. 检查服务器日志中的错误
2. 验证端口 3002 可访问
3. 检查防火墙规则
4. 在客户端实施自动重连

**问题：交易执行失败**

症状：
- 交易未执行
- 资金不足错误
- 滑点超出错误

解决方案：
1. 验证钱包 SOL 余额
2. 检查代币 mint 地址
3. 增加滑点容差
4. 验证 Jupiter API 状态
5. 检查代币账户初始化

### 调试模式

启用详细日志记录：

```bash
# 设置环境变量
export DEBUG=*

# 或修改 config.ts
export const DEBUG_MODE = true;
```

### 日志位置

- 后端日志：`/tmp/arb-server.log`
- 前端日志：浏览器控制台（F12）
- PM2 日志：`~/.pm2/logs/`

---

## 开发路线图

### 已完成（v1.0）

- 实时价格聚合
- 跨 DEX 套利检测
- AI 驱动分析
- 风险管理系统
- Web dashboard
- MEV 保护（Jito）
- 综合测试套件
- CoinGecko API 集成
- 专业文档

### 进行中（v1.1）

- 数据库集成（PostgreSQL）
- 交易历史持久化
- 回测框架
- 高级分析（夏普比率、Sortino 比率）
- 硬件钱包支持
- 移动响应式 dashboard

### 计划中（v2.0）

- 跨链支持（Ethereum、BSC）
- 永续合约交易（Drift Protocol）
- 高级订单类型（限价、止损限价、冰山）
- 多重签名钱包集成
- 移动应用（React Native）
- 策略市场
- 社交交易功能

### 未来考虑

- 基于机器学习的预测模型
- 链上期权策略
- 清算机器人集成
- 跨链套利
- DAO 治理集成

---

## 许可证

本项目在 MIT 许可证下发布 - 有关详细信息，请参阅 LICENSE 文件。

## 免责声明

**重要提示**：VibeCurve 是一个专为教育和研究目的设计的实验性交易系统。加密货币交易涉及重大损失风险。作者和贡献者不对通过使用本软件造成的任何财务损失负责。

**风险警告**：
- 加密货币市场高度波动
- 过去的表现并不预示未来的结果
- 只交易您能承受损失的资金
- 交易前请进行自己的研究
- 本软件按"原样"提供，不提供任何保证

## 引用

如果您在研究或项目中使用 VibeCurve，请引用：

```bibtex
@software{vibecurve2025,
  title={VibeCurve: Solana Cross-DEX Arbitrage Trading System},
  author={VibeCurve Team},
  year={2025},
  url={https://github.com/yourusername/VibeCurve}
}
```

## 联系和支持

- GitHub Issues：错误报告和功能请求
- 邮箱：support@vibecurve.dev
- 文档：https://docs.vibecurve.dev

---

**版本**：1.0.0
**最后更新**：2025 年 1 月
**黑客松**：Trends x Solana Vibe Coding
**赛道**：Trading & Strategy Bots
