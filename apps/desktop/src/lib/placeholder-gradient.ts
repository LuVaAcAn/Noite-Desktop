// Gradientes deterministas por título — ver docs/DECISIONS.md punto 5 sobre
// por qué no se usan carátulas reales como placeholder.
const GRADIENTS = [
  'from-rose-500/40 to-orange-400/30',
  'from-sky-500/40 to-indigo-500/30',
  'from-emerald-500/40 to-teal-400/30',
  'from-fuchsia-500/40 to-purple-500/30',
  'from-amber-500/40 to-yellow-400/30',
  'from-cyan-500/40 to-blue-500/30',
];

export function gradientFor(title: string) {
  const sum = [...title].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return GRADIENTS[sum % GRADIENTS.length];
}
