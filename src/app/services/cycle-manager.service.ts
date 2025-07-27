import { Injectable } from '@angular/core';
import { Trade } from './long-strategy.service';
import { ShortTrade } from './short-strategy.service';
import { CandleWithIndicators } from './indicators.service';

export interface TradingCycleLog {
  timestamp: string;
  action: 'CYCLE_START' | 'LONG_ENTRY' | 'SHORT_ENTRY' | 'LONG_AVERAGING' | 'SHORT_AVERAGING' | 'LONG_CLOSED' | 'SHORT_CLOSED' | 'FORCE_CLOSE' | 'CYCLE_END';
  details: string;
  price?: number;
  pnl?: number;
  cycleRealizedPnl?: number;
  openPositions?: string;
}

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
  logs: TradingCycleLog[]; // НОВОЕ: логи событий цикла
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
        forceClosed: false,
        logs: [] // НОВОЕ: инициализируем пустой массив логов
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

    // ИСПРАВЛЯЕМ: НЕ добавляем к realizedPnl, а только помечаем сделку как закрытую
    // realizedPnl будет пересчитан из всех закрытых сделок в checkCyclePnl
  }

  checkCyclePnl(
    openLongTrade: Trade | null,
    openShortTrade: ShortTrade | null,
    currentCandle: CandleWithIndicators
  ): CyclePnlCheck {
    const currentCycle = this.getCurrentCycle();

    // ИСПРАВЛЯЕМ: ВСЕГДА пересчитываем realizedPnl из всех закрытых сделок
    const closedTrades = [
      ...currentCycle.longTrades.filter(t => t.exitTime), // Только закрытые
      ...currentCycle.shortTrades.filter(t => t.exitTime)  // Только закрытые
    ];

    currentCycle.realizedPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnlPercent || 0), 0);

    // Рассчитываем текущую нереализованную прибыль от открытых позиций
    let currentUnrealizedPnl = 0;
    if (openLongTrade?.unrealizedPnlPercent) {
      currentUnrealizedPnl += openLongTrade.unrealizedPnlPercent;
    }
    if (openShortTrade?.unrealizedPnlPercent) {
      currentUnrealizedPnl += openShortTrade.unrealizedPnlPercent;
    }

    // Обновляем нереализованный PnL в цикле
    currentCycle.unrealizedPnl = currentUnrealizedPnl;

    // Общий PnL цикла = реализованный (из закрытых сделок) + нереализованный (от открытых)
    const totalCurrentPnl = currentCycle.realizedPnl + currentUnrealizedPnl;

    // ИСПРАВЛЯЕМ: ПРАВИЛЬНАЯ логика принудительного закрытия цикла
    // Цикл закрывается ТОЛЬКО когда общий PnL > Cycle Profit Threshold (0.5%)
    // 1) Все сделки закрыты в плюс и реализованный PnL > 0.5%
    // 2) 1 сделка открыта в минус, реализованный PnL по закрытым больше текущего минуса на 0.5%
    // 3) 1 сделка открыта в плюс, реализованный + нереализованный > 0.5%
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

      // ИСПРАВЛЯЕМ: Ищем открытую сделку и обновляем её, НЕ добавляем дубликат
      const existingLongIndex = currentCycle.longTrades.findIndex(t =>
        t.entryTime === openLongTrade.entryTime &&
        t.entryPrice === openLongTrade.entryPrice &&
        !t.exitTime // Только открытые сделки
      );

      if (existingLongIndex !== -1) {
        // Обновляем существующую ОТКРЫТУЮ сделку
        currentCycle.longTrades[existingLongIndex] = closedLong;
      } else {
        console.error('❌ FORCE CLOSE: Could not find open LONG trade to close!', {
          searchFor: { entryTime: openLongTrade.entryTime, entryPrice: openLongTrade.entryPrice },
          existingTrades: currentCycle.longTrades.map(t => ({ entryTime: t.entryTime, entryPrice: t.entryPrice, exitTime: t.exitTime }))
        });
      }
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

      // ИСПРАВЛЯЕМ: Ищем открытую сделку и обновляем её, НЕ добавляем дубликат
      const existingShortIndex = currentCycle.shortTrades.findIndex(t =>
        t.entryTime === openShortTrade.entryTime &&
        t.entryPrice === openShortTrade.entryPrice &&
        !t.exitTime // Только открытые сделки
      );

      if (existingShortIndex !== -1) {
        // Обновляем существующую ОТКРЫТУЮ сделку
        currentCycle.shortTrades[existingShortIndex] = closedShort;
      } else {
        console.error('❌ FORCE CLOSE: Could not find open SHORT trade to close!', {
          searchFor: { entryTime: openShortTrade.entryTime, entryPrice: openShortTrade.entryPrice },
          existingTrades: currentCycle.shortTrades.map(t => ({ entryTime: t.entryTime, entryPrice: t.entryPrice, exitTime: t.exitTime }))
        });
      }
    }

    // ИСПРАВЛЯЕМ: Пересчитываем realizedPnl из всех закрытых сделок цикла
    const allClosedTrades = [
      ...currentCycle.longTrades.filter(t => t.exitTime),
      ...currentCycle.shortTrades.filter(t => t.exitTime)
    ];
    currentCycle.realizedPnl = allClosedTrades.reduce((sum, trade) => sum + (trade.pnlPercent || 0), 0);

    // Закрываем текущий цикл
    currentCycle.isActive = false;
    currentCycle.endTime = currentCandle.dateUTC2!;
    currentCycle.forceClosed = true;
    currentCycle.finalPnl = currentCycle.realizedPnl;

    console.log(`🔄 CYCLE ${currentCycle.id} FORCE CLOSED: ${allClosedTrades.length} closed trades, Final PnL: ${currentCycle.finalPnl.toFixed(3)}%`);

    return { closedLong, closedShort };
  }

  startNewCycle(currentCandle: CandleWithIndicators): TradingCycle {
    // Убеждаемся, что предыдущий цикл закрыт
    const currentCycle = this.cycles.find(c => c.isActive);
    if (currentCycle) {
      currentCycle.isActive = false;
      currentCycle.endTime = currentCandle.dateUTC2!;

      // Логируем окончание цикла
      currentCycle.logs.push({
        timestamp: currentCandle.dateUTC2!,
        action: 'CYCLE_END',
        details: `Final PnL: ${(currentCycle.finalPnl || currentCycle.realizedPnl).toFixed(3)}%`,
        cycleRealizedPnl: currentCycle.finalPnl || currentCycle.realizedPnl,
        openPositions: 'none'
      });
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
      forceClosed: false,
      logs: [{
        timestamp: currentCandle.dateUTC2!,
        action: 'CYCLE_START',
        details: 'Cycle started',
        cycleRealizedPnl: 0,
        openPositions: 'none'
      }]
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

  addLogToCurrentCycle(log: TradingCycleLog): void {
    const currentCycle = this.getCurrentCycle();
    currentCycle.logs.push(log);
  }

  logCycleEvent(
    action: TradingCycleLog['action'],
    details: string,
    price?: number,
    pnl?: number,
    openLongTrade?: Trade | null,
    openShortTrade?: ShortTrade | null
  ): void {
    const currentCycle = this.getCurrentCycle();

    // Формируем строку открытых позиций
    let openPositions = '';
    if (openLongTrade && openShortTrade) {
      openPositions = `LONG ${openLongTrade.unrealizedPnlPercent?.toFixed(2)}%, SHORT ${openShortTrade.unrealizedPnlPercent?.toFixed(2)}%`;
    } else if (openLongTrade) {
      openPositions = `LONG ${openLongTrade.unrealizedPnlPercent?.toFixed(2)}%`;
    } else if (openShortTrade) {
      openPositions = `SHORT ${openShortTrade.unrealizedPnlPercent?.toFixed(2)}%`;
    } else {
      openPositions = 'none';
    }

    const log: TradingCycleLog = {
      timestamp: new Date().toISOString(),
      action,
      details,
      price,
      pnl,
      cycleRealizedPnl: currentCycle.realizedPnl,
      openPositions
    };

    this.addLogToCurrentCycle(log);
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
