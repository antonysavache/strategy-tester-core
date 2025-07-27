import { Injectable } from '@angular/core';
import { CandleData } from './market-data.service';

export interface CandleWithIndicators extends CandleData {
  rsi?: number;
  ema?: number;
}

@Injectable({
  providedIn: 'root'
})
export class IndicatorsService {

  calculateRSI(candles: CandleWithIndicators[], period: number): void {
    if (candles.length < period + 1) return;

    const gains: number[] = [];
    const losses: number[] = [];

    // Вычисляем изменения цен
    for (let i = 1; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) {
        gains.push(change);
        losses.push(0);
      } else {
        gains.push(0);
        losses.push(Math.abs(change));
      }
    }

    let avgGain = 0;
    let avgLoss = 0;

    // Первые period значений - простое среднее
    for (let i = 0; i < period; i++) {
      avgGain += gains[i];
      avgLoss += losses[i];
    }
    avgGain = avgGain / period;
    avgLoss = avgLoss / period;

    // Устанавливаем первое значение RSI
    if (avgLoss === 0) {
      candles[period].rsi = 100;
    } else {
      const rs = avgGain / avgLoss;
      candles[period].rsi = 100 - (100 / (1 + rs));
    }

    // Последующие значения - сглаженное среднее (Wilder's smoothing)
    for (let i = period + 1; i < candles.length; i++) {
      const gainIndex = i - 1;
      
      avgGain = (avgGain * (period - 1) + gains[gainIndex]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[gainIndex]) / period;

      if (avgLoss === 0) {
        candles[i].rsi = 100;
      } else {
        const rs = avgGain / avgLoss;
        candles[i].rsi = 100 - (100 / (1 + rs));
      }
    }

    // Устанавливаем undefined для первых period свечек
    for (let i = 0; i < period; i++) {
      candles[i].rsi = undefined;
    }
  }

  calculateEMA(candles: CandleWithIndicators[], period: number): void {
    const multiplier = 2 / (period + 1);

    for (let i = 0; i < candles.length; i++) {
      if (i === 0) {
        candles[i].ema = candles[i].close;
      } else {
        candles[i].ema = (candles[i].close * multiplier) + (candles[i - 1].ema! * (1 - multiplier));
      }
    }
  }
}
