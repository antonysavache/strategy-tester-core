import { Injectable } from '@angular/core';
import { CandleWithIndicators } from './indicators.service';
import { LongStrategyService, StrategyParams, Trade } from './long-strategy.service';
import { ShortStrategyService, ShortStrategyParams, ShortTrade } from './short-strategy.service';
import { CycleManagerService, TradingCycle, CyclePnlCheck } from './cycle-manager.service';

export interface CombinedStrategyParams {
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  minProfitPercent: number;
  averagingThreshold: number;
  cycleProfitThreshold: number; // 0.5% по умолчанию
}

export interface CombinedStrategyResults {
  cycles: TradingCycle[];
  totalClosedTrades: (Trade | ShortTrade)[];
  longClosedTrades: Trade[];
  shortClosedTrades: ShortTrade[];
  currentOpenLong: Trade | null;
  currentOpenShort: ShortTrade | null;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  forcedClosures: number;
  cycleStats: Array<{
    cycleId: number;
    pnl: number;
    trades: number;
    forceClosed: boolean;
  }>;
}

@Injectable({
  providedIn: 'root'
})
export class CombinedStrategyService {

  constructor(
    private longStrategy: LongStrategyService,
    private shortStrategy: ShortStrategyService,
    private cycleManager: CycleManagerService
  ) {}

  testCombinedStrategy(
    candles: CandleWithIndicators[],
    params: CombinedStrategyParams
  ): CombinedStrategyResults {

    // Сброс состояния
    this.cycleManager.resetCycles();
    this.cycleManager.setProfitThreshold(params.cycleProfitThreshold);

    const longParams: StrategyParams = {
      rsiOversold: params.rsiOversold,
      minProfitPercent: params.minProfitPercent,
      averagingThreshold: params.averagingThreshold
    };

    const shortParams: ShortStrategyParams = {
      rsiOverbought: params.rsiOverbought,
      minProfitPercent: params.minProfitPercent,
      averagingThreshold: params.averagingThreshold
    };

    let openLongTrade: Trade | null = null;
    let openShortTrade: ShortTrade | null = null;
    let allClosedTrades: (Trade | ShortTrade)[] = [];
    let longClosedTrades: Trade[] = [];
    let shortClosedTrades: ShortTrade[] = [];
    let forcedClosures = 0;

    // Стартуем первый цикл
    this.cycleManager.startNewCycle(candles[0]);

    for (let i = 2; i < candles.length; i++) {
      const current = candles[i];
      const prev1 = candles[i - 1];
      const prev2 = candles[i - 2];

      if (!current.rsi || !prev1.rsi || !prev2.rsi || !current.ema || !prev1.ema) {
        continue;
      }

      // Обновляем нереализованный PnL для открытых позиций
      if (openLongTrade) {
        const avgPrice = openLongTrade.hasAveraging ?
          (openLongTrade.entryPrice + openLongTrade.averagingPrice!) / 2 :
          openLongTrade.entryPrice;
        const totalPositionSize = openLongTrade.hasAveraging ? 0.5 : 0.25;
        openLongTrade.unrealizedPnlPercent = ((current.close - avgPrice) / avgPrice) * 100 * totalPositionSize;
        openLongTrade.currentPrice = current.close;
        openLongTrade.currentTime = current.dateUTC2!;
      }

      if (openShortTrade) {
        const avgPrice = openShortTrade.hasAveraging ?
          (openShortTrade.entryPrice + openShortTrade.averagingPrice!) / 2 :
          openShortTrade.entryPrice;
        const totalPositionSize = openShortTrade.hasAveraging ? 0.5 : 0.25;
        openShortTrade.unrealizedPnlPercent = ((avgPrice - current.close) / avgPrice) * 100 * totalPositionSize;
        openShortTrade.currentPrice = current.close;
        openShortTrade.currentTime = current.dateUTC2!;
      }

      // Проверяем условие принудительного закрытия цикла
      const cyclePnlCheck: CyclePnlCheck = this.cycleManager.checkCyclePnl(
        openLongTrade,
        openShortTrade,
        current
      );

      if (cyclePnlCheck.shouldForceClose) {
        // Принудительно закрываем все позиции и завершаем цикл
        const { closedLong, closedShort } = this.cycleManager.forceCloseCycle(
          openLongTrade,
          openShortTrade,
          current,
          'CYCLE_PROFIT_THRESHOLD_REACHED'
        );

        if (closedLong) {
          longClosedTrades.push(closedLong);
          allClosedTrades.push(closedLong);
          openLongTrade = null;
        }

        if (closedShort) {
          shortClosedTrades.push(closedShort);
          allClosedTrades.push(closedShort);
          openShortTrade = null;
        }

        forcedClosures++;

        // Стартуем новый цикл
        this.cycleManager.startNewCycle(current);

        console.log(`🔄 CYCLE FORCED CLOSURE at ${current.dateUTC2}: Total PnL ${cyclePnlCheck.totalCurrentPnl.toFixed(2)}% > ${cyclePnlCheck.threshold}%`);
        continue;
      }

      // Обычная логика закрытия лонговой позиции
      if (openLongTrade) {
        const avgPrice = openLongTrade.hasAveraging ?
          (openLongTrade.entryPrice + openLongTrade.averagingPrice!) / 2 :
          openLongTrade.entryPrice;
        const totalPositionSize = openLongTrade.hasAveraging ? 0.5 : 0.25;
        const currentPnlPercent = ((current.close - avgPrice) / avgPrice) * 100 * totalPositionSize;

        const priceHitEmaFromAbove = prev1.close > prev1.ema && current.close <= current.ema;
        const profitCondition = currentPnlPercent >= params.minProfitPercent;

        if (priceHitEmaFromAbove && profitCondition) {
          openLongTrade.exitTime = current.dateUTC2!;
          openLongTrade.exitPrice = current.close;
          openLongTrade.exitEma = current.ema;
          openLongTrade.averagePrice = avgPrice;
          openLongTrade.totalPositionSize = totalPositionSize;
          openLongTrade.pnlPercent = currentPnlPercent;
          openLongTrade.reason = 'EMA_TOUCH_WITH_PROFIT';

          longClosedTrades.push(openLongTrade);
          allClosedTrades.push(openLongTrade);
          this.cycleManager.addClosedTradeToCurrentCycle(openLongTrade);

          openLongTrade = null;
        } else {
          // Проверяем усреднение для лонга
          if (!openLongTrade.hasAveraging) {
            const priceDropPercent = ((openLongTrade.entryPrice - current.close) / openLongTrade.entryPrice) * 100;
            const priceCrossedEmaUpward = prev1.close <= prev1.ema && current.close > current.ema;

            if (priceDropPercent >= params.averagingThreshold && priceCrossedEmaUpward) {
              openLongTrade.hasAveraging = true;
              openLongTrade.averagingPrice = current.close;
              openLongTrade.averagingTime = current.dateUTC2!;
              openLongTrade.averagingEma = current.ema;
            }
          }
        }
      }

      // Обычная логика закрытия шортовой позиции
      if (openShortTrade) {
        const avgPrice = openShortTrade.hasAveraging ?
          (openShortTrade.entryPrice + openShortTrade.averagingPrice!) / 2 :
          openShortTrade.entryPrice;
        const totalPositionSize = openShortTrade.hasAveraging ? 0.5 : 0.25;
        const currentPnlPercent = ((avgPrice - current.close) / avgPrice) * 100 * totalPositionSize;

        const priceHitEmaFromBelow = prev1.close < prev1.ema && current.close >= current.ema;
        const profitCondition = currentPnlPercent >= params.minProfitPercent;

        if (priceHitEmaFromBelow && profitCondition) {
          openShortTrade.exitTime = current.dateUTC2!;
          openShortTrade.exitPrice = current.close;
          openShortTrade.exitEma = current.ema;
          openShortTrade.averagePrice = avgPrice;
          openShortTrade.totalPositionSize = totalPositionSize;
          openShortTrade.pnlPercent = currentPnlPercent;
          openShortTrade.reason = 'EMA_TOUCH_WITH_PROFIT';

          shortClosedTrades.push(openShortTrade);
          allClosedTrades.push(openShortTrade);
          this.cycleManager.addClosedTradeToCurrentCycle(openShortTrade);

          openShortTrade = null;
        } else {
          // Проверяем усреднение для шорта
          if (!openShortTrade.hasAveraging) {
            const priceRisePercent = ((current.close - openShortTrade.entryPrice) / openShortTrade.entryPrice) * 100;
            const priceCrossedEmaDownward = prev1.close >= prev1.ema && current.close < current.ema;

            if (priceRisePercent >= params.averagingThreshold && priceCrossedEmaDownward) {
              openShortTrade.hasAveraging = true;
              openShortTrade.averagingPrice = current.close;
              openShortTrade.averagingTime = current.dateUTC2!;
              openShortTrade.averagingEma = current.ema;
            }
          }
        }
      }

      // Логика входа в лонг (только если нет открытой лонг позиции)
      if (!openLongTrade) {
        const condition1 = prev1.rsi < params.rsiOversold;
        const condition2 = (current.rsi > prev1.rsi) && (prev1.rsi > prev2.rsi);
        const condition3 = current.ema > (current.close * 1.0015);

        if (condition1 && condition2 && condition3) {
          openLongTrade = {
            direction: 'LONG',
            entryTime: current.dateUTC2!,
            entryPrice: current.close,
            entryEma: current.ema,
            entryRsi: current.rsi,
            hasAveraging: false,
            currentPrice: current.close,
            currentTime: current.dateUTC2!,
            unrealizedPnlPercent: 0
          };

          this.cycleManager.addTradeToCurrentCycle(openLongTrade);
        }
      }

      // Логика входа в шорт (только если нет открытой шорт позиции)
      if (!openShortTrade) {
        const condition1 = prev1.rsi > params.rsiOverbought;
        const condition2 = (current.rsi < prev1.rsi) && (prev1.rsi < prev2.rsi);
        const condition3 = current.ema < (current.close * 0.9985);

        if (condition1 && condition2 && condition3) {
          openShortTrade = {
            direction: 'SHORT',
            entryTime: current.dateUTC2!,
            entryPrice: current.close,
            entryEma: current.ema,
            entryRsi: current.rsi,
            hasAveraging: false,
            currentPrice: current.close,
            currentTime: current.dateUTC2!,
            unrealizedPnlPercent: 0
          };

          this.cycleManager.addTradeToCurrentCycle(openShortTrade);
        }
      }
    }

    // ИСПРАВЛЯЕМ: Цикл остается открытым, если есть открытые позиции
    const currentCycle = this.cycleManager.getCurrentCycle();
    if (currentCycle.isActive && !openLongTrade && !openShortTrade) {
      // Закрываем цикл только если нет открытых позиций
      currentCycle.isActive = false;
      currentCycle.endTime = candles[candles.length - 1].dateUTC2!;
    } else if (currentCycle.isActive && (openLongTrade || openShortTrade)) {
      // Обновляем нереализованный PnL для открытого цикла
      const lastCandle = candles[candles.length - 1];
      this.cycleManager.checkCyclePnl(openLongTrade, openShortTrade, lastCandle);
      console.log(`🔄 CYCLE REMAINS OPEN: ${openLongTrade ? 'Long' : ''}${openLongTrade && openShortTrade ? '+' : ''}${openShortTrade ? 'Short' : ''} positions still active`);
    }

    // Подсчитываем итоговые метрики
    const totalRealizedPnl = allClosedTrades.reduce((sum, trade) => sum + (trade.pnlPercent || 0), 0);
    let totalUnrealizedPnl = 0;
    if (openLongTrade?.unrealizedPnlPercent) {
      totalUnrealizedPnl += openLongTrade.unrealizedPnlPercent;
    }
    if (openShortTrade?.unrealizedPnlPercent) {
      totalUnrealizedPnl += openShortTrade.unrealizedPnlPercent;
    }

    const cycles = this.cycleManager.getAllCycles();
    const cycleStats = cycles.map(cycle => ({
      cycleId: cycle.id,
      pnl: cycle.finalPnl || cycle.realizedPnl,
      trades: cycle.longTrades.length + cycle.shortTrades.length,
      forceClosed: cycle.forceClosed
    }));

    return {
      cycles,
      totalClosedTrades: allClosedTrades,
      longClosedTrades,
      shortClosedTrades,
      currentOpenLong: openLongTrade,
      currentOpenShort: openShortTrade,
      totalRealizedPnl,
      totalUnrealizedPnl,
      totalPnl: totalRealizedPnl + totalUnrealizedPnl,
      forcedClosures,
      cycleStats
    };
  }
}
