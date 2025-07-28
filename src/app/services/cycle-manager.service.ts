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

    // ИСПРАВЛЯЕМ: Пересчитываем realizedPnl из всех закрытых сделок
    const closedTrades = [
      ...currentCycle.longTrades.filter(t => t.exitTime), // Только закрытые
      ...currentCycle.shortTrades.filter(t => t.exitTime)  // Только закрытые
    ];

    currentCycle.realizedPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnlPercent || 0), 0);
  }

  checkCyclePnl(
    openLongTrade: Trade | null,
    openShortTrade: ShortTrade | null,
    currentCandle: CandleWithIndicators,
    commissionPercent: number = 0 // НОВОЕ: параметр комиссии для расчета net PnL
  ): CyclePnlCheck {
    const currentCycle = this.getCurrentCycle();

    // ИСПРАВЛЯЕМ: ВСЕГДА пересчитываем realizedPnl из всех закрытых сделок
    const closedTrades = [
      ...currentCycle.longTrades.filter(t => t.exitTime), // Только закрытые
      ...currentCycle.shortTrades.filter(t => t.exitTime)  // Только закрытые
    ];

    currentCycle.realizedPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnlPercent || 0), 0);

    // Рассчитываем текущую нереализованную прибыль от открытых позиций (с учетом комиссии)
    let currentUnrealizedPnl = 0;
    if (openLongTrade) {
      const avgPrice = openLongTrade.hasAveraging ?
        (openLongTrade.entryPrice + openLongTrade.averagingPrice!) / 2 :
        openLongTrade.entryPrice;
      const totalPositionSize = openLongTrade.hasAveraging ? 0.5 : 0.25;
      const grossPnl = ((currentCandle.close - avgPrice) / avgPrice) * 100 * totalPositionSize;
      const commission = commissionPercent * totalPositionSize;
      currentUnrealizedPnl += grossPnl - commission;
    }
    if (openShortTrade) {
      const avgPrice = openShortTrade.hasAveraging ?
        (openShortTrade.entryPrice + openShortTrade.averagingPrice!) / 2 :
        openShortTrade.entryPrice;
      const totalPositionSize = openShortTrade.hasAveraging ? 0.5 : 0.25;
      const grossPnl = ((avgPrice - currentCandle.close) / avgPrice) * 100 * totalPositionSize;
      const commission = commissionPercent * totalPositionSize;
      currentUnrealizedPnl += grossPnl - commission;
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
    reason: string = 'PROFIT_THRESHOLD_REACHED',
    commissionPercent: number = 0 // НОВОЕ: параметр комиссии
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
      const pnlBeforeCommission = ((currentCandle.close - avgPrice) / avgPrice) * 100 * totalPositionSize;
      const commission = commissionPercent * totalPositionSize;
      const pnlPercent = pnlBeforeCommission - commission;

      closedLong = {
        ...openLongTrade,
        exitTime: currentCandle.dateUTC2!,
        exitPrice: currentCandle.close,
        exitEma: currentCandle.ema,
        averagePrice: avgPrice,
        totalPositionSize,
        grossPnlPercent: pnlBeforeCommission, // НОВОЕ: валовая прибыль
        commissionRate: commissionPercent, // НОВОЕ: ставка комиссии
        commissionAmount: commission, // НОВОЕ: абсолютная сумма комиссии
        pnlPercent, // чистая прибыль
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

        // Логируем принудительное закрытие LONG
        const grossPnlForLong = pnlBeforeCommission;
        const commissionForLong = commission;
        this.logCycleEvent(
          'FORCE_CLOSE',
          `LONG closed: ${openLongTrade.entryPrice.toFixed(6)} → ${currentCandle.close.toFixed(6)} | Gross: ${grossPnlForLong >= 0 ? '+' : ''}${grossPnlForLong.toFixed(2)}% - Commission: ${commissionForLong.toFixed(2)}% = Net: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`,
          currentCandle,
          currentCandle.close,
          pnlPercent,
          null, // LONG закрыт
          openShortTrade
        );
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
      const pnlBeforeCommission = ((avgPrice - currentCandle.close) / avgPrice) * 100 * totalPositionSize;
      const commission = commissionPercent * totalPositionSize;
      const pnlPercent = pnlBeforeCommission - commission;

      closedShort = {
        ...openShortTrade,
        exitTime: currentCandle.dateUTC2!,
        exitPrice: currentCandle.close,
        exitEma: currentCandle.ema,
        averagePrice: avgPrice,
        totalPositionSize,
        grossPnlPercent: pnlBeforeCommission, // НОВОЕ: валовая прибыль
        commissionRate: commissionPercent, // НОВОЕ: ставка комиссии
        commissionAmount: commission, // НОВОЕ: абсолютная сумма комиссии
        pnlPercent, // чистая прибыль
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

        // Логируем принудительное закрытие SHORT
        const grossPnlForShort = pnlBeforeCommission;
        const commissionForShort = commission;
        this.logCycleEvent(
          'FORCE_CLOSE',
          `SHORT closed: ${openShortTrade.entryPrice.toFixed(6)} → ${currentCandle.close.toFixed(6)} | Gross: ${grossPnlForShort >= 0 ? '+' : ''}${grossPnlForShort.toFixed(2)}% - Commission: ${commissionForShort.toFixed(2)}% = Net: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`,
          currentCandle,
          currentCandle.close,
          pnlPercent,
          openLongTrade,
          null // SHORT закрыт
        );
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
    currentCandle: CandleWithIndicators,
    price?: number,
    pnl?: number,
    openLongTrade?: Trade | null,
    openShortTrade?: ShortTrade | null
  ): void {
    const currentCycle = this.getCurrentCycle();

    // Если это закрытие сделки, нужно обновить realizedPnL ПЕРЕД логированием
    if (action === 'LONG_CLOSED' || action === 'SHORT_CLOSED') {
      const closedTrades = [
        ...currentCycle.longTrades.filter(t => t.exitTime), // Только закрытые
        ...currentCycle.shortTrades.filter(t => t.exitTime)  // Только закрытые
      ];
      currentCycle.realizedPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnlPercent || 0), 0);
    }

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
      timestamp: currentCandle.dateUTC2!, // ИСПРАВЛЯЕМ: используем время свечи
      action,
      details,
      price,
      pnl,
      cycleRealizedPnl: currentCycle.realizedPnl, // Теперь это будет обновленное значение
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
