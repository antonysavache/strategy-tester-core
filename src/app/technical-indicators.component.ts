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
import { TimeShiftService, TimeShiftParams, TimeShiftResults } from './services/time-shift.service';

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
          <label for="emaPeriod">EMA Period:</label>
          <input type="number" id="emaPeriod" [(ngModel)]="emaPeriod" min="10" max="300" step="1" />
        </div>
        <div class="param-row">
          <label for="emaDistance">EMA Distance %:</label>
          <input type="number" id="emaDistance" [(ngModel)]="emaDistancePercent" min="0.01" max="1.0" step="0.01" />
        </div>
        <div class="param-row">
          <label for="commission">Commission %:</label>
          <input type="number" id="commission" [(ngModel)]="commissionPercent" min="0" max="1.0" step="0.01" />
        </div>

        <!-- НОВАЯ СЕКЦИЯ: Time Shift Parameters -->
        <h4>🕒 Time Shift Parameters</h4>
        <div class="param-row">
          <label for="timeShiftEnabled">Enable Time Shifts:</label>
          <input type="checkbox" id="timeShiftEnabled" [(ngModel)]="timeShiftEnabled" />
          <span class="param-description">Split deposit into multiple parts with delayed entries</span>
        </div>
        <div class="param-row" *ngIf="timeShiftEnabled">
          <label for="depositParts">Deposit Parts:</label>
          <input type="number" id="depositParts" [(ngModel)]="depositParts" min="2" max="20" step="1" />
          <span class="param-description">How many parts to split the deposit (default: 10)</span>
        </div>
        <div class="param-row" *ngIf="timeShiftEnabled">
          <label for="entryIntervalDays">Entry Interval (days):</label>
          <input type="number" id="entryIntervalDays" [(ngModel)]="entryIntervalDays" min="1" max="30" step="1" />
          <span class="param-description">Days between each part's entry (default: 7)</span>
        </div>

        <button (click)="processData()" class="recalculate-btn">Recalculate with New Parameters</button>
      </div>

      <!-- НОВАЯ СЕКЦИЯ: Time Shift Results Summary -->
      <div class="time-shift-summary" *ngIf="timeShiftResults && timeShiftResults.enabled">
        <h3>🕒 Time Shift Results</h3>

        <div class="shift-overview">
          <h4>📊 Configuration Overview</h4>
          <p><strong>Deposit Parts:</strong> {{ timeShiftResults.activeParts }}/{{ timeShiftResults.params.depositParts }} active</p>
          <p><strong>Entry Interval:</strong> {{ timeShiftResults.params.entryIntervalDays }} days</p>
          <p><strong>Entry Period:</strong> {{ formatTime(timeShiftResults.firstEntryTime) }} to {{ formatTime(timeShiftResults.lastEntryTime) }}</p>
          <p><strong>Each Part Size:</strong> {{ (100 / timeShiftResults.params.depositParts) | number:'1.1-1' }}% of total deposit</p>
        </div>

        <div class="shift-performance">
          <h4>💰 Aggregated Performance</h4>
          <p><strong>💰 Total Realized PnL:</strong> {{ timeShiftResults.totalRealizedPnl | number:'1.3-3' }}%</p>
          <p><strong>💸 Total Unrealized PnL:</strong> {{ timeShiftResults.totalUnrealizedPnl | number:'1.3-3' }}%</p>
          <p><strong>🏆 Total PnL:</strong> {{ timeShiftResults.totalPnl | number:'1.3-3' }}%</p>
          <p><strong>📈 Average Return:</strong> {{ timeShiftResults.weightedAverageReturn | number:'1.3-3' }}%</p>
        </div>

        <div class="shift-statistics">
          <h4>🔄 Cycle Statistics</h4>
          <p><strong>Total Cycles:</strong> {{ timeShiftResults.totalCycles }}</p>
          <p><strong>Closed Cycles:</strong> {{ timeShiftResults.totalClosedCycles }}</p>
          <p><strong>Open Cycles:</strong> {{ timeShiftResults.totalOpenCycles }}</p>
          <p><strong>Forced Closures:</strong> {{ timeShiftResults.totalForcedClosures }}</p>
        </div>

        <!-- Deposit Parts Breakdown -->
        <div class="parts-breakdown">
          <h4>📋 Deposit Parts Breakdown</h4>
          <div class="parts-grid">
            <div *ngFor="let part of timeShiftResults.parts" class="part-card" [ngClass]="getPartCardClass(part)">
              <div class="part-header">
                <h5>Part {{ part.partId }}</h5>
                <span class="part-size">{{ (part.depositFraction * 100) | number:'1.1-1' }}%</span>
              </div>
              <div class="part-details">
                <p><strong>Start Offset:</strong> {{ part.startOffset }} days</p>
                <p><strong>Start Time:</strong> {{ formatTime(part.actualStartTime) }}</p>
                <p><strong>PnL:</strong> <span [ngClass]="{'profit': part.strategyResults.totalPnl > 0, 'loss': part.strategyResults.totalPnl < 0}">{{ part.strategyResults.totalPnl | number:'1.3-3' }}%</span></p>
                <p><strong>Cycles:</strong> {{ part.strategyResults.cycles.length }} ({{ getClosedCyclesCount(part.strategyResults.cycles) }} closed)</p>
                <p><strong>Forced Closures:</strong> {{ part.strategyResults.forcedClosures }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="stats" *ngIf="candles.length > 0">
        <p>Total candles: {{ candles.length }}</p>
        <p>RSI Period: {{ rsiPeriod }}</p>
        <p>RSI Oversold: {{ rsiOversold }} | RSI Overbought: {{ rsiOverbought }}</p>
        <p>RSI Reversal Mode: {{ getRsiModeDescription(rsiReversalMode) }}</p>
        <p>EMA Distance: {{ emaDistancePercent }}% | Min Profit: {{ minProfitPercent }}% | Averaging Threshold: {{ averagingThreshold }}%</p>
        <p>Cycle Profit Threshold: {{ cycleProfitThreshold }}% | Commission: {{ commissionPercent }}%</p>
        <p>EMA Period: {{ emaPeriod }}</p>
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
          <p><strong>💳 Total Commission Paid:</strong> {{ sessionAnalytics.totalCommissionPaid | number:'1.2-2' }}%</p>
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
                <span><strong>📉 Cycle Drawdown:</strong> <span class="drawdown-value">{{ cycle.maxUnrealizedDrawdown | number:'1.2-2' }}%</span></span>
                <span *ngIf="cycle.maxLongDrawdown > 0"><strong>📉 LONG Drawdown:</strong> <span class="drawdown-value">{{ cycle.maxLongDrawdown | number:'1.2-2' }}%</span></span>
                <span *ngIf="cycle.maxShortDrawdown > 0"><strong>📉 SHORT Drawdown:</strong> <span class="drawdown-value">{{ cycle.maxShortDrawdown | number:'1.2-2' }}%</span></span>
              </div>
              <div class="drawdown-info" *ngIf="cycle.maxLongDrawdown > 0 || cycle.maxShortDrawdown > 0 || cycle.maxUnrealizedDrawdown > 0">
                <strong>ℹ️ Drawdown Explanation:</strong><br>
                • <strong>Cycle Drawdown ({{ cycle.maxUnrealizedDrawdown | number:'1.2-2' }}%)</strong> - максимальный минус общего баланса цикла (реальная просадка депозита)<br>
                <span *ngIf="cycle.maxLongDrawdown > 0">• <strong>LONG Drawdown ({{ cycle.maxLongDrawdown | number:'1.2-2' }}%)</strong> - максимальный минус по LONG позиции (может компенсироваться плюсом SHORT)<br></span>
                <span *ngIf="cycle.maxShortDrawdown > 0">• <strong>SHORT Drawdown ({{ cycle.maxShortDrawdown | number:'1.2-2' }}%)</strong> - максимальный минус по SHORT позиции (может компенсироваться плюсом LONG)</span>
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
                    <p *ngIf="trade.grossPnlPercent !== undefined && trade.commissionRate !== undefined && trade.commissionAmount !== undefined">
                      <strong>PnL Breakdown:</strong>
                      Gross {{ trade.grossPnlPercent >= 0 ? '+' : '' }}{{ trade.grossPnlPercent | number:'1.2-2' }}%
                      - Commission {{ trade.commissionRate | number:'1.2-2' }}% ({{ trade.commissionAmount | number:'1.3-3' }}%)
                      = Net {{ (trade.pnlPercent || 0) >= 0 ? '+' : '' }}{{ (trade.pnlPercent || 0) | number:'1.2-2' }}%
                    </p>
                    <p *ngIf="trade.grossPnlPercent === undefined || trade.commissionRate === undefined || trade.commissionAmount === undefined">
                      <strong>Net PnL:</strong> {{ (trade.pnlPercent || 0) >= 0 ? '+' : '' }}{{ (trade.pnlPercent || 0) | number:'1.2-2' }}%
                    </p>
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

    /* НОВЫЕ: Time Shift Parameters Styles */
    .strategy-params h4 { margin-top: 20px; margin-bottom: 10px; color: #495057; font-size: 16px; }
    .param-description { font-size: 12px; color: #6c757d; margin-left: 10px; font-style: italic; }
    input[type="checkbox"] { width: auto; margin-right: 10px; }

    /* НОВЫЕ: Time Shift Results Styles */
    .time-shift-summary { background-color: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107; }
    .time-shift-summary h3 { margin-top: 0; color: #856404; }
    .time-shift-summary h4 { color: #856404; margin-top: 15px; margin-bottom: 10px; }

    .shift-overview, .shift-performance, .shift-statistics { margin-bottom: 15px; }
    .shift-overview p, .shift-performance p, .shift-statistics p { margin: 5px 0; }

    .parts-breakdown { margin-top: 20px; }
    .parts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; margin-top: 10px; }

    .part-card { border: 1px solid #ddd; border-radius: 6px; padding: 12px; background-color: #fff; }
    .part-card.part-profit { border-left: 4px solid #28a745; background-color: #f8fff8; }
    .part-card.part-loss { border-left: 4px solid #dc3545; background-color: #fff8f8; }
    .part-card.part-neutral { border-left: 4px solid #6c757d; background-color: #f8f9fa; }

    .part-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .part-header h5 { margin: 0; color: #333; }
    .part-size { background-color: #e9ecef; padding: 2px 6px; border-radius: 8px; font-size: 12px; color: #495057; }

    .part-details p { margin: 4px 0; font-size: 13px; }

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
    .drawdown-value { color: #ff6b35; font-weight: bold; }

    .drawdown-info {
      font-size: 11px;
      color: #666;
      font-style: italic;
      margin-top: 5px;
      padding: 5px;
      background-color: #f0f0f0;
      border-radius: 4px;
    }

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
  timeShiftResults: TimeShiftResults | null = null; // НОВОЕ: результаты с временными сдвигами

  // Параметры стратегии
  rsiPeriod: number = 10;
  rsiOversold: number = 35;
  rsiOverbought: number = 65;
  minProfitPercent: number = 0.5;
  averagingThreshold: number = 0.5;
  cycleProfitThreshold: number = 0.5; // 0.5% порог для принудительного закрытия цикла
  rsiReversalMode: 'strict' | 'relaxed' | 'zone_only' = 'strict'; // НОВОЕ: режим разворота RSI
  emaDistancePercent: number = 0.15; // НОВОЕ: расстояние до EMA в процентах
  emaPeriod: number = 183; // НОВОЕ: период EMA
  commissionPercent: number = 0.05; // НОВОЕ: комиссия в процентах (0.05% по умолчанию)

  // НОВЫЕ: Параметры временных сдвигов
  timeShiftEnabled: boolean = false; // Включены ли временные сдвиги
  depositParts: number = 10; // На сколько частей разбить депозит
  entryIntervalDays: number = 7; // Через сколько дней входить следующей частью

  constructor(
    private marketDataService: MarketDataService,
    private indicatorsService: IndicatorsService,
    private longStrategyService: LongStrategyService,
    private shortStrategyService: ShortStrategyService,
    private tradingAnalyticsService: TradingAnalyticsService,
    private combinedStrategyService: CombinedStrategyService,
    private cycleManagerService: CycleManagerService,
    private timeShiftService: TimeShiftService // НОВОЕ: добавляем TimeShiftService
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
    this.indicatorsService.calculateEMA(this.candles, this.emaPeriod);

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
      emaDistancePercent: this.emaDistancePercent, // НОВОЕ: передаем расстояние до EMA
      emaPeriod: this.emaPeriod, // НОВОЕ: передаем период EMA
      commissionPercent: this.commissionPercent // НОВОЕ: передаем комиссию
    };

    // НОВОЕ: Параметры временных сдвигов
    const timeShiftParams: TimeShiftParams = {
      enabled: this.timeShiftEnabled,
      depositParts: this.depositParts,
      entryIntervalDays: this.entryIntervalDays
    };

    // НОВОЕ: Тестируем стратегию с учетом временных сдвигов
    this.timeShiftResults = this.timeShiftService.testStrategyWithTimeShifts(
      this.candles,
      combinedParams,
      timeShiftParams
    );

    // Создаем аналитику сессии из результатов временных сдвигов
    if (!this.timeShiftResults.enabled) {
      // Если временные сдвиги отключены, используем обычную логику
      const singlePartResults = this.timeShiftResults.parts[0].strategyResults;
      const session = this.tradingAnalyticsService.createSessionFromCycles(
        singlePartResults.cycles,
        combinedParams,
        singlePartResults.currentOpenLong,
        singlePartResults.currentOpenShort
      );
      this.sessionAnalytics = session;
    } else {
      // Если временные сдвиги включены, создаем агрегированную сессию
      this.sessionAnalytics = this.createAggregatedSessionAnalytics(this.timeShiftResults, combinedParams);
    }

    // Выводим результаты в консоль
    this.logTimeShiftResults(this.timeShiftResults);
  }

  // НОВЫЕ: Методы для работы с временными сдвигами
  private createAggregatedSessionAnalytics(
    timeShiftResults: TimeShiftResults,
    strategyParams: CombinedStrategyParams
  ): TradingSessionAnalytics {
    // Агрегируем циклы из всех частей депозита
    const allCycles = timeShiftResults.parts.flatMap(part => part.strategyResults.cycles);

    // Берем первую часть как базовую для создания сессии
    const firstPart = timeShiftResults.parts[0];
    const baseSession = this.tradingAnalyticsService.createSessionFromCycles(
      firstPart.strategyResults.cycles,
      strategyParams,
      firstPart.strategyResults.currentOpenLong,
      firstPart.strategyResults.currentOpenShort
    );

    // Создаем агрегированную сессию
    const aggregatedSession: TradingSessionAnalytics = {
      ...baseSession,
      id: `time-shift-${Date.now()}`,
      startTime: timeShiftResults.firstEntryTime,
      endTime: this.candles[this.candles.length - 1]?.dateUTC2 || '',

      // Агрегированные метрики
      totalRealizedPnl: timeShiftResults.totalRealizedPnl,
      totalUnrealizedPnl: timeShiftResults.totalUnrealizedPnl,
      totalPnl: timeShiftResults.totalPnl,

      totalCycles: timeShiftResults.totalCycles,
      closedCycles: timeShiftResults.totalClosedCycles,
      openCycles: timeShiftResults.totalOpenCycles,
      forcedClosures: timeShiftResults.totalForcedClosures,

      // Рассчитываем агрегированные статистики
      totalTrades: timeShiftResults.parts.reduce((sum, part) =>
        sum + part.strategyResults.totalClosedTrades.length, 0),

      avgCyclePnl: timeShiftResults.totalClosedCycles > 0 ?
        timeShiftResults.totalRealizedPnl / timeShiftResults.totalClosedCycles : 0,

      // Простые метрики (можно улучшить)
      winRate: baseSession.winRate, // Используем от первой части
      profitFactor: baseSession.profitFactor, // Используем от первой части
      maxDrawdown: Math.max(...timeShiftResults.parts.map(part =>
        part.strategyResults.cycles.reduce((max, cycle) =>
          Math.max(max, cycle.maxUnrealizedDrawdown), 0))),

      cycles: allCycles.map((cycle, index) => ({
        cycleId: cycle.id,
        startTime: cycle.startTime,
        endTime: cycle.endTime || '',
        status: cycle.isActive ? 'OPEN' : 'CLOSED',
        tradeCount: cycle.longTrades.length + cycle.shortTrades.length,
        realizedPnl: cycle.realizedPnl,
        unrealizedPnl: cycle.unrealizedPnl,
        totalPnl: cycle.realizedPnl + cycle.unrealizedPnl,
        forceClosed: cycle.forceClosed,
        maxUnrealizedDrawdown: cycle.maxUnrealizedDrawdown,
        maxLongDrawdown: cycle.maxLongDrawdown,
        maxShortDrawdown: cycle.maxShortDrawdown,
        allTrades: [...cycle.longTrades.filter(t => t.exitTime), ...cycle.shortTrades.filter(t => t.exitTime)],
        openLongTrade: cycle.longTrades.find(t => !t.exitTime) || null,
        openShortTrade: cycle.shortTrades.find(t => !t.exitTime) || null,
        logs: cycle.logs || []
      }))
    };

    return aggregatedSession;
  }

  private logTimeShiftResults(results: TimeShiftResults): void {
    console.log('=== TIME-SHIFTED STRATEGY RESULTS ===');

    if (!results.enabled) {
      console.log('⚠️  Time shifts DISABLED - using standard single-deposit approach');
      this.logCombinedResults(results.parts[0].strategyResults, this.sessionAnalytics);
      return;
    }

    console.log(`🕒 TIME SHIFT CONFIGURATION:`);
    console.log(`  📊 Deposit parts: ${results.params.depositParts}`);
    console.log(`  ⏰ Entry interval: ${results.params.entryIntervalDays} days`);
    console.log(`  🏦 Active parts: ${results.activeParts}/${results.params.depositParts}`);
    console.log(`  📅 Entry period: ${results.firstEntryTime} to ${results.lastEntryTime}`);

    console.log(`\n💰 AGGREGATED PERFORMANCE:`);
    console.log(`  💰 Total Realized PnL: ${results.totalRealizedPnl.toFixed(3)}%`);
    console.log(`  💸 Total Unrealized PnL: ${results.totalUnrealizedPnl.toFixed(3)}%`);
    console.log(`  🏆 Total PnL: ${results.totalPnl.toFixed(3)}%`);
    console.log(`  📈 Weighted Average Return: ${results.weightedAverageReturn.toFixed(3)}%`);

    console.log(`\n🔄 CYCLE STATISTICS:`);
    console.log(`  🔄 Total Cycles: ${results.totalCycles}`);
    console.log(`  ✅ Closed Cycles: ${results.totalClosedCycles}`);
    console.log(`  🔄 Open Cycles: ${results.totalOpenCycles}`);
    console.log(`  ⚡ Forced Closures: ${results.totalForcedClosures}`);

    console.log(`\n📋 DEPOSIT PARTS BREAKDOWN:`);
    results.parts.forEach((part, index) => {
      console.log(`\n--- Part ${part.partId} (${(part.depositFraction * 100).toFixed(1)}% of deposit) ---`);
      console.log(`  📅 Start: Day ${part.startOffset} (${part.actualStartTime})`);
      console.log(`  🏆 PnL: ${part.strategyResults.totalPnl.toFixed(3)}%`);
      console.log(`  🔄 Cycles: ${part.strategyResults.cycles.length} (${part.strategyResults.cycles.filter(c => !c.isActive).length} closed)`);
      console.log(`  ⚡ Forced: ${part.strategyResults.forcedClosures}`);
    });
  }
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

  // НОВЫЙ: Метод для определения CSS класса карточки части депозита
  getPartCardClass(part: any): string {
    if (part.strategyResults.totalPnl > 0) {
      return 'part-profit';
    } else if (part.strategyResults.totalPnl < 0) {
      return 'part-loss';
    }
    return 'part-neutral';
  }

  // НОВЫЙ: Метод для подсчета закрытых циклов
  getClosedCyclesCount(cycles: any[]): number {
    if (!cycles) return 0;
    return cycles.filter(c => !c.isActive).length;
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
