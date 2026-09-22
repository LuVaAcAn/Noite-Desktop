import { invoke as tauriInvoke, type InvokeArgs } from '@tauri-apps/api/core';
import { localizeNativeError } from './i18n-runtime';

export async function invoke<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (cause) {
    throw localizeNativeError(cause);
  }
}
