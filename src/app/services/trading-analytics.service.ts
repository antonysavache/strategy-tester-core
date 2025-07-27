import { Injectable } from '@angular/core';
import { Trade } from './long-strategy.service';
import { ShortTrade } from './short-strategy.service';
import { TradingCycle } from './cycle-manager.service';

export interface CycleAnalytics {
  cycleId: number;
  status: 'CLOSED' | 'OPEN';
  startTime: string;
  endTime?: string;
  allTrades: (Trade | ShortTrade)[];
  openLongTrade: Trade | null;
  openShortTrade: ShortTrade | null;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  forceClosed: boolean;
  tradeCount: number;
}

export interface TradingSessionAnalytics {
  id: string;
  startTime: string;
  endTime: string;
  strategyParams: any;
  cycles: CycleAnalytics[];
  totalCycles: number;
  closedCycles: number;
  openCycles: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  avgCyclePnl: number;
  forcedClosures: number;
}

@Injectable({
  providedIn: 'root'
})
export class TradingAnalyticsService {
  private sessions: TradingSessionAnalytics[] = [];

  createSessionFromCycles(
    cycles: TradingCycle[],
    strategyParams: any,
    openLongTrade: Trade | null = null,
    openShortTrade: ShortTrade | null = null
  ): TradingSessionAnalytics {

    console.log('🔍 DEBUG: createSessionFromCycles');
    console.log('Cycles received:', cycles.length);
    console.log('Open long trade:', openLongTrade);
    console.log('Open short trade:', openShortTrade);

    const cycleAnalytics: CycleAnalytics[] = cycles.map(cycle => {
      // ИСПРАВЛЯЕМ: Сортируем все сделки по времени входа (entryTime)
      const allTrades = [...cycle.longTrades, ...cycle.shortTrades]
        .sort((a, b) => {
          // Преобразуем время в timestamp для корректного сравнения
          const timeA = new Date(a.entryTime).getTime();
          const timeB = new Date(b.entryTime).getTime();
          return timeA - timeB; // Сначала старые, потом новые
        });

      // Определяем статус цикла
      const isOpen = cycle.isActive;

      // ИСПРАВЛЯЕМ: берем нереализованный PnL из цикла, а не пересчитываем
      let unrealizedPnl = 0;
      if (isOpen) {
        // Для открытого цикла берем актуальный unrealizedPnl из цикла
        unrealizedPnl = cycle.unrealizedPnl || 0;

        // ОТЛАДКА: сравниваем с прямым расчетом
        let directUnrealizedPnl = 0;
        if (openLongTrade?.unrealizedPnlPercent) {
          directUnrealizedPnl += openLongTrade.unrealizedPnlPercent;
        }
        if (openShortTrade?.unrealizedPnlPercent) {
          directUnrealizedPnl += openShortTrade.unrealizedPnlPercent;
        }

        console.log(`🔍 DEBUG Cycle ${cycle.id}:`);
        console.log(`  cycle.unrealizedPnl = ${cycle.unrealizedPnl}`);
        console.log(`  directUnrealizedPnl = ${directUnrealizedPnl}`);
        console.log(`  openLongTrade.unrealizedPnlPercent = ${openLongTrade?.unrealizedPnlPercent}`);
        console.log(`  openShortTrade.unrealizedPnlPercent = ${openShortTrade?.unrealizedPnlPercent}`);
      }

      console.log(`🔍 Cycle ${cycle.id}: isActive=${cycle.isActive}, status=${isOpen ? 'OPEN' : 'CLOSED'}, realizedPnl=${cycle.realizedPnl}, unrealizedPnl=${unrealizedPnl}`);

      return {
        cycleId: cycle.id,
        status: isOpen ? 'OPEN' : 'CLOSED',
        startTime: cycle.startTime,
        endTime: cycle.endTime,
        allTrades,
        openLongTrade: isOpen ? openLongTrade : null,
        openShortTrade: isOpen ? openShortTrade : null,
        realizedPnl: cycle.realizedPnl,
        unrealizedPnl,
        totalPnl: cycle.realizedPnl + unrealizedPnl,
        forceClosed: cycle.forceClosed,
        tradeCount: allTrades.length
      };
    });

    // Общие метрики
    const allTrades = cycleAnalytics.flatMap(c => c.allTrades);
    const totalRealizedPnl = cycleAnalytics.reduce((sum, c) => sum + c.realizedPnl, 0);
    const totalUnrealizedPnl = cycleAnalytics.reduce((sum, c) => sum + c.unrealizedPnl, 0);
    const closedCycles = cycleAnalytics.filter(c => c.status === 'CLOSED');
    const forcedClosures = cycleAnalytics.filter(c => c.forceClosed).length;

    console.log('🔍 TOTALS: realizedPnl=', totalRealizedPnl, 'unrealizedPnl=', totalUnrealizedPnl, 'totalPnl=', totalRealizedPnl + totalUnrealizedPnl);

    const session: TradingSessionAnalytics = {
      id: this.generateSessionId(),
      startTime: cycles.length > 0 ? cycles[0].startTime : new Date().toISOString(),
      endTime: cycles.length > 0 ? (cycles[cycles.length - 1].endTime || new Date().toISOString()) : new Date().toISOString(),
      strategyParams,
      cycles: cycleAnalytics,
      totalCycles: cycles.length,
      closedCycles: closedCycles.length,
      openCycles: cycleAnalytics.filter(c => c.status === 'OPEN').length,
      totalRealizedPnl,
      totalUnrealizedPnl,
      totalPnl: totalRealizedPnl + totalUnrealizedPnl,
      totalTrades: allTrades.length,
      winRate: this.calculateWinRate(allTrades),
      profitFactor: this.calculateProfitFactor(allTrades),
      maxDrawdown: this.calculateMaxDrawdown(allTrades),
      avgCyclePnl: closedCycles.length > 0 ? closedCycles.reduce((sum, c) => sum + c.totalPnl, 0) / closedCycles.length : 0,
      forcedClosures
    };

    this.sessions.push(session);
    return session;
  }

  private calculateWinRate(trades: (Trade | ShortTrade)[]): number {
    if (trades.length === 0) return 0;
    const winningTrades = trades.filter(t => (t.pnlPercent || 0) > 0);
    return (winningTrades.length / trades.length) * 100;
  }

  private calculateProfitFactor(trades: (Trade | ShortTrade)[]): number {
    const profits = trades.filter(t => (t.pnlPercent || 0) > 0).reduce((sum, t) => sum + (t.pnlPercent || 0), 0);
    const losses = Math.abs(trades.filter(t => (t.pnlPercent || 0) < 0).reduce((sum, t) => sum + (t.pnlPercent || 0), 0));

    return losses === 0 ? (profits > 0 ? Infinity : 0) : profits / losses;
  }

  private calculateMaxDrawdown(trades: (Trade | ShortTrade)[]): number {
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnl = 0;

    for (const trade of trades) {
      runningPnl += (trade.pnlPercent || 0);
      if (runningPnl > peak) {
        peak = runningPnl;
      }
      const drawdown = peak - runningPnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  private generateSessionId(): string {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getAllSessions(): TradingSessionAnalytics[] {
    return [...this.sessions];
  }

  getLatestSession(): TradingSessionAnalytics | null {
    return this.sessions.length > 0 ? this.sessions[this.sessions.length - 1] : null;
  }

  clearSessions(): void {
    this.sessions = [];
  }

  exportSessionsToCSV(): string {
    const headers = [
      'Session ID', 'Start Time', 'End Time', 'Total Cycles', 'Closed Cycles', 'Open Cycles',
      'Total Realized PnL %', 'Total Unrealized PnL %', 'Total PnL %', 'Total Trades',
      'Win Rate %', 'Profit Factor', 'Max Drawdown %', 'Avg Cycle PnL %', 'Forced Closures'
    ];

    const rows = this.sessions.map(session => [
      session.id,
      session.startTime,
      session.endTime,
      session.totalCycles,
      session.closedCycles,
      session.openCycles,
      session.totalRealizedPnl.toFixed(2),
      session.totalUnrealizedPnl.toFixed(2),
      session.totalPnl.toFixed(2),
      session.totalTrades,
      session.winRate.toFixed(2),
      session.profitFactor === Infinity ? 'Infinity' : session.profitFactor.toFixed(2),
      session.maxDrawdown.toFixed(2),
      session.avgCyclePnl.toFixed(2),
      session.forcedClosures
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  exportCyclesToCSV(sessionId: string): string {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return '';

    const headers = [
      'Cycle ID', 'Status', 'Start Time', 'End Time', 'Trade Count',
      'Realized PnL %', 'Unrealized PnL %', 'Total PnL %', 'Force Closed'
    ];

    const rows = session.cycles.map(cycle => [
      cycle.cycleId,
      cycle.status,
      cycle.startTime,
      cycle.endTime || '',
      cycle.tradeCount,
      cycle.realizedPnl.toFixed(2),
      cycle.unrealizedPnl.toFixed(2),
      cycle.totalPnl.toFixed(2),
      cycle.forceClosed
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }
}
