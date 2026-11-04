export const documentDirectory = 'file:///mock/documents/';

export async function makeDirectoryAsync(dir: string, options?: any): Promise<void> {}

export async function getInfoAsync(fileUri: string): Promise<any> {
  return { exists: true, size: 1024, isDirectory: false };
}

export async function copyAsync(options: { from: string; to: string }): Promise<void> {}

export async function deleteAsync(fileUri: string, options?: any): Promise<void> {}
