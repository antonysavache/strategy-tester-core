import { Injectable } from '@angular/core';
import { CandleWithIndicators } from './indicators.service';

export interface StrategyParams {
  rsiOversold: number;
  minProfitPercent: number;
  averagingThreshold: number;
}

export interface Trade {
  direction: 'LONG';
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

  // НОВЫЕ ПОЛЯ: Контекст других позиций
  openShortOnEntry?: {
    entryPrice: number;
    entryTime: string;
    hasAveraging: boolean;
    unrealizedPnl?: number;
  };
  openShortOnExit?: {
    entryPrice: number;
    entryTime: string;
    hasAveraging: boolean;
    unrealizedPnl?: number;
  };
}

export interface EntrySignal {
  canEnterLong: boolean;
  timestamp: number;
  dateTime: string;
  close: number;
  ema: number;
  rsi_current: number;
  rsi_prev1: number;
  rsi_prev2: number;
  condition1_rsi_oversold: boolean;
  condition2_rsi_growing: boolean;
  condition3_price_below_ema: boolean;
  hasOpenTrade: boolean;
}

export interface AveragingSignal {
  direction: 'LONG';
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
export class LongStrategyService {

  testStrategy(candles: CandleWithIndicators[], params: StrategyParams) {
    const entrySignals: EntrySignal[] = [];
    const closedTrades: Trade[] = [];
    const averagingSignals: AveragingSignal[] = [];
    let openTrade: Trade | null = null;

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

        // PnL в процентах от депозита = (выход - средний_вход) / средний_вход * 100 * размер_позиции
        const currentPnlPercent = ((current.close - avgPrice) / avgPrice) * 100 * totalPositionSize;

        // Условие закрытия: цена коснулась EMA сверху вниз И профит >= minProfitPercent
        const priceHitEmaFromAbove = prev1.close > prev1.ema && current.close <= current.ema;
        const profitCondition = currentPnlPercent >= params.minProfitPercent;
        const shouldClose = priceHitEmaFromAbove && profitCondition;

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
            const priceDropPercent = ((openTrade.entryPrice - current.close) / openTrade.entryPrice) * 100;
            const priceCrossedEmaUpward = prev1.close <= prev1.ema && current.close > current.ema;
            const shouldAverage = priceDropPercent >= params.averagingThreshold && priceCrossedEmaUpward;

            if (shouldAverage) {
              openTrade.hasAveraging = true;
              openTrade.averagingPrice = current.close;
              openTrade.averagingTime = current.dateUTC2!;
              openTrade.averagingEma = current.ema;

              averagingSignals.push({
                direction: 'LONG',
                originalEntryPrice: openTrade.entryPrice,
                originalEntryTime: openTrade.entryTime,
                averagingPrice: current.close,
                averagingTime: current.dateUTC2!,
                priceChangePercent: priceDropPercent,
                newAveragePrice: (openTrade.entryPrice + current.close) / 2,
                ema: current.ema,
                rsi: current.rsi
              });
            }
          }

          openTrade.currentPrice = current.close;
          openTrade.currentTime = current.dateUTC2!;
          openTrade.unrealizedPnlPercent = currentPnlPercent;
        }
      }

      // Проверяем условия входа (только если нет открытой позиции)
      if (!openTrade) {
        const condition1 = prev1.rsi < params.rsiOversold;
        const condition2 = (current.rsi > prev1.rsi) && (prev1.rsi > prev2.rsi);
        const condition3 = current.ema > (current.close * 1.0015);
        const canEnter = condition1 && condition2 && condition3;

        const signal: EntrySignal = {
          canEnterLong: canEnter,
          timestamp: current.timestamp,
          dateTime: current.dateUTC2!,
          close: current.close,
          ema: current.ema,
          rsi_current: current.rsi,
          rsi_prev1: prev1.rsi,
          rsi_prev2: prev2.rsi,
          condition1_rsi_oversold: condition1,
          condition2_rsi_growing: condition2,
          condition3_price_below_ema: condition3,
          hasOpenTrade: false
        };

        entrySignals.push(signal);

        if (canEnter) {
          openTrade = {
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
        }
      } else {
        // Есть открытая позиция
        const signal: EntrySignal = {
          canEnterLong: false,
          timestamp: current.timestamp,
          dateTime: current.dateUTC2!,
          close: current.close,
          ema: current.ema,
          rsi_current: current.rsi,
          rsi_prev1: prev1.rsi,
          rsi_prev2: prev2.rsi,
          condition1_rsi_oversold: false,
          condition2_rsi_growing: false,
          condition3_price_below_ema: false,
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
