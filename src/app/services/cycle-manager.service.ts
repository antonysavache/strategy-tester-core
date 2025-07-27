import { Injectable } from '@angular/core';
import { Trade } from './long-strategy.service';
import { ShortTrade } from './short-strategy.service';
import { CandleWithIndicators } from './indicators.service';

export interface TradingCycle {
  id: number;
  startTime: string;
  endTime?: string;
  longTrades: Trade[];
  shortTrades: ShortTrade[];
  realizedPnl: number; // Сумма PnL всех закрытых сделок в цикле
  unrealizedPnl: number; // Текущий нереализованный PnL всех открытых позиций
  isActive: boolean;
  forceClosed: boolean; // Закрыт принудительно по достижению 0.5%
  finalPnl?: number;
}

export interface CyclePnlCheck {
  currentCycleRealizedPnl: number;
  currentUnrealizedPnl: number;
  totalCurrentPnl: number;
  shouldForceClose: boolean;
  threshold: number;
}

@Injectable({
  providedIn: 'root'
})
export class CycleManagerService {
  private cycles: TradingCycle[] = [];
  private currentCycleId = 0;
  private profitThresholdPercent = 0.5; // 0.5% порог для принудительного закрытия

  getCurrentCycle(): TradingCycle {
    let activeCycle = this.cycles.find(c => c.isActive);

    if (!activeCycle) {
      // Создаем новый цикл
      activeCycle = {
        id: ++this.currentCycleId,
        startTime: new Date().toISOString(),
        longTrades: [],
        shortTrades: [],
        realizedPnl: 0,
        unrealizedPnl: 0,
        isActive: true,
        forceClosed: false
      };
      this.cycles.push(activeCycle);
    }

    return activeCycle;
  }

  addTradeToCurrentCycle(trade: Trade | ShortTrade): void {
    const currentCycle = this.getCurrentCycle();

    if (trade.direction === 'LONG') {
      currentCycle.longTrades.push(trade as Trade);
    } else {
      currentCycle.shortTrades.push(trade as ShortTrade);
    }
  }

  addClosedTradeToCurrentCycle(trade: Trade | ShortTrade): void {
    const currentCycle = this.getCurrentCycle();

    // Добавляем PnL закрытой сделки к реализованной прибыли цикла
    currentCycle.realizedPnl += (trade.pnlPercent || 0);
  }

  checkCyclePnl(
    openLongTrade: Trade | null,
    openShortTrade: ShortTrade | null,
    currentCandle: CandleWithIndicators
  ): CyclePnlCheck {
    const currentCycle = this.getCurrentCycle();

    // Рассчитываем текущую нереализованную прибыль
    let currentUnrealizedPnl = 0;
    if (openLongTrade?.unrealizedPnlPercent) {
      currentUnrealizedPnl += openLongTrade.unrealizedPnlPercent;
    }
    if (openShortTrade?.unrealizedPnlPercent) {
      currentUnrealizedPnl += openShortTrade.unrealizedPnlPercent;
    }

    // ИСПРАВЛЯЕМ: обновляем нереализованный PnL в активном цикле
    currentCycle.unrealizedPnl = currentUnrealizedPnl;

    // Общий PnL цикла = реализованная прибыль + нереализованная прибыль
    const totalCurrentPnl = currentCycle.realizedPnl + currentUnrealizedPnl;

    // Проверяем, нужно ли принудительно закрывать позиции
    const shouldForceClose = totalCurrentPnl > this.profitThresholdPercent;

    return {
      currentCycleRealizedPnl: currentCycle.realizedPnl,
      currentUnrealizedPnl,
      totalCurrentPnl,
      shouldForceClose,
      threshold: this.profitThresholdPercent
    };
  }

  forceCloseCycle(
    openLongTrade: Trade | null,
    openShortTrade: ShortTrade | null,
    currentCandle: CandleWithIndicators,
    reason: string = 'PROFIT_THRESHOLD_REACHED'
  ): { closedLong: Trade | null, closedShort: ShortTrade | null } {
    const currentCycle = this.getCurrentCycle();

    let closedLong: Trade | null = null;
    let closedShort: ShortTrade | null = null;

    // Принудительно закрываем лонг позицию
    if (openLongTrade) {
      const avgPrice = openLongTrade.hasAveraging ?
        (openLongTrade.entryPrice + openLongTrade.averagingPrice!) / 2 :
        openLongTrade.entryPrice;
      const totalPositionSize = openLongTrade.hasAveraging ? 0.5 : 0.25;
      const pnlPercent = ((currentCandle.close - avgPrice) / avgPrice) * 100 * totalPositionSize;

      closedLong = {
        ...openLongTrade,
        exitTime: currentCandle.dateUTC2!,
        exitPrice: currentCandle.close,
        exitEma: currentCandle.ema,
        averagePrice: avgPrice,
        totalPositionSize,
        pnlPercent,
        reason: reason
      };

      // ИСПРАВЛЯЕМ: Добавляем закрытую сделку в массив сделок цикла
      // Находим и обновляем существующую сделку или добавляем новую
      const existingLongIndex = currentCycle.longTrades.findIndex(t =>
        t.entryTime === openLongTrade.entryTime && t.entryPrice === openLongTrade.entryPrice
      );

      if (existingLongIndex !== -1) {
        // Обновляем существующую сделку
        currentCycle.longTrades[existingLongIndex] = closedLong;
      } else {
        // Добавляем новую закрытую сделку
        currentCycle.longTrades.push(closedLong);
      }

      // ИСПРАВЛЯЕМ: НЕ добавляем к realizedPnl для лонга - будет пересчитан из всех сделок
    }

    // Принудительно закрываем шорт позицию
    if (openShortTrade) {
      const avgPrice = openShortTrade.hasAveraging ?
        (openShortTrade.entryPrice + openShortTrade.averagingPrice!) / 2 :
        openShortTrade.entryPrice;
      const totalPositionSize = openShortTrade.hasAveraging ? 0.5 : 0.25;
      const pnlPercent = ((avgPrice - currentCandle.close) / avgPrice) * 100 * totalPositionSize;

      closedShort = {
        ...openShortTrade,
        exitTime: currentCandle.dateUTC2!,
        exitPrice: currentCandle.close,
        exitEma: currentCandle.ema,
        averagePrice: avgPrice,
        totalPositionSize,
        pnlPercent,
        reason: reason
      };

      // ИСПРАВЛЯЕМ: Добавляем закрытую сделку в массив сделок цикла
      // Находим и обновляем существующую сделку или добавляем новую
      const existingShortIndex = currentCycle.shortTrades.findIndex(t =>
        t.entryTime === openShortTrade.entryTime && t.entryPrice === openShortTrade.entryPrice
      );

      if (existingShortIndex !== -1) {
        // Обновляем существующую сделку
        currentCycle.shortTrades[existingShortIndex] = closedShort;
      } else {
        // Добавляем новую закрытую сделку
        currentCycle.shortTrades.push(closedShort);
      }

      // ИСПРАВЛЯЕМ: НЕ добавляем к realizedPnl для лонга - будет пересчитан из всех сделок
    }

    // ИСПРАВЛЯЕМ: Пересчитываем realizedPnl из всех сделок цикла
    currentCycle.realizedPnl = [
      ...currentCycle.longTrades,
      ...currentCycle.shortTrades
    ].reduce((sum, trade) => sum + (trade.pnlPercent || 0), 0);

    // Закрываем текущий цикл
    currentCycle.isActive = false;
    currentCycle.endTime = currentCandle.dateUTC2!;
    currentCycle.forceClosed = true;
    currentCycle.finalPnl = currentCycle.realizedPnl;

    return { closedLong, closedShort };
  }

  startNewCycle(currentCandle: CandleWithIndicators): TradingCycle {
    // Убеждаемся, что предыдущий цикл закрыт
    const currentCycle = this.cycles.find(c => c.isActive);
    if (currentCycle) {
      currentCycle.isActive = false;
      currentCycle.endTime = currentCandle.dateUTC2!;
    }

    // Создаем новый цикл
    const newCycle: TradingCycle = {
      id: ++this.currentCycleId,
      startTime: currentCandle.dateUTC2!,
      longTrades: [],
      shortTrades: [],
      realizedPnl: 0,
      unrealizedPnl: 0,
      isActive: true,
      forceClosed: false
    };

    this.cycles.push(newCycle);
    return newCycle;
  }

  getAllCycles(): TradingCycle[] {
    return [...this.cycles];
  }

  getCurrentCycleStats(): {
    cycleNumber: number;
    realizedPnl: number;
    tradesCount: number;
    isActive: boolean;
  } {
    const currentCycle = this.getCurrentCycle();
    return {
      cycleNumber: currentCycle.id,
      realizedPnl: currentCycle.realizedPnl,
      tradesCount: currentCycle.longTrades.length + currentCycle.shortTrades.length,
      isActive: currentCycle.isActive
    };
  }

  resetCycles(): void {
    this.cycles = [];
    this.currentCycleId = 0;
  }

  setProfitThreshold(thresholdPercent: number): void {
    this.profitThresholdPercent = thresholdPercent;
  }

  getProfitThreshold(): number {
    return this.profitThresholdPercent;
  }
}
