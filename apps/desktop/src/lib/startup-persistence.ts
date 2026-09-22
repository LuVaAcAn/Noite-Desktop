type State = Record<string, unknown>;

export async function readStartupState(readNative: () => Promise<State>, readLegacy: () => Promise<State>) {
  const nativeState = await readNative();
  // An inaccessible legacy WebView database must not block an existing SQLite library.
  const legacyState = Object.keys(nativeState).length === 0 ? await readLegacy() : {};
  return { nativeState, legacyState };
}

export async function withStartupTimeout<T>(operation: Promise<T>, milliseconds = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('La lectura de datos locales tardó demasiado. Vuelve a abrir Noite.')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
