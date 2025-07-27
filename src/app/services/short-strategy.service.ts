import { Injectable } from '@angular/core';
import { CandleWithIndicators } from './indicators.service';

export interface ShortStrategyParams {
  rsiOverbought: number;
  minProfitPercent: number;
  averagingThreshold: number;
}

export interface ShortTrade {
  direction: 'SHORT';
  entryTime: string;
  entryPrice: number;
  entryEma: number;
  entryRsi: number;
  hasAveraging: boolean;
  averagingPrice?: number;
  averagingTime?: string;
  averagingEma?: number;
  exitTime?: string;
  exitPrice?: number;
  exitEma?: number;
  averagePrice?: number;
  totalPositionSize?: number; // 0.25 (25%) или 0.5 (50%)
  pnlPercent?: number; // PnL в процентах от депозита
  reason?: string;
  currentPrice?: number;
  currentTime?: string;
  unrealizedPnlPercent?: number;
}

export interface ShortEntrySignal {
  canEnterShort: boolean;
  timestamp: number;
  dateTime: string;
  close: number;
  ema: number;
  rsi_current: number;
  rsi_prev1: number;
  rsi_prev2: number;
  condition1_rsi_overbought: boolean;
  condition2_rsi_falling: boolean;
  condition3_price_above_ema: boolean;
  hasOpenTrade: boolean;
}

export interface ShortAveragingSignal {
  direction: 'SHORT';
  originalEntryPrice: number;
  originalEntryTime: string;
  averagingPrice: number;
  averagingTime: string;
  priceChangePercent: number;
  newAveragePrice: number;
  ema: number;
  rsi: number;
}

@Injectable({
  providedIn: 'root'
})
export class ShortStrategyService {

  testStrategy(candles: CandleWithIndicators[], params: ShortStrategyParams) {
    const entrySignals: ShortEntrySignal[] = [];
    const closedTrades: ShortTrade[] = [];
    const averagingSignals: ShortAveragingSignal[] = [];
    let openTrade: ShortTrade | null = null;

    for (let i = 2; i < candles.length; i++) {
      const current = candles[i];
      const prev1 = candles[i - 1];
      const prev2 = candles[i - 2];

      if (!current.rsi || !prev1.rsi || !prev2.rsi || !current.ema || !prev1.ema) {
        continue;
      }

      // Проверяем условия закрытия позиции
      if (openTrade) {
        let avgPrice: number;
        let totalPositionSize: number;

        if (openTrade.hasAveraging) {
          // С усреднением: 25% + 25% = 50% депозита
          avgPrice = (openTrade.entryPrice + openTrade.averagingPrice!) / 2;
          totalPositionSize = 0.5; // 50% депозита
        } else {
          // Без усреднения: 25% депозита
          avgPrice = openTrade.entryPrice;
          totalPositionSize = 0.25; // 25% депозита
        }

        // PnL для шорта в процентах от депозита = (средний_вход - выход) / средний_вход * 100 * размер_позиции
        const currentPnlPercent = ((avgPrice - current.close) / avgPrice) * 100 * totalPositionSize;

        // Условие закрытия: цена коснулась EMA снизу вверх И профит >= minProfitPercent
        const priceHitEmaFromBelow = prev1.close < prev1.ema && current.close >= current.ema;
        const profitCondition = currentPnlPercent >= params.minProfitPercent;
        const shouldClose = priceHitEmaFromBelow && profitCondition;

        if (shouldClose) {
          openTrade.exitTime = current.dateUTC2!;
          openTrade.exitPrice = current.close;
          openTrade.exitEma = current.ema;
          openTrade.averagePrice = avgPrice;
          openTrade.totalPositionSize = totalPositionSize;
          openTrade.pnlPercent = currentPnlPercent;
          openTrade.reason = 'EMA_TOUCH_WITH_PROFIT';
          closedTrades.push(openTrade);
          openTrade = null;
        } else {
          // Проверяем условия усреднения
          if (!openTrade.hasAveraging) {
            const priceRisePercent = ((current.close - openTrade.entryPrice) / openTrade.entryPrice) * 100;
            const priceCrossedEmaDownward = prev1.close >= prev1.ema && current.close < current.ema;
            const shouldAverage = priceRisePercent >= params.averagingThreshold && priceCrossedEmaDownward;

            if (shouldAverage) {
              openTrade.hasAveraging = true;
              openTrade.averagingPrice = current.close;
              openTrade.averagingTime = current.dateUTC2!;
              openTrade.averagingEma = current.ema;

              averagingSignals.push({
                direction: 'SHORT',
                originalEntryPrice: openTrade.entryPrice,
                originalEntryTime: openTrade.entryTime,
                averagingPrice: current.close,
                averagingTime: current.dateUTC2!,
                priceChangePercent: priceRisePercent,
                newAveragePrice: (openTrade.entryPrice + current.close) / 2,
                ema: current.ema,
                rsi: current.rsi
              });
            }
          }

          openTrade.currentPrice = current.close;
          openTrade.currentTime = current.dateUTC2!;
          openTrade.unrealizedPnlPercent = currentPnlPercent; // Уже учитывает размер позиции
        }
      }

      // Проверяем условия входа (только если нет открытой позиции)
      if (!openTrade) {
        const condition1 = prev1.rsi > params.rsiOverbought; // RSI > 65
        const condition2 = (current.rsi < prev1.rsi) && (prev1.rsi < prev2.rsi); // RSI падает
        const condition3 = current.ema < (current.close * 0.9985); // Цена выше EMA на 0.15%+
        const canEnter = condition1 && condition2 && condition3;

        const signal: ShortEntrySignal = {
          canEnterShort: canEnter,
          timestamp: current.timestamp,
          dateTime: current.dateUTC2!,
          close: current.close,
          ema: current.ema,
          rsi_current: current.rsi,
          rsi_prev1: prev1.rsi,
          rsi_prev2: prev2.rsi,
          condition1_rsi_overbought: condition1,
          condition2_rsi_falling: condition2,
          condition3_price_above_ema: condition3,
          hasOpenTrade: false
        };

        entrySignals.push(signal);

        if (canEnter) {
          openTrade = {
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
        }
      } else {
        // Есть открытая позиция
        const signal: ShortEntrySignal = {
          canEnterShort: false,
          timestamp: current.timestamp,
          dateTime: current.dateUTC2!,
          close: current.close,
          ema: current.ema,
          rsi_current: current.rsi,
          rsi_prev1: prev1.rsi,
          rsi_prev2: prev2.rsi,
          condition1_rsi_overbought: false,
          condition2_rsi_falling: false,
          condition3_price_above_ema: false,
          hasOpenTrade: true
        };
        entrySignals.push(signal);
      }
    }

    return {
      entrySignals,
      closedTrades,
      averagingSignals,
      openTrade
    };
  }
}
