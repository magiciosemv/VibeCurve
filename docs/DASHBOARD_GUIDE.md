# Trading & Strategy Bots - Professional Dashboard

## Quick Start

### Option 1: Using the Launcher Script (Recommended)

```bash
./start-dashboard.sh
```

This will automatically start both the backend server and the frontend HTTP server.

### Option 2: Manual Start

**Terminal 1 - Backend Server:**
```bash
npx ts-node src/arbitrage-server.ts
```

**Terminal 2 - Frontend Server:**
```bash
cd client
python3 -m http.server 8080
```

Then open your browser to: `http://localhost:8080/pro-dashboard.html`

---

## Features

### 1. Professional Analytics Dashboard

The new professional dashboard provides:

- **Real-time Metrics**: Total trades, success rate, net profit, execution time
- **Live Charts**: Profit over time and performance visualization
- **AI-Powered Analysis**: DeepSeek AI integration for market insights
- **Opportunity Table**: Real-time arbitrage opportunities with detailed analysis
- **System Logs**: Comprehensive activity logging

### 2. AI Integration

The system uses DeepSeek AI API for:

- **Market Analysis**: Real-time market condition assessment
- **Risk Assessment**: AI-driven risk evaluation
- **Trading Recommendations**: Intelligent execution suggestions
- **Performance Optimization**: Continuous learning from trading history

### 3. Multi-DEX Monitoring

Continuously monitors price differences across:
- Jupiter Aggregator
- Raydium DEX
- Orca DEX
- Meteora DEX

### 4. Risk Management

- Configurable position sizing
- Slippage protection
- Minimum liquidity requirements
- Maximum drawdown limits
- Stop-loss/take-profit automation

---

## Dashboard Components

### Header Bar

- **System Status**: Real-time connection and running status
- **Server Status**: Backend connection health
- **Latency Indicator**: Network performance monitoring

### Control Panel

- **Start System**: Initialize the arbitrage monitoring system
- **Stop System**: Gracefully shutdown all monitoring
- **Scan Now**: Trigger immediate manual scan
- **Last Update**: Timestamp of most recent data refresh

### Metrics Cards

1. **Total Trades**: Number of executed trades
2. **Success Rate**: Percentage of successful trades
3. **Net Profit**: Total profit/loss in SOL
4. **Avg Execution Time**: Average trade execution speed

### Charts

1. **Profit Over Time**: Cumulative profit visualization
2. **Performance Metrics**: Success vs failure ratio

### AI Analysis Panel

Real-time AI insights including:
- Market analysis
- Risk assessment
- Trading recommendations
- Confidence levels

### Opportunities Table

Live arbitrage opportunities showing:
- Token symbol
- Trading path (DEX A → DEX B)
- Price spread percentage
- Estimated profit
- Available liquidity
- Confidence rating

### System Logs

Timestamped activity log with color-coded entries:
- Info: General system messages
- Success: Successful trades
- Error: Failed operations

---

## Configuration

### Environment Variables

Edit `.env` file to configure:

```bash
# Solana RPC
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Wallet
PRIVATE_KEY=your_private_key_here

# AI Configuration
AI_API_KEY=sk-your-deepseek-api-key
AI_API_URL=https://api.deepseek.com/v1/chat/completions

# Jito MEV Protection
JITO_BLOCK_ENGINE_URL=https://amsterdam.mainnet.block-engine.jito.wtf

# Telegram Notifications (Optional)
TG_BOT_TOKEN=your_bot_token
TG_CHAT_ID=your_chat_id
```

### System Parameters

Default parameters (configurable via API):

- **Scan Interval**: 10 seconds
- **Minimum Profit**: 0.3%
- **Minimum Liquidity**: 10 SOL
- **Trade Amount**: 0.05 SOL
- **Max Slippage**: 1%
- **Mode**: Simulation (safe testing)

---

## API Endpoints

### System Control

```bash
# Get system status
curl http://localhost:3002/api/status

# Get current configuration
curl http://localhost:3002/api/config

# Update configuration
curl -X POST http://localhost:3002/api/config \
  -H "Content-Type: application/json" \
  -d '{"minProfitPercent": 0.5, "tradeAmount": 0.1}'

# Start system
curl -X POST http://localhost:3002/api/start

# Stop system
curl -X POST http://localhost:3002/api/stop

# Manual scan
curl -X POST http://localhost:3002/api/scan

# Get trading history
curl http://localhost:3002/api/history

# AI analysis
curl -X POST http://localhost:3002/api/ai-analyze \
  -H "Content-Type: application/json" \
  -d '{"opportunity": {...}, "context": {...}}'
```

---

## Troubleshooting

### Server Won't Start

**Problem**: Port already in use
```bash
# Check what's using the port
lsof -i :3002
lsof -i :8080

# Kill the process
kill -9 <PID>
```

### AI Analysis Not Working

**Problem**: API key not configured
```bash
# Check .env file
cat .env | grep AI_API

# Test API key
curl https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### No Opportunities Found

**Problem**: APIs not accessible (network/firewall)

**Solution**: Configure proxy
```bash
export HTTP_PROXY=http://proxy.example.com:7890
export HTTPS_PROXY=http://proxy.example.com:7890
./start-dashboard.sh
```

### High Latency

**Problem**: Slow RPC response

**Solution**: Use faster RPC endpoint
- Try QuickNode, Triton, or Helius paid endpoints
- Free public RPCs are rate-limited

---

## Best Practices

### 1. Start with Simulation Mode

Always test in simulation mode first:
- Default: Enabled
- Verify all components working
- Monitor AI recommendations
- Check risk parameters

### 2. Monitor AI Insights

The AI provides valuable analysis:
- Read market analysis carefully
- Follow risk assessment
- Consider recommendations
- Track accuracy over time

### 3. Adjust Parameters

Optimize based on performance:
- Increase `minProfitPercent` for fewer but better opportunities
- Adjust `tradeAmount` based on risk tolerance
- Set `maxSlippage` according to market conditions
- Monitor `scanInterval` to balance speed vs resources

### 4. Risk Management

Never risk more than you can afford:
- Start with small amounts (0.01-0.05 SOL)
- Use stop-loss limits
- Diversify across multiple tokens
- Keep detailed records

### 5. Regular Monitoring

Check dashboard regularly:
- Review success rate
- Analyze profit trends
- Read AI recommendations
- Monitor system logs

---

## Advanced Features

### WebSocket Events

Real-time events pushed to frontend:

```javascript
socket.on('opportunity', (data) => {
  // New arbitrage opportunity detected
});

socket.on('executed', (result) => {
  // Trade execution completed
});

socket.on('stats-updated', (stats) => {
  // Performance statistics updated
});

socket.on('config-updated', (config) => {
  // System configuration changed
});
```

### Custom AI Prompts

Modify AI analysis by editing `src/arbitrage-server.ts`:

```typescript
const prompt = `Custom analysis prompt here...`;
const analysis = await getAiComment('custom', prompt);
```

### Automated Trading

**Warning**: Use with extreme caution

```typescript
// Enable automated execution
arbitrageSystem.updateConfig({
  autoExecute: true,
  simulationMode: false,  // Real trading!
  alertOnly: false
});
```

---

## Support & Documentation

- **Main README**: [README.md](../README.md)
- **Arbitrage Guide**: [ARBITRAGE_GUIDE.md](ARBITRAGE_GUIDE.md)
- **API Documentation**: See inline code comments
- **Test Reports**: [../tests/reports/](../tests/reports/)

---

## System Requirements

- **Node.js**: v20 LTS or higher
- **Memory**: 4GB RAM minimum
- **Network**: Stable internet connection
- **APIs**:
  - Solana RPC (free or paid)
  - DeepSeek AI API
  - Optional: Telegram Bot

---

## Security Notes

- Never commit `.env` file to version control
- Use hardware wallets for production
- Rotate API keys regularly
- Monitor for unauthorized access
- Keep private keys encrypted

---

## License

MIT License - See [LICENSE](../LICENSE) for details

---

**Version**: 1.1.0
**Last Updated**: January 2025
**Platform**: Trading & Strategy Bots - Professional Edition
