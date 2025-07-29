import { Injectable } from '@angular/core';
import { CandleWithIndicators } from './indicators.service';
import { CombinedStrategyService, CombinedStrategyParams, CombinedStrategyResults } from './combined-strategy.service';
import { TradingCycle } from './cycle-manager.service';
import { Trade } from './long-strategy.service';
import { ShortTrade } from './short-strategy.service';

export interface TimeShiftParams {
  depositParts: number; // На сколько частей разбить депозит (по умолчанию 10)
  entryIntervalDays: number; // Через сколько дней входить следующей частью (по умолчанию 7)
  enabled: boolean; // Включен ли режим временных сдвигов
}

export interface DepositPartResult {
  partId: number; // Номер части депозита (1, 2, 3...)
  startOffset: number; // Смещение старта в днях от начала данных
  actualStartIndex: number; // Реальный индекс свечи, с которой началась торговля
  actualStartTime: string; // Реальное время старта торговли
  strategyResults: CombinedStrategyResults; // ОРИГИНАЛЬНЫЕ результаты торговли этой части (без масштабирования)
  depositFraction: number; // Доля от общего депозита (например, 0.1 для 10 частей)
}

export interface TimeShiftResults {
  enabled: boolean;
  params: TimeShiftParams;
  parts: DepositPartResult[];

  // Общие метрики по всем частям (С МАСШТАБИРОВАНИЕМ)
  totalRealizedPnl: number; // Суммарный реализованный PnL всех частей
  totalUnrealizedPnl: number; // Суммарный нереализованный PnL всех частей
  totalPnl: number; // Общий PnL
  weightedAverageReturn: number; // Средневзвешенная доходность

  // Статистики
  activeParts: number; // Количество активных частей
  totalCycles: number; // Общее количество циклов по всем частям
  totalClosedCycles: number;
  totalOpenCycles: number;
  totalForcedClosures: number;

  // Временные метрики
  firstEntryTime: string; // Время первого входа
  lastEntryTime: string; // Время последнего входа
  totalTradingDays: number; // Общее количество торговых дней
}

@Injectable({
  providedIn: 'root'
})
export class TimeShiftService {

  constructor(
    private combinedStrategy: CombinedStrategyService
  ) {}

  /**
   * Основная функция для тестирования стратегии с временными сдвигами
   */
  testStrategyWithTimeShifts(
    candles: CandleWithIndicators[],
    strategyParams: CombinedStrategyParams,
    timeShiftParams: TimeShiftParams
  ): TimeShiftResults {

    if (!timeShiftParams.enabled) {
      // Если временные сдвиги отключены, запускаем обычное тестирование
      const singleResult = this.combinedStrategy.testCombinedStrategy(candles, strategyParams);

      return {
        enabled: false,
        params: timeShiftParams,
        parts: [{
          partId: 1,
          startOffset: 0,
          actualStartIndex: 0,
          actualStartTime: candles[0]?.dateUTC2 || '',
          strategyResults: singleResult,
          depositFraction: 1.0
        }],
        totalRealizedPnl: singleResult.totalRealizedPnl,
        totalUnrealizedPnl: singleResult.totalUnrealizedPnl,
        totalPnl: singleResult.totalPnl,
        weightedAverageReturn: singleResult.totalPnl,
        activeParts: 1,
        totalCycles: singleResult.cycles.length,
        totalClosedCycles: singleResult.cycles.filter(c => !c.isActive).length,
        totalOpenCycles: singleResult.cycles.filter(c => c.isActive).length,
        totalForcedClosures: singleResult.forcedClosures,
        firstEntryTime: candles[0]?.dateUTC2 || '',
        lastEntryTime: candles[0]?.dateUTC2 || '',
        totalTradingDays: this.calculateTradingDays(candles)
      };
    }

    // Запускаем тестирование с временными сдвигами
    return this.runTimeShiftedBacktest(candles, strategyParams, timeShiftParams);
  }

  /**
   * Запуск бэктеста с временными сдвигами
   */
  private runTimeShiftedBacktest(
    candles: CandleWithIndicators[],
    strategyParams: CombinedStrategyParams,
    timeShiftParams: TimeShiftParams
  ): TimeShiftResults {

    const parts: DepositPartResult[] = [];
    const depositFraction = 1 / timeShiftParams.depositParts;

    console.log(`🕒 Starting time-shifted backtest:`);
    console.log(`  📊 Deposit parts: ${timeShiftParams.depositParts}`);
    console.log(`  ⏰ Entry interval: ${timeShiftParams.entryIntervalDays} days`);
    console.log(`  💰 Each part size: ${(depositFraction * 100).toFixed(1)}% of total deposit`);

    // Запускаем каждую часть депозита с соответствующим сдвигом
    for (let partId = 1; partId <= timeShiftParams.depositParts; partId++) {
      const startOffsetDays = (partId - 1) * timeShiftParams.entryIntervalDays;
      const startIndex = this.findStartIndex(candles, startOffsetDays);

      if (startIndex >= candles.length - 10) {
        // Если стартовый индекс слишком близко к концу данных, пропускаем эту часть
        console.log(`⚠️  Part ${partId}: Skipped (start index ${startIndex} too close to end, total candles: ${candles.length})`);
        continue;
      }

      // Создаем подмассив свечей начиная с нужного момента
      const partCandles = candles.slice(startIndex);

      console.log(`🚀 Part ${partId}: Starting from index ${startIndex} (${partCandles[0]?.dateUTC2}) with ${partCandles.length} candles`);

      // КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Запускаем стратегию БЕЗ масштабирования!
      // Каждая часть торгует как будто у неё 100% депозита
      const partResults = this.combinedStrategy.testCombinedStrategy(partCandles, strategyParams);

      // Сохраняем ОРИГИНАЛЬНЫЕ результаты
      const partResult: DepositPartResult = {
        partId,
        startOffset: startOffsetDays,
        actualStartIndex: startIndex,
        actualStartTime: partCandles[0]?.dateUTC2 || '',
        strategyResults: partResults, // БЕЗ масштабирования!
        depositFraction
      };

      parts.push(partResult);

      console.log(`✅ Part ${partId} completed: PnL ${partResults.totalPnl.toFixed(3)}% (${partResults.cycles.length} cycles)`);
    }

    // Рассчитываем общие метрики С МАСШТАБИРОВАНИЕМ
    return this.calculateAggregatedResults(parts, timeShiftParams, candles);
  }

  /**
   * Находит индекс свечи для старта торговли с учетом сдвига в днях
   */
  private findStartIndex(candles: CandleWithIndicators[], offsetDays: number): number {
    if (offsetDays === 0) {
      return 0;
    }

    const startTime = new Date(candles[0].dateUTC2!);
    const targetTime = new Date(startTime.getTime() + offsetDays * 24 * 60 * 60 * 1000);

    // Ищем ближайшую свечу к целевому времени
    for (let i = 0; i < candles.length; i++) {
      const candleTime = new Date(candles[i].dateUTC2!);
      if (candleTime >= targetTime) {
        return i;
      }
    }

    return candles.length - 1; // Если не найдено, возвращаем последний индекс
  }

  /**
   * Рассчитывает агрегированные результаты по всем частям депозита
   * ЗДЕСЬ ПРИМЕНЯЕТСЯ МАСШТАБИРОВАНИЕ!
   */
  private calculateAggregatedResults(
    parts: DepositPartResult[],
    params: TimeShiftParams,
    allCandles: CandleWithIndicators[]
  ): TimeShiftResults {

    if (parts.length === 0) {
      throw new Error('No active deposit parts found');
    }

    // КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Суммируем PnL с учетом доли каждой части в общем депозите
    const totalRealizedPnl = parts.reduce((sum, part) =>
      sum + (part.strategyResults.totalRealizedPnl * part.depositFraction), 0);

    const totalUnrealizedPnl = parts.reduce((sum, part) =>
      sum + (part.strategyResults.totalUnrealizedPnl * part.depositFraction), 0);

    const totalPnl = totalRealizedPnl + totalUnrealizedPnl;

    // Рассчитываем статистики (БЕЗ масштабирования - это количества)
    const totalCycles = parts.reduce((sum, part) => sum + part.strategyResults.cycles.length, 0);
    const totalClosedCycles = parts.reduce((sum, part) =>
      sum + part.strategyResults.cycles.filter(c => !c.isActive).length, 0);
    const totalOpenCycles = parts.reduce((sum, part) =>
      sum + part.strategyResults.cycles.filter(c => c.isActive).length, 0);
    const totalForcedClosures = parts.reduce((sum, part) => sum + part.strategyResults.forcedClosures, 0);

    // Временные метрики
    const entryTimes = parts.map(p => p.actualStartTime).sort();
    const firstEntryTime = entryTimes[0];
    const lastEntryTime = entryTimes[entryTimes.length - 1];

    const result: TimeShiftResults = {
      enabled: true,
      params,
      parts,
      totalRealizedPnl,
      totalUnrealizedPnl,
      totalPnl,
      weightedAverageReturn: totalPnl, // В данном случае равен общему PnL, так как все части равнозначны
      activeParts: parts.length,
      totalCycles,
      totalClosedCycles,
      totalOpenCycles,
      totalForcedClosures,
      firstEntryTime,
      lastEntryTime,
      totalTradingDays: this.calculateTradingDays(allCandles)
    };

    console.log(`📊 Time-shifted backtest completed:`);
    console.log(`  🏦 Active parts: ${result.activeParts}/${params.depositParts}`);
    console.log(`  💰 Total PnL: ${result.totalPnl.toFixed(3)}% (each part contributes ${(100/params.depositParts).toFixed(1)}%)`);
    console.log(`  🔄 Total cycles: ${result.totalCycles} (${result.totalClosedCycles} closed, ${result.totalOpenCycles} open)`);
    console.log(`  ⚡ Forced closures: ${result.totalForcedClosures}`);
    console.log(`  📅 Entry period: ${firstEntryTime} to ${lastEntryTime}`);

    return result;
  }

  /**
   * Рассчитывает количество торговых дней
   */
  private calculateTradingDays(candles: CandleWithIndicators[]): number {
    if (candles.length < 2) return 0;

    const startTime = new Date(candles[0].dateUTC2!);
    const endTime = new Date(candles[candles.length - 1].dateUTC2!);
    const diffTime = Math.abs(endTime.getTime() - startTime.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }
}
