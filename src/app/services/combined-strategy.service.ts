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
        // ОТЛАДКА: Детальная информация о принудительном закрытии
        this.cycleManager.logCycleEvent(
          'FORCE_CLOSE',
          `Realized: ${cyclePnlCheck.currentCycleRealizedPnl.toFixed(2)}% + Unrealized: ${cyclePnlCheck.currentUnrealizedPnl.toFixed(2)}% = ${cyclePnlCheck.totalCurrentPnl.toFixed(2)}%`,
          current.close,
          cyclePnlCheck.totalCurrentPnl,
          openLongTrade,
          openShortTrade
        );

        // Принудительно закрываем все позиции и завершаем цикл
        const { closedLong, closedShort } = this.cycleManager.forceCloseCycle(
          openLongTrade,
          openShortTrade,
          current,
          'CYCLE_PROFIT_THRESHOLD_REACHED'
        );

        console.log(`  Positions after closing:`);
        if (closedLong) {
          this.cycleManager.logCycleEvent(
            'LONG_CLOSED',
            `Forced close: ${openLongTrade!.entryPrice} → ${current.close}`,
            current.close,
            closedLong.pnlPercent!,
            null,
            openShortTrade
          );
          longClosedTrades.push(closedLong);
          allClosedTrades.push(closedLong);
          openLongTrade = null;
        }

        if (closedShort) {
          this.cycleManager.logCycleEvent(
            'SHORT_CLOSED',
            `Forced close: ${openShortTrade!.entryPrice} → ${current.close}`,
            current.close,
            closedShort.pnlPercent!,
            openLongTrade,
            null
          );
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

          // НОВОЕ: Сохраняем контекст открытого шорта на момент закрытия
          openLongTrade.openShortOnExit = openShortTrade ? {
            entryPrice: openShortTrade.entryPrice,
            entryTime: openShortTrade.entryTime,
            hasAveraging: openShortTrade.hasAveraging,
            unrealizedPnl: openShortTrade.unrealizedPnlPercent
          } : undefined;

          longClosedTrades.push(openLongTrade);
          allClosedTrades.push(openLongTrade);
          this.cycleManager.addClosedTradeToCurrentCycle(openLongTrade);

          console.log(`📈 CYCLE ${this.cycleManager.getCurrentCycleStats().cycleNumber} - LONG CLOSED at ${current.dateUTC2}:`);
          console.log(`  Entry: ${openLongTrade.entryPrice} → Exit: ${current.close} | PnL: +${currentPnlPercent.toFixed(2)}%`);

          const cycleAfterClose = this.cycleManager.getCurrentCycleStats();
          console.log(`  Cycle Status: Realized ${cycleAfterClose.realizedPnl.toFixed(2)}% | Open: ${openShortTrade ? 'SHORT ' + openShortTrade.unrealizedPnlPercent?.toFixed(2) + '%' : 'none'}`);

          openLongTrade = null;

          // ИСПРАВЛЯЕМ: Проверяем принудительное закрытие СРАЗУ после закрытия сделки
          const postCloseCheck = this.cycleManager.checkCyclePnl(null, openShortTrade, current);
          if (postCloseCheck.shouldForceClose) {
            console.log(`🔄 CYCLE SHOULD CLOSE after LONG trade: Total PnL ${postCloseCheck.totalCurrentPnl.toFixed(2)}% > ${postCloseCheck.threshold}%`);

            // Принудительно закрываем оставшиеся позиции
            const { closedLong, closedShort } = this.cycleManager.forceCloseCycle(
              null, openShortTrade, current, 'CYCLE_PROFIT_THRESHOLD_REACHED'
            );

            if (closedShort) {
              shortClosedTrades.push(closedShort);
              allClosedTrades.push(closedShort);
              openShortTrade = null;
            }

            forcedClosures++;
            this.cycleManager.startNewCycle(current);
            continue;
          }
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

              // Логирование усреднения
              const newAvgPrice = (openLongTrade.entryPrice + current.close) / 2;
              this.cycleManager.logCycleEvent(
                'LONG_AVERAGING',
                `${openLongTrade.entryPrice} + ${current.close} = avg ${newAvgPrice.toFixed(2)} (drop ${priceDropPercent.toFixed(1)}%)`,
                current.close,
                undefined,
                openLongTrade,
                openShortTrade
              );
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

          // НОВОЕ: Сохраняем контекст открытого лонга на момент закрытия
          openShortTrade.openLongOnExit = openLongTrade ? {
            entryPrice: openLongTrade.entryPrice,
            entryTime: openLongTrade.entryTime,
            hasAveraging: openLongTrade.hasAveraging,
            unrealizedPnl: openLongTrade.unrealizedPnlPercent
          } : undefined;

          shortClosedTrades.push(openShortTrade);
          allClosedTrades.push(openShortTrade);
          this.cycleManager.addClosedTradeToCurrentCycle(openShortTrade);

          console.log(`📉 CYCLE ${this.cycleManager.getCurrentCycleStats().cycleNumber} - SHORT CLOSED at ${current.dateUTC2}:`);
          console.log(`  Entry: ${openShortTrade.entryPrice} → Exit: ${current.close} | PnL: +${currentPnlPercent.toFixed(2)}%`);

          const cycleAfterClose = this.cycleManager.getCurrentCycleStats();
          console.log(`  Cycle Status: Realized ${cycleAfterClose.realizedPnl.toFixed(2)}% | Open: ${openLongTrade ? 'LONG ' + openLongTrade.unrealizedPnlPercent?.toFixed(2) + '%' : 'none'}`);

          openShortTrade = null;

          // ИСПРАВЛЯЕМ: Проверяем принудительное закрытие СРАЗУ после закрытия сделки
          const postCloseCheck = this.cycleManager.checkCyclePnl(openLongTrade, null, current);
          if (postCloseCheck.shouldForceClose) {
            console.log(`🔄 CYCLE SHOULD CLOSE after SHORT trade: Total PnL ${postCloseCheck.totalCurrentPnl.toFixed(2)}% > ${postCloseCheck.threshold}%`);

            // Принудительно закрываем оставшиеся позиции
            const { closedLong, closedShort } = this.cycleManager.forceCloseCycle(
              openLongTrade, null, current, 'CYCLE_PROFIT_THRESHOLD_REACHED'
            );

            if (closedLong) {
              longClosedTrades.push(closedLong);
              allClosedTrades.push(closedLong);
              openLongTrade = null;
            }

            forcedClosures++;
            this.cycleManager.startNewCycle(current);
            continue;
          }
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

              // Логирование усреднения
              const newAvgPrice = (openShortTrade.entryPrice + current.close) / 2;
              this.cycleManager.logCycleEvent(
                'SHORT_AVERAGING',
                `${openShortTrade.entryPrice} + ${current.close} = avg ${newAvgPrice.toFixed(2)} (rise ${priceRisePercent.toFixed(1)}%)`,
                current.close,
                undefined,
                openLongTrade,
                openShortTrade
              );
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
            unrealizedPnlPercent: 0,
            // НОВОЕ: Сохраняем контекст открытого шорта
            openShortOnEntry: openShortTrade ? {
              entryPrice: openShortTrade.entryPrice,
              entryTime: openShortTrade.entryTime,
              hasAveraging: openShortTrade.hasAveraging,
              unrealizedPnl: openShortTrade.unrealizedPnlPercent
            } : undefined
          };

          this.cycleManager.addTradeToCurrentCycle(openLongTrade);

          // Логирование входа
          this.cycleManager.logCycleEvent(
            'LONG_ENTRY',
            `Entry: ${current.close} | RSI: ${current.rsi.toFixed(1)}`,
            current.close,
            0,
            openLongTrade,
            openShortTrade
          );
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
            unrealizedPnlPercent: 0,
            // НОВОЕ: Сохраняем контекст открытого лонга
            openLongOnEntry: openLongTrade ? {
              entryPrice: openLongTrade.entryPrice,
              entryTime: openLongTrade.entryTime,
              hasAveraging: openLongTrade.hasAveraging,
              unrealizedPnl: openLongTrade.unrealizedPnlPercent
            } : undefined
          };

          this.cycleManager.addTradeToCurrentCycle(openShortTrade);

          // Логирование входа
          this.cycleManager.logCycleEvent(
            'SHORT_ENTRY',
            `Entry: ${current.close} | RSI: ${current.rsi.toFixed(1)}`,
            current.close,
            0,
            openLongTrade,
            openShortTrade
          );
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
