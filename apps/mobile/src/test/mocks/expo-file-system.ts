import { vi } from 'vitest';

export const documentDirectory = 'file:///mock/documents/';

export const makeDirectoryAsync = vi.fn(async (_dir: string, _options?: any): Promise<void> => {});

export const getInfoAsync = vi.fn(async (_fileUri: string): Promise<any> => ({
  exists: true,
  size: 1024,
  isDirectory: false,
}));

export const copyAsync = vi.fn(async (_options: { from: string; to: string }): Promise<void> => {});

export const deleteAsync = vi.fn(async (_fileUri: string, _options?: any): Promise<void> => {});

