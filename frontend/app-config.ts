export interface AppConfig {
  pageTitle: string;
  pageDescription: string;
  companyName: string;

  supportsChatInput: boolean;
  supportsVideoInput: boolean;
  supportsScreenShare: boolean;
  isPreConnectBufferEnabled: boolean;

  logo: string;
  startButtonText: string;
  accent?: string;
  logoDark?: string;
  accentDark?: string;

  audioVisualizerType?: 'bar' | 'wave' | 'grid' | 'radial' | 'aura';
  audioVisualizerColor?: `#${string}`;
  audioVisualizerColorDark?: `#${string}`;
  audioVisualizerColorShift?: number;
  audioVisualizerBarCount?: number;
  audioVisualizerGridRowCount?: number;
  audioVisualizerGridColumnCount?: number;
  audioVisualizerRadialBarCount?: number;
  audioVisualizerRadialRadius?: number;
  audioVisualizerWaveLineWidth?: number;

  // agent dispatch configuration
  agentName?: string;

  // LiveKit Cloud Sandbox configuration
  sandboxId?: string;
}

export const APP_CONFIG_DEFAULTS: AppConfig = {
  companyName: 'Bharat Digital Bank',
  pageTitle: 'Samar - Bharat Digital Bank AI Assistant',
  pageDescription: 'Talk to Samar, your friendly AI virtual banking assistant at Bharat Digital Bank. Assist with loan documents, rates, credit card blocking, and banking queries.',

  supportsChatInput: true,
  supportsVideoInput: false,
  supportsScreenShare: false,
  isPreConnectBufferEnabled: true,

  logo: '/bank-logo.svg',
  accent: '#0D9488',
  logoDark: '/bank-logo-dark.svg',
  accentDark: '#14B8A6',
  startButtonText: 'Connect with Samar',

  // optional: audio visualization configuration
  audioVisualizerType: 'aura',
  audioVisualizerColor: '#0D9488',
  audioVisualizerColorDark: '#14B8A6',
  audioVisualizerColorShift: 0.3,
  audioVisualizerWaveLineWidth: 3,

  // agent dispatch configuration
  agentName: process.env.AGENT_NAME ?? undefined,

  // LiveKit Cloud Sandbox configuration
  sandboxId: undefined,
};
