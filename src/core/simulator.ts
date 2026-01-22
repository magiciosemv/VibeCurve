// src/core/simulator.ts
export class Simulator {
  private entryPrice: number = 0;
  private inPosition: boolean = false;
  private tokens: number = 0;
  private pnlHistory: number[] = [];

  // 模拟买入
  public buy(price: number, amountSol: number) {
    if (this.inPosition) return;
    this.entryPrice = price;
    this.tokens = amountSol / price; // 简化计算
    this.inPosition = true;
    return `🚀 SIMULATION BUY @ ${price.toFixed(6)} SOL`;
  }

  // 模拟卖出
  public sell(price: number) {
    if (!this.inPosition) return;
    const pnl = (price - this.entryPrice) * this.tokens;
    this.pnlHistory.push(pnl);
    this.inPosition = false;
    this.tokens = 0;
    return `💰 SIMULATION SELL @ ${price.toFixed(6)} SOL | PnL: ${pnl.toFixed(4)} SOL`;
  }

  public getStatus(currentPrice: number) {
    if (!this.inPosition) return "IDLE";
    const unrealizedPnL = (currentPrice - this.entryPrice) * this.tokens;
    const color = unrealizedPnL >= 0 ? "+" : "";
    return `HOLDING | Entry: ${this.entryPrice.toFixed(6)} | PnL: ${color}${unrealizedPnL.toFixed(4)} SOL`;
  }
}

export const simulator = new Simulator();