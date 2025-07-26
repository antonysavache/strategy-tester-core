import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi?: number;
  ema?: number;
  dateUTC2?: string;
}

@Component({
  selector: 'app-technical-indicators',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <h2>SOLETH Technical Analysis</h2>

      <div class="upload-section">
        <input type="file" (change)="onFileSelected($event)" accept=".csv" />
        <button (click)="processData()" [disabled]="!csvData">Calculate Indicators</button>
      </div>

      <div class="strategy-params" *ngIf="csvData">
        <h3>Strategy Parameters</h3>
        <div class="param-row">
          <label for="rsiPeriod">RSI Period:</label>
          <input type="number" id="rsiPeriod" [(ngModel)]="rsiPeriod" min="2" max="50" />
        </div>
        <div class="param-row">
          <label for="rsiOversold">RSI Oversold Level:</label>
          <input type="number" id="rsiOversold" [(ngModel)]="rsiOversold" min="10" max="40" step="0.1" />
        </div>
        <div class="param-row">
          <label for="rsiOverbought">RSI Overbought Level:</label>
          <input type="number" id="rsiOverbought" [(ngModel)]="rsiOverbought" min="60" max="90" step="0.1" />
        </div>
        <div class="param-row">
          <label for="minProfit">Min Profit %:</label>
          <input type="number" id="minProfit" [(ngModel)]="minProfitPercent" min="0.1" max="5" step="0.1" />
        </div>
        <div class="param-row">
          <label for="avgThreshold">Averaging Threshold %:</label>
          <input type="number" id="avgThreshold" [(ngModel)]="averagingThreshold" min="0.1" max="5" step="0.1" />
        </div>
        <button (click)="processData()" class="recalculate-btn">Recalculate with New Parameters</button>
      </div>

      <div class="stats" *ngIf="candles.length > 0">
        <p>Total candles: {{ candles.length }}</p>
        <p>RSI Period: {{ rsiPeriod }}</p>
        <p>RSI Oversold: {{ rsiOversold }}</p>
        <p>Min Profit: {{ minProfitPercent }}%</p>
        <p>Averaging Threshold: {{ averagingThreshold }}%</p>
        <p>EMA Period: 183</p>
      </div>

      <div class="table-container" *ngIf="candles.length > 0">
        <table>
          <thead>
            <tr>
              <th>Time (UTC+2)</th>
              <th>Open</th>
              <th>High</th>
              <th>Low</th>
              <th>Close</th>
              <th>Volume</th>
              <th>RSI ({{ rsiPeriod }})</th>
              <th>EMA (183)</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let candle of candles; trackBy: trackByTimestamp">
              <td>{{ candle.dateUTC2 }}</td>
              <td>{{ candle.open | number:'1.6-6' }}</td>
              <td>{{ candle.high | number:'1.6-6' }}</td>
              <td>{{ candle.low | number:'1.6-6' }}</td>
              <td>{{ candle.close | number:'1.6-6' }}</td>
              <td>{{ candle.volume | number:'1.3-3' }}</td>
              <td>{{ candle.rsi ? (candle.rsi | number:'1.2-2') : '-' }}</td>
              <td>{{ candle.ema ? (candle.ema | number:'1.6-6') : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .container {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .upload-section {
      margin-bottom: 20px;
    }

    .upload-section input {
      margin-right: 10px;
      padding: 8px;
    }

    .upload-section button {
      padding: 8px 16px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .upload-section button:disabled {
      background-color: #6c757d;
      cursor: not-allowed;
    }

    .stats {
      background-color: #f8f9fa;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .table-container {
      overflow-x: auto;
      max-height: 600px;
      overflow-y: auto;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th, td {
      padding: 8px;
      text-align: right;
      border-bottom: 1px solid #ddd;
      white-space: nowrap;
    }

    th {
      background-color: #f8f9fa;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    tr:hover {
      background-color: #f5f5f5;
    }

    .strategy-params {
      background-color: #f8f9fa;
      padding: 20px;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .strategy-params h3 {
      margin-top: 0;
      margin-bottom: 15px;
      color: #333;
    }

    .param-row {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
    }

    .param-row label {
      width: 150px;
      font-weight: 500;
    }

    .param-row input {
      padding: 5px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      width: 80px;
    }

    .recalculate-btn {
      padding: 8px 16px;
      background-color: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 10px;
    }

    .recalculate-btn:hover {
      background-color: #218838;
    }
  `]
})
export class TechnicalIndicatorsComponent {
  csvData: string = '';
  candles: CandleData[] = [];

  // Параметры стратегии
  rsiPeriod: number = 10;
  rsiOversold: number = 35;
  rsiOverbought: number = 70;
  minProfitPercent: number = 0.5;
  averagingThreshold: number = 0.5;

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.csvData = e.target?.result as string;
      };
      reader.readAsText(file);
    }
  }

  processData(): void {
    if (!this.csvData) return;

    // Parse CSV
    const lines = this.csvData.trim().split('\n');
    const headers = lines[0].split(',');

    const rawCandles: CandleData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const candle: CandleData = {
        timestamp: parseInt(values[0]),
        open: parseFloat(values[1]),
        high: parseFloat(values[2]),
        low: parseFloat(values[3]),
        close: parseFloat(values[4]),
        volume: parseFloat(values[5])
      };

      // Convert timestamp to UTC+2
      const date = new Date(candle.timestamp);
      date.setHours(date.getHours() + 2); // Add 2 hours for UTC+2
      candle.dateUTC2 = date.toISOString().replace('T', ' ').substring(0, 19);

      rawCandles.push(candle);
    }

    // Calculate RSI
    this.calculateRSI(rawCandles, this.rsiPeriod);

    // Calculate EMA
    this.calculateEMA(rawCandles, 183);

    // Backtester - check entry conditions
    this.backtestEntryConditions(rawCandles);

    this.candles = rawCandles;
  }

  private calculateRSI(candles: CandleData[], period: number): void {
    if (candles.length < period + 1) return;

    // Массивы для хранения gains и losses
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
      const gainIndex = i - 1; // индекс в массиве gains/losses

      // Wilder's smoothing: новое_среднее = (старое_среднее * (period-1) + новое_значение) / period
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

  // EMA как на TradingView (начинаем с первой цены)
  private calculateEMA(candles: CandleData[], period: number): void {
    const multiplier = 2 / (period + 1);

    for (let i = 0; i < candles.length; i++) {
      if (i === 0) {
        candles[i].ema = candles[i].close;
      } else {
        candles[i].ema = (candles[i].close * multiplier) + (candles[i - 1].ema! * (1 - multiplier));
      }
    }
  }

  // Backtester для проверки условий входа в лонг и управления позициями
  private backtestEntryConditions(candles: CandleData[]): void {
    const entrySignals = [];
    const closedTrades = [];
    let openTrade: any = null;

    for (let i = 2; i < candles.length; i++) { // начинаем с 2, чтобы иметь RSI[2], RSI[1], RSI[0]
      const current = candles[i];     // текущая свеча (RSI[0])
      const prev1 = candles[i - 1];   // предыдущая свеча (RSI[1])
      const prev2 = candles[i - 2];   // свеча до предыдущей (RSI[2])

      // Пропускаем если нет всех необходимых данных
      if (!current.rsi || !prev1.rsi || !prev2.rsi || !current.ema || !prev1.ema) {
        continue;
      }

      // Проверяем условия закрытия позиции (если позиция открыта)
      if (openTrade) {
        const avgPrice = openTrade.hasAveraging ?
          (openTrade.entryPrice + openTrade.averagingPrice) / 2 :
          openTrade.entryPrice;
        const currentPnlPercent = ((current.close - avgPrice) / avgPrice) * 100;

        // Условие закрытия: цена коснулась EMA сверху вниз И профит >= minProfitPercent
        const priceHitEmaFromAbove = prev1.close > prev1.ema && current.close <= current.ema;
        const profitCondition = currentPnlPercent >= this.minProfitPercent;
        const shouldClose = priceHitEmaFromAbove && profitCondition;

        if (shouldClose) {
          // Закрываем сделку
          const closedTrade = {
            ...openTrade,
            exitTime: current.dateUTC2,
            exitPrice: current.close,
            exitEma: current.ema,
            averagePrice: avgPrice,
            pnlPercent: currentPnlPercent,
            reason: 'EMA_TOUCH_WITH_PROFIT'
          };
          closedTrades.push(closedTrade);
          openTrade = null;
        } else {
          // Проверяем условия усреднения (если еще не усреднялись)
          if (!openTrade.hasAveraging) {
            const priceDropPercent = ((openTrade.entryPrice - current.close) / openTrade.entryPrice) * 100;
            const priceCrossedEmaUpward = prev1.close <= prev1.ema && current.close > current.ema;
            const shouldAverage = priceDropPercent >= this.averagingThreshold && priceCrossedEmaUpward;

            if (shouldAverage) {
              openTrade.hasAveraging = true;
              openTrade.averagingPrice = current.close;
              openTrade.averagingTime = current.dateUTC2;
              openTrade.averagingEma = current.ema;
            }
          }

          // Обновляем текущую позицию
          openTrade.currentPrice = current.close;
          openTrade.currentTime = current.dateUTC2;
          openTrade.unrealizedPnlPercent = currentPnlPercent;
        }
      }

      // Проверяем условия входа (только если нет открытой позиции)
      if (!openTrade) {
        // УСЛОВИЯ ВХОДА В ЛОНГ:
        // 1. RSI предыдущей свечи < rsiOversold (зона перепроданности)
        const condition1 = prev1.rsi < this.rsiOversold;

        // 2. RSI растет: RSI[0] > RSI[1] > RSI[2] (каждая следующая свеча выше предыдущей)
        const condition2 = (current.rsi > prev1.rsi) && (prev1.rsi > prev2.rsi);

        // 3. Цена ниже EMA: EMA > close * 1.0015 (EMA выше цены на 0.15%+)
        const condition3 = current.ema > (current.close * 1.0015);

        // Проверяем все условия
        const canEnter = condition1 && condition2 && condition3;

        const signal = {
          canEnterLong: canEnter,
          timestamp: current.timestamp,
          dateTime: current.dateUTC2,
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

        // Если условия выполнены, открываем позицию
        if (canEnter) {
          openTrade = {
            entryTime: current.dateUTC2,
            entryPrice: current.close,
            entryEma: current.ema,
            entryRsi: current.rsi,
            hasAveraging: false,
            averagingPrice: null,
            averagingTime: null,
            averagingEma: null,
            currentPrice: current.close,
            currentTime: current.dateUTC2,
            unrealizedPnlPercent: 0
          };
        }
      } else {
        // Есть открытая позиция, просто записываем что сделка активна
        const signal = {
          canEnterLong: false,
          timestamp: current.timestamp,
          dateTime: current.dateUTC2,
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

    // Выводим в консоль все результаты
    console.log('=== BACKTEST RESULTS ===');
    console.log(`Total candles analyzed: ${entrySignals.length}`);
    console.log(`Entry signals found: ${entrySignals.filter(s => s.canEnterLong).length}`);
    console.log(`Closed trades: ${closedTrades.length}`);
    console.log('--- ENTRY SIGNALS ---');
    console.log(entrySignals.filter(s => s.canEnterLong));
    console.log('--- CLOSED TRADES ---');
    console.log(closedTrades);
    console.log('--- OPEN TRADE ---');
    console.log(openTrade);
    console.log('--- ALL SIGNALS ---');
    console.log(entrySignals);
  }

  trackByTimestamp(index: number, candle: CandleData): number {
    return candle.timestamp;
  }
}
