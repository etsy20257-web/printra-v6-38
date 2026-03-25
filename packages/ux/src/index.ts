import type { StudioMode } from '@printra/shared';

export type ModePresentation = {
  title: string;
  subtitle: string;
};

export const studioModePresentation: Record<StudioMode, ModePresentation> = {
  design: {
    title: 'Design Mode',
    subtitle: 'Focus on objects, layers, guides, and text controls.'
  },
  mockup: {
    title: 'Mockup Mode',
    subtitle: 'Inspect placement bounds, surface behavior, and product fit.'
  },
  split: {
    title: 'Split Preview',
    subtitle: 'Compare clean design output with the mockup surface result.'
  }
};
