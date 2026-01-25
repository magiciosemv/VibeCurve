export class Simulator {
  private entryPrice: number = 0;
  private inPosition: boolean = false;
  private tokens: number = 0;

  public buy(price: number, amountSol: number) {
    if (this.inPosition) return null;
    this.entryPrice = price;
    this.tokens = amountSol / price;
    this.inPosition = true;
    return `🚀 SIMULATION BUY @ ${price.toFixed(8)} SOL`;
  }

  public sell(price: number) {
    if (!this.inPosition) return null;
    const pnl = (price - this.entryPrice) * this.tokens;
    this.inPosition = false;
    this.tokens = 0;
    const color = pnl >= 0 ? "+" : "";
    return `💰 SIMULATION SELL | PnL: ${color}${pnl.toFixed(4)} SOL`;
  }

  public getStatus(currentPrice: number) {
    if (!this.inPosition) return "IDLE";
    const unrealizedPnL = (currentPrice - this.entryPrice) * this.tokens;
    const color = unrealizedPnL >= 0 ? "+" : "";
    return `HOLDING | Entry: ${this.entryPrice.toFixed(8)}\nPnL: ${color}${unrealizedPnL.toFixed(4)} SOL`;
  }
}

export const simulator = new Simulator();