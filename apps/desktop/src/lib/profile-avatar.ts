export function profileInitial(name: string) {
  return (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase();
}
