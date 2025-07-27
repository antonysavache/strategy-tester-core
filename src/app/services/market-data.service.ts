import { Injectable } from '@angular/core';

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dateUTC2?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MarketDataService {

  parseCSV(csvData: string): CandleData[] {
    const lines = csvData.trim().split('\n');
    const candles: CandleData[] = [];

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
      date.setHours(date.getHours() + 2);
      candle.dateUTC2 = date.toISOString().replace('T', ' ').substring(0, 19);

      candles.push(candle);
    }

    return candles;
  }
}
