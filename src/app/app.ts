import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TechnicalIndicatorsComponent } from './technical-indicators.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TechnicalIndicatorsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('actual-strategy-tester');
}
