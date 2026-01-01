export enum AppState {
  LANDING = 'LANDING',
  CAPTURING = 'CAPTURING',
  CROPPING = 'CROPPING',
  PROCESSING = 'PROCESSING',
  TRACING = 'TRACING',
  GALLERY = 'GALLERY',
  ERROR = 'ERROR'
}

export interface TransformState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface SketchConfig {
  opacity: number;
  contrast: number; 
  brightness: number;
  sharpness: number;
  invert: boolean;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  originalImage: string;
  sketchImage: string;
}