/**
 * Strategy Executor Tests
 *
 * 测试策略执行器的核心功能
 */

import { expect } from 'chai';
import { StrategyExecutor, TradingStrategy, StrategyType } from '../src/core/strategyExecutor';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

describe('StrategyExecutor', () => {
  let executor: StrategyExecutor;
  let connection: Connection;
  let wallet: Keypair;

  before(() => {
    // 创建测试连接
    connection = new Connection('https://api.devnet.solana.com');

    // 创建测试钱包
    wallet = Keypair.generate();

    // 创建策略执行器
    executor = new StrategyExecutor(connection, wallet, {
      maxPositionSize: 0.5,
      maxTotalPosition: 2.0,
      minPositionSize: 0.01,
      stopLossPercentage: 0.15,
      takeProfitPercentage: 0.30,
      trailingStopPercentage: 0.10,
      maxDailyLoss: 1.0,
      maxDrawdown: 0.20,
      maxOpenPositions: 3,
      minLiquidity: 5.0,
      maxSlippage: 0.05,
      maxTradesPerHour: 10,
      cooldownPeriod: 30
    });
  });

  after(() => {
    executor.cleanup();
  });

  describe('createStrategy', () => {
    it('should create a DCA strategy', async () => {
      const strategyData = {
        type: 'DCA' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        intervals: 10,
        intervalSeconds: 3600,
        stopLoss: 0.15,
        takeProfit: 0.30,
        riskLevel: 'moderate' as const
      };

      const strategy = await executor.createStrategy(strategyData);

      expect(strategy).to.have.property('id');
      expect(strategy.type).to.equal('DCA');
      expect(strategy.tokenSymbol).to.equal('BONK');
      expect(strategy.totalAmount).to.equal(1.0);
      expect(strategy.intervals).to.equal(10);
      expect(strategy.enabled).to.be.true;
    });

    it('should create a Grid strategy', async () => {
      const strategyData = {
        type: 'GRID' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        intervals: 5,
        stopLoss: 0.15,
        takeProfit: 0.30,
        riskLevel: 'moderate' as const
      };

      const strategy = await executor.createStrategy(strategyData);

      expect(strategy.type).to.equal('GRID');
      expect(strategy.intervals).to.equal(5);
    });

    it('should create a Momentum strategy', async () => {
      const strategyData = {
        type: 'MOMENTUM' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        stopLoss: 0.15,
        takeProfit: 0.30,
        riskLevel: 'aggressive' as const
      };

      const strategy = await executor.createStrategy(strategyData);

      expect(strategy.type).to.equal('MOMENTUM');
      expect(strategy.riskLevel).to.equal('aggressive');
    });

    it('should create a Mean Reversion strategy', async () => {
      const strategyData = {
        type: 'MEAN_REVERSION' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        stopLoss: 0.15,
        takeProfit: 0.30,
        riskLevel: 'conservative' as const
      };

      const strategy = await executor.createStrategy(strategyData);

      expect(strategy.type).to.equal('MEAN_REVERSION');
      expect(strategy.riskLevel).to.equal('conservative');
    });
  });

  describe('getStrategies', () => {
    it('should return all strategies', async () => {
      // 创建多个策略
      await executor.createStrategy({
        type: 'DCA' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        intervals: 10,
        intervalSeconds: 3600,
        riskLevel: 'moderate' as const
      });

      await executor.createStrategy({
        type: 'GRID' as StrategyType,
        tokenMint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
        tokenSymbol: 'WIF',
        totalAmount: 0.5,
        intervals: 5,
        riskLevel: 'moderate' as const
      });

      const strategies = executor.getStrategies();

      expect(strategies).to.have.lengthOf(2);
      expect(strategies[0].tokenSymbol).to.equal('BONK');
      expect(strategies[1].tokenSymbol).to.equal('WIF');
    });
  });

  describe('getStrategyStatus', () => {
    it('should return strategy status', async () => {
      const strategy = await executor.createStrategy({
        type: 'DCA' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        intervals: 10,
        intervalSeconds: 3600,
        riskLevel: 'moderate' as const
      });

      const status = executor.getStrategyStatus(strategy.id);

      expect(status).to.exist;
      expect(status!.strategyId).to.equal(strategy.id);
      expect(status!.status).to.equal('IDLE');
      expect(status!.progress).to.equal(0);
      expect(status!.executedAmount).to.equal(0);
      expect(status!.remainingAmount).to.equal(1.0);
    });
  });

  describe('deleteStrategy', () => {
    it('should delete a strategy', async () => {
      const strategy = await executor.createStrategy({
        type: 'DCA' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        intervals: 10,
        intervalSeconds: 3600,
        riskLevel: 'moderate' as const
      });

      // 删除策略
      executor.deleteStrategy(strategy.id);

      // 验证策略已删除
      const strategies = executor.getStrategies();
      const deletedStrategy = strategies.find(s => s.id === strategy.id);

      expect(deletedStrategy).to.not.exist;
    });
  });

  describe('stopStrategy', () => {
    it('should stop a running strategy', async () => {
      const strategy = await executor.createStrategy({
        type: 'DCA' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        intervals: 10,
        intervalSeconds: 3600,
        riskLevel: 'moderate' as const
      });

      // 启动策略
      await executor.startStrategy(strategy.id);

      // 停止策略
      executor.stopStrategy(strategy.id);

      // 验证策略已停止
      const status = executor.getStrategyStatus(strategy.id);
      expect(status!.status).to.equal('PAUSED');
    });
  });

  describe('event handling', () => {
    it('should emit events', async () => {
      let eventReceived = false;

      executor.on({
        strategyId: '',
        type: 'CREATED',
        timestamp: 0
      }, (event) => {
        eventReceived = true;
        expect(event.type).to.equal('CREATED');
      });

      await executor.createStrategy({
        type: 'DCA' as StrategyType,
        tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        tokenSymbol: 'BONK',
        totalAmount: 1.0,
        intervals: 10,
        intervalSeconds: 3600,
        riskLevel: 'moderate' as const
      });

      expect(eventReceived).to.be.true;
    });
  });
});
