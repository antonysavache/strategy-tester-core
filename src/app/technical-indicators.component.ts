import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarketDataService, CandleData } from './services/market-data.service';
import { IndicatorsService, CandleWithIndicators } from './services/indicators.service';
import { LongStrategyService, StrategyParams } from './services/long-strategy.service';
import { ShortStrategyService, ShortStrategyParams } from './services/short-strategy.service';
import { TradingAnalyticsService, TradingSessionAnalytics } from './services/trading-analytics.service';
import { CombinedStrategyService, CombinedStrategyParams } from './services/combined-strategy.service';
import { CycleManagerService } from './services/cycle-manager.service';

@Component({
  selector: 'app-technical-indicators',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <h2>SOLETH Technical Analysis</h2>

      <div class="upload-section">
        <input type="file" (change)="onFileSelected($event)" accept=".csv" />
        <button (click)="processData()" [disabled]="!csvData">Calculate Indicators & Test Strategies</button>
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
        <div class="param-row">
          <label for="cycleThreshold">Cycle Profit Threshold %:</label>
          <input type="number" id="cycleThreshold" [(ngModel)]="cycleProfitThreshold" min="0.1" max="2.0" step="0.1" />
        </div>
        <div class="param-row">
          <label for="rsiReversalMode">RSI Reversal Mode:</label>
          <select id="rsiReversalMode" [(ngModel)]="rsiReversalMode">
            <option value="strict">Strict (RSI > RSI[1] > RSI[2])</option>
            <option value="relaxed">Relaxed (RSI > RSI[1])</option>
            <option value="zone_only">Zone Only (RSI in zone)</option>
          </select>
        </div>
        <div class="param-row">
          <label for="emaDistance">EMA Distance %:</label>
          <input type="number" id="emaDistance" [(ngModel)]="emaDistancePercent" min="0.01" max="1.0" step="0.01" />
        </div>
        <button (click)="processData()" class="recalculate-btn">Recalculate with New Parameters</button>
      </div>

      <div class="stats" *ngIf="candles.length > 0">
        <p>Total candles: {{ candles.length }}</p>
        <p>RSI Period: {{ rsiPeriod }}</p>
        <p>RSI Oversold: {{ rsiOversold }} | RSI Overbought: {{ rsiOverbought }}</p>
        <p>RSI Reversal Mode: {{ getRsiModeDescription(rsiReversalMode) }}</p>
        <p>EMA Distance: {{ emaDistancePercent }}% | Min Profit: {{ minProfitPercent }}% | Averaging Threshold: {{ averagingThreshold }}%</p>
        <p>Cycle Profit Threshold: {{ cycleProfitThreshold }}%</p>
        <p>EMA Period: 183</p>
      </div>

      <div class="cycles-container" *ngIf="sessionAnalytics">
        <h3>Trading Cycles Analysis</h3>

        <div class="session-summary">
          <h4>📊 Session Overview</h4>
          <p><strong>Total Cycles:</strong> {{ sessionAnalytics.totalCycles }}</p>
          <p><strong>Closed Cycles:</strong> {{ sessionAnalytics.closedCycles }}</p>
          <p><strong>Open Cycles:</strong> {{ sessionAnalytics.openCycles }}</p>
          <p><strong>💰 Total Realized PnL:</strong> {{ sessionAnalytics.totalRealizedPnl | number:'1.2-2' }}%</p>
          <p><strong>💸 Total Unrealized PnL:</strong> {{ sessionAnalytics.totalUnrealizedPnl | number:'1.2-2' }}%</p>
          <p><strong>🏆 Total PnL:</strong> {{ sessionAnalytics.totalPnl | number:'1.2-2' }}%</p>
          <p><strong>📈 Win Rate:</strong> {{ sessionAnalytics.winRate | number:'1.1-1' }}%</p>
          <p><strong>🔄 Forced Closures:</strong> {{ sessionAnalytics.forcedClosures }}</p>
        </div>

        <div class="cycles-list">
          <div *ngFor="let cycle of sessionAnalytics.cycles" class="cycle-card" [ngClass]="{'cycle-open': cycle.status === 'OPEN', 'cycle-closed': cycle.status === 'CLOSED'}">
            <div class="cycle-header">
              <h4>🔄 Cycle {{ cycle.cycleId }}
                <span class="cycle-status" [ngClass]="cycle.status.toLowerCase()">{{ cycle.status }}</span>
                <span *ngIf="cycle.forceClosed" class="force-closed">⚡ FORCED</span>
              </h4>
              <div class="cycle-summary">
                <span><strong>📅 Period:</strong> {{ cycle.startTime }} {{ cycle.endTime ? 'to ' + cycle.endTime : '(ongoing)' }}</span>
                <span><strong>📊 Trades:</strong> {{ cycle.tradeCount }}</span>
                <span><strong>💰 Realized PnL:</strong> {{ cycle.realizedPnl | number:'1.2-2' }}%</span>
                <span><strong>💸 Unrealized PnL:</strong> {{ cycle.unrealizedPnl | number:'1.2-2' }}%</span>
                <span><strong>🏆 Total PnL:</strong> {{ cycle.totalPnl | number:'1.2-2' }}%</span>
              </div>
            </div>

            <!-- Open Positions for OPEN cycles -->
            <div *ngIf="cycle.status === 'OPEN'" class="open-positions">
              <h5>📋 Open Positions</h5>
              <div *ngIf="cycle.openLongTrade" class="position-card long-position">
                <div class="position-header">
                  <span class="position-type">🟢 LONG</span>
                  <span class="position-size">{{ cycle.openLongTrade.hasAveraging ? '50%' : '25%' }} position</span>
                </div>
                <div class="position-details">
                  <p><strong>Entry:</strong> {{ cycle.openLongTrade.entryPrice | number:'1.6-6' }} at {{ cycle.openLongTrade.entryTime }}</p>
                  <p *ngIf="cycle.openLongTrade.hasAveraging"><strong>Averaging:</strong> {{ cycle.openLongTrade.averagingPrice | number:'1.6-6' }} at {{ cycle.openLongTrade.averagingTime }}</p>
                  <p><strong>Current:</strong> {{ cycle.openLongTrade.currentPrice | number:'1.6-6' }} at {{ cycle.openLongTrade.currentTime }}</p>
                  <p><strong>PnL:</strong> <span [ngClass]="{'profit': (cycle.openLongTrade.unrealizedPnlPercent || 0) > 0, 'loss': (cycle.openLongTrade.unrealizedPnlPercent || 0) < 0}">{{ (cycle.openLongTrade.unrealizedPnlPercent || 0) | number:'1.2-2' }}%</span></p>
                </div>
              </div>

              <div *ngIf="cycle.openShortTrade" class="position-card short-position">
                <div class="position-header">
                  <span class="position-type">🔴 SHORT</span>
                  <span class="position-size">{{ cycle.openShortTrade.hasAveraging ? '50%' : '25%' }} position</span>
                </div>
                <div class="position-details">
                  <p><strong>Entry:</strong> {{ cycle.openShortTrade.entryPrice | number:'1.6-6' }} at {{ cycle.openShortTrade.entryTime }}</p>
                  <p *ngIf="cycle.openShortTrade.hasAveraging"><strong>Averaging:</strong> {{ cycle.openShortTrade.averagingPrice | number:'1.6-6' }} at {{ cycle.openShortTrade.averagingTime }}</p>
                  <p><strong>Current:</strong> {{ cycle.openShortTrade.currentPrice | number:'1.6-6' }} at {{ cycle.openShortTrade.currentTime }}</p>
                  <p><strong>PnL:</strong> <span [ngClass]="{'profit': (cycle.openShortTrade.unrealizedPnlPercent || 0) > 0, 'loss': (cycle.openShortTrade.unrealizedPnlPercent || 0) < 0}">{{ (cycle.openShortTrade.unrealizedPnlPercent || 0) | number:'1.2-2' }}%</span></p>
                </div>
              </div>
            </div>

            <!-- Cycle Event Log -->
            <div class="cycle-log" *ngIf="cycle.logs && cycle.logs.length > 0">
              <h5>📋 Cycle Event Log</h5>
              <table class="log-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Details</th>
                    <th>Price</th>
                    <th>PnL</th>
                    <th>Realized</th>
                    <th>Open Positions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let log of cycle.logs" [ngClass]="getLogRowClass(log.action)">
                    <td>{{ formatTime(log.timestamp) }}</td>
                    <td>{{ getActionIcon(log.action) }} {{ log.action.replace('_', ' ') }}</td>
                    <td>{{ log.details }}</td>
                    <td>{{ log.price ? (log.price | number:'1.6-6') : '-' }}</td>
                    <td [ngClass]="{'profit': (log.pnl || 0) > 0, 'loss': (log.pnl || 0) < 0}">
                      {{ log.pnl ? ((log.pnl | number:'1.2-2') + '%') : '-' }}
                    </td>
                    <td>{{ log.cycleRealizedPnl ? ((log.cycleRealizedPnl | number:'1.2-2') + '%') : '-' }}</td>
                    <td>{{ log.openPositions || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Closed Trades -->
            <div class="closed-trades" *ngIf="cycle.allTrades.length > 0">
              <h5>📋 Closed Trades ({{ cycle.allTrades.length }})</h5>
              <div class="trades-list">
                <div *ngFor="let trade of cycle.allTrades" class="trade-card" [ngClass]="{'long-trade': trade.direction === 'LONG', 'short-trade': trade.direction === 'SHORT'}">
                  <div class="trade-header">
                    <span class="trade-type">{{ trade.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT' }}</span>
                    <span class="trade-result" [ngClass]="{'profit': (trade.pnlPercent || 0) > 0, 'loss': (trade.pnlPercent || 0) <= 0}">{{ (trade.pnlPercent || 0) | number:'1.2-2' }}%</span>
                  </div>
                  <div class="trade-details">
                    <p><strong>Entry:</strong> {{ trade.entryPrice | number:'1.6-6' }} at {{ trade.entryTime }}</p>
                    <p *ngIf="trade.hasAveraging"><strong>Averaging:</strong> {{ trade.averagingPrice | number:'1.6-6' }} at {{ trade.averagingTime }}</p>
                    <p><strong>Exit:</strong> {{ trade.exitPrice | number:'1.6-6' }} at {{ trade.exitTime }}</p>
                    <p><strong>Position Size:</strong> {{ (trade.totalPositionSize || 0) * 100 }}% of deposit</p>
                    <p><strong>Reason:</strong> {{ trade.reason }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .container { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .upload-section { margin-bottom: 20px; }
    .upload-section input { margin-right: 10px; padding: 8px; }
    .upload-section button { padding: 8px 16px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .upload-section button:disabled { background-color: #6c757d; cursor: not-allowed; }
    .stats { background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
    .strategy-params { background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
    .strategy-params h3 { margin-top: 0; margin-bottom: 15px; color: #333; }
    .param-row { display: flex; align-items: center; margin-bottom: 10px; }
    .param-row label { width: 200px; font-weight: 500; }
    .param-row input { padding: 5px 8px; border: 1px solid #ddd; border-radius: 4px; width: 80px; }
    .param-row select { padding: 5px 8px; border: 1px solid #ddd; border-radius: 4px; width: 250px; }
    .recalculate-btn { padding: 8px 16px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; }
    .recalculate-btn:hover { background-color: #218838; }

    /* Cycles Analytics Styles */
    .cycles-container { margin-top: 20px; }
    .cycles-container h3 { color: #333; margin-bottom: 20px; }

    .session-summary { background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .session-summary h4 { margin-top: 0; color: #1976d2; }
    .session-summary p { margin: 5px 0; }

    .cycles-list { display: flex; flex-direction: column; gap: 20px; }

    .cycle-card { border: 2px solid #ddd; border-radius: 8px; padding: 15px; background-color: #fff; }
    .cycle-card.cycle-open { border-color: #28a745; background-color: #f8fff8; }
    .cycle-card.cycle-closed { border-color: #6c757d; background-color: #f8f9fa; }

    .cycle-header h4 { margin: 0 0 10px 0; display: flex; align-items: center; gap: 10px; }
    .cycle-status { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .cycle-status.open { background-color: #28a745; color: white; }
    .cycle-status.closed { background-color: #6c757d; color: white; }
    .force-closed { background-color: #ff6b35; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; }

    .cycle-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 10px; }
    .cycle-summary span { font-size: 14px; }

    .open-positions { margin-top: 15px; }
    .open-positions h5 { color: #2e7d32; margin-bottom: 10px; }

    .position-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
    .long-position { border-left: 4px solid #4caf50; background-color: #f1f8e9; }
    .short-position { border-left: 4px solid #f44336; background-color: #ffebee; }

    .position-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .position-type { font-weight: bold; }
    .position-size { font-size: 12px; color: #666; background-color: #e0e0e0; padding: 2px 6px; border-radius: 8px; }

    .position-details p { margin: 4px 0; font-size: 14px; }

    .closed-trades { margin-top: 15px; }
    .closed-trades h5 { color: #5d4037; margin-bottom: 10px; }

    .trades-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; }

    .trade-card { border: 1px solid #ddd; border-radius: 6px; padding: 8px; font-size: 13px; }
    .long-trade { border-left: 3px solid #4caf50; background-color: #f9fff9; }
    .short-trade { border-left: 3px solid #f44336; background-color: #fffafa; }

    .trade-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .trade-type { font-weight: bold; font-size: 12px; }
    .trade-result { font-weight: bold; font-size: 14px; }

    .trade-details p { margin: 2px 0; }

    .profit { color: #2e7d32; }
    .loss { color: #d32f2f; }

    /* Cycle Log Styles */
    .cycle-log { margin-top: 15px; }
    .cycle-log h5 { color: #424242; margin-bottom: 10px; }

    .log-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px; }
    .log-table th, .log-table td { padding: 6px 8px; border: 1px solid #ddd; text-align: left; }
    .log-table th { background-color: #f5f5f5; font-weight: bold; color: #333; }
    .log-table tbody tr:nth-child(even) { background-color: #fafafa; }

    .log-table .log-entry { background-color: #e8f5e8; }
    .log-table .log-exit { background-color: #fff3e0; }
    .log-table .log-closed { background-color: #e8f5e8; }
    .log-table .log-averaging { background-color: #e3f2fd; }
    .log-table .log-force-close { background-color: #ffebee; }
    .log-table .log-cycle-start { background-color: #f3e5f5; }
    .log-table .log-cycle-end { background-color: #e0f2f1; }
  `]
})
export class TechnicalIndicatorsComponent {
  csvData: string = '';
  candles: CandleWithIndicators[] = [];
  sessionAnalytics: TradingSessionAnalytics | null = null;

  // Параметры стратегии
  rsiPeriod: number = 10;
  rsiOversold: number = 35;
  rsiOverbought: number = 65;
  minProfitPercent: number = 0.5;
  averagingThreshold: number = 0.5;
  cycleProfitThreshold: number = 0.5; // 0.5% порог для принудительного закрытия цикла
  rsiReversalMode: 'strict' | 'relaxed' | 'zone_only' = 'strict'; // НОВОЕ: режим разворота RSI
  emaDistancePercent: number = 0.15; // НОВОЕ: расстояние до EMA в процентах

  constructor(
    private marketDataService: MarketDataService,
    private indicatorsService: IndicatorsService,
    private longStrategyService: LongStrategyService,
    private shortStrategyService: ShortStrategyService,
    private tradingAnalyticsService: TradingAnalyticsService,
    private combinedStrategyService: CombinedStrategyService,
    private cycleManagerService: CycleManagerService
  ) {}

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

    // 1. Парсим CSV данные
    const rawCandles = this.marketDataService.parseCSV(this.csvData);
    this.candles = rawCandles as CandleWithIndicators[];

    // 2. Считаем индикаторы
    this.indicatorsService.calculateRSI(this.candles, this.rsiPeriod);
    this.indicatorsService.calculateEMA(this.candles, 183);

    // 3. Тестируем стратегии
    this.testStrategies();
  }

  private testStrategies(): void {
    const combinedParams: CombinedStrategyParams = {
      rsiPeriod: this.rsiPeriod,
      rsiOversold: this.rsiOversold,
      rsiOverbought: this.rsiOverbought,
      minProfitPercent: this.minProfitPercent,
      averagingThreshold: this.averagingThreshold,
      cycleProfitThreshold: this.cycleProfitThreshold,
      rsiReversalMode: this.rsiReversalMode, // НОВОЕ: передаем режим разворота
      emaDistancePercent: this.emaDistancePercent // НОВОЕ: передаем расстояние до EMA
    };

    // Тестируем объединенную стратегию с управлением циклами
    const results = this.combinedStrategyService.testCombinedStrategy(this.candles, combinedParams);

    // Создаем аналитику сессии на основе циклов
    const session = this.tradingAnalyticsService.createSessionFromCycles(
      results.cycles,
      combinedParams,
      results.currentOpenLong,
      results.currentOpenShort
    );

    // Сохраняем для отображения в UI
    this.sessionAnalytics = session;

    // Выводим результаты в консоль
    this.logCombinedResults(results, session);
  }

  // Метод для вывода результатов с фокусом на циклы
  private logCombinedResults(results: any, session: any): void {
    console.log('=== CYCLE-BASED TRADING ANALYTICS ===');
    console.log(`Total candles analyzed: ${this.candles.length}`);

    console.log('\n📊 SESSION OVERVIEW:');
    console.log(`Session ID: ${session.id}`);
    console.log(`Period: ${session.startTime} to ${session.endTime}`);
    console.log(`Strategy Parameters:`, session.strategyParams);

    console.log('\n🔄 CYCLE SUMMARY:');
    console.log(`Total Cycles: ${session.totalCycles}`);
    console.log(`Closed Cycles: ${session.closedCycles}`);
    console.log(`Open Cycles: ${session.openCycles}`);
    console.log(`Forced Closures: ${session.forcedClosures}`);

    console.log('\n💰 PERFORMANCE METRICS:');
    console.log(`💰 Total Realized PnL: ${session.totalRealizedPnl.toFixed(2)}% (from deposit)`);
    console.log(`💸 Total Unrealized PnL: ${session.totalUnrealizedPnl.toFixed(2)}% (from deposit)`);
    console.log(`🏆 Total PnL: ${session.totalPnl.toFixed(2)}% (from deposit)`);
    console.log(`📈 Average Cycle PnL: ${session.avgCyclePnl.toFixed(2)}% (closed cycles only)`);
    console.log(`🎯 Total Trades: ${session.totalTrades}`);
    console.log(`✅ Win Rate: ${session.winRate.toFixed(2)}%`);
    console.log(`⚡ Profit Factor: ${session.profitFactor === Infinity ? 'Infinity' : session.profitFactor.toFixed(2)}`);
    console.log(`📉 Max Drawdown: ${session.maxDrawdown.toFixed(2)}% (from deposit)`);

    console.log('\n🔄 DETAILED CYCLE BREAKDOWN:');
    session.cycles.forEach((cycle: any, index: number) => {
      console.log(`\n--- Cycle ${cycle.cycleId} (${cycle.status}) ---`);
      console.log(`  📅 Period: ${cycle.startTime} ${cycle.endTime ? `to ${cycle.endTime}` : '(ongoing)'}`);
      console.log(`  📊 Trades: ${cycle.tradeCount}`);
      console.log(`  💰 Realized PnL: ${cycle.realizedPnl.toFixed(2)}%`);
      console.log(`  💸 Unrealized PnL: ${cycle.unrealizedPnl.toFixed(2)}%`);
      console.log(`  🏆 Total PnL: ${cycle.totalPnl.toFixed(2)}%`);
      console.log(`  🔒 Force Closed: ${cycle.forceClosed ? 'Yes' : 'No'}`);

      if (cycle.status === 'OPEN') {
        console.log(`  📋 Open Positions:`);
        if (cycle.openLongTrade) {
          console.log(`    🟢 Long: Entry ${cycle.openLongTrade.entryPrice} | Current ${cycle.openLongTrade.currentPrice} | PnL: ${cycle.openLongTrade.unrealizedPnlPercent?.toFixed(2)}%`);
        }
        if (cycle.openShortTrade) {
          console.log(`    🔴 Short: Entry ${cycle.openShortTrade.entryPrice} | Current ${cycle.openShortTrade.currentPrice} | PnL: ${cycle.openShortTrade.unrealizedPnlPercent?.toFixed(2)}%`);
        }
      }

      console.log(`  📋 Closed Trades:`, cycle.allTrades);
    });

    console.log('\n📈 ALL TRADING SESSIONS:');
    console.log(this.tradingAnalyticsService.getAllSessions());
  }

  trackByTimestamp(index: number, candle: CandleWithIndicators): number {
    return candle.timestamp;
  }

  // Методы для обработки логов цикла
  formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getActionIcon(action: string): string {
    const icons: { [key: string]: string } = {
      'CYCLE_START': '🚀',
      'LONG_ENTRY': '📈',
      'SHORT_ENTRY': '📉',
      'LONG_AVERAGING': '🔄',
      'SHORT_AVERAGING': '🔄',
      'LONG_CLOSED': '💰',
      'SHORT_CLOSED': '💰',
      'FORCE_CLOSE': '🚨',
      'CYCLE_END': '🏁'
    };
    return icons[action] || '📋';
  }

  getLogRowClass(action: string): string {
    const classes: { [key: string]: string } = {
      'LONG_ENTRY': 'log-entry',
      'SHORT_ENTRY': 'log-entry',
      'LONG_CLOSED': 'log-closed',
      'SHORT_CLOSED': 'log-closed',
      'LONG_AVERAGING': 'log-averaging',
      'SHORT_AVERAGING': 'log-averaging',
      'FORCE_CLOSE': 'log-force-close',
      'CYCLE_START': 'log-cycle-start',
      'CYCLE_END': 'log-cycle-end'
    };
    return classes[action] || '';
  }

  // НОВЫЙ: Описание режима разворота RSI
  getRsiModeDescription(mode: 'strict' | 'relaxed' | 'zone_only'): string {
    const descriptions = {
      'strict': 'Strict (RSI > RSI[1] > RSI[2])',
      'relaxed': 'Relaxed (RSI > RSI[1])',
      'zone_only': 'Zone Only (RSI in zone)'
    };
    return descriptions[mode];
  }
}
