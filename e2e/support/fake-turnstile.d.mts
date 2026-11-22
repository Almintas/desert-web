export declare const DUMMY_TOKEN: string;
export declare const FAKE_WIDGET_SCRIPT: string;
export interface FakeWidgetOptions {
  mode?: 'pass' | 'error' | 'unsupported' | 'interactive';
  failTimes?: number;
  delayMs?: number;
}
export declare function fakeWidgetScript(options?: FakeWidgetOptions): string;
export declare function startFakeSiteverify(): Promise<{ url: string; close(): Promise<void> }>;
