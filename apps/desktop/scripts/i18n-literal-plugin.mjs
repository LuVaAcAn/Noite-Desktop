import { readFileSync } from 'node:fs';
import tsModule from 'typescript';

const ts = tsModule.default ?? tsModule;
const catalog = JSON.parse(readFileSync(new URL('../src/lib/i18n-catalog.json', import.meta.url), 'utf8'));
const phrases = Object.keys(catalog);
const phraseSet = new Set(phrases);

function hasTranslatableFragment(value) {
  return phrases.some((phrase) => phrase.length >= 4 && value.includes(phrase));
}

function isStructuralLiteral(node) {
  const parent = node.parent;
  return ts.isImportDeclaration(parent)
    || ts.isExportDeclaration(parent)
    || ts.isLiteralTypeNode(parent)
    || (ts.isPropertyAssignment(parent) && parent.name === node)
    || (ts.isPropertyDeclaration(parent) && parent.name === node)
    || (ts.isPropertySignature(parent) && parent.name === node)
    || ts.isModuleDeclaration(parent)
    || ts.isCaseClause(parent);
}

export function i18nLiteralPlugin() {
  return {
    name: 'noite-i18n-literals',
    enforce: 'pre',
    transform(code, rawId) {
      const id = rawId.split('?', 1)[0].replaceAll('\\', '/');
      if (!/\/src\/.*\.tsx?$/.test(id)
        || /(?:\.test\.|\/i18n-runtime\.ts$|\/i18n\.ts$)/.test(id)) return null;

      const kind = id.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const source = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, kind);
      let changed = false;
      const factory = ts.factory;
      const translateCall = (expression) => factory.createCallExpression(
        factory.createIdentifier('__noiteTranslateLiteral'), undefined, [expression],
      );

      const transformer = (context) => {
        const visit = (node) => {
          if (ts.isJsxText(node)) {
            const normalized = node.text.replace(/\s+/g, ' ').trim();
            if (normalized && phraseSet.has(normalized)) {
              changed = true;
              const leadingSpace = /^\s/u.test(node.text) ? ' ' : '';
              const trailingSpace = /\s$/u.test(node.text) ? ' ' : '';
              return factory.createJsxExpression(
                undefined,
                translateCall(factory.createStringLiteral(`${leadingSpace}${normalized}${trailingSpace}`)),
              );
            }
            return node;
          }
          if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && phraseSet.has(node.initializer.text)) {
            changed = true;
            return factory.updateJsxAttribute(
              node,
              node.name,
              factory.createJsxExpression(undefined, translateCall(factory.createStringLiteral(node.initializer.text))),
            );
          }
          if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
            && phraseSet.has(node.text)
            && !isStructuralLiteral(node)) {
            changed = true;
            return translateCall(factory.createStringLiteral(node.text));
          }
          if (ts.isTemplateExpression(node)) {
            const raw = node.getText(source);
            if (hasTranslatableFragment(raw)) {
              changed = true;
              return translateCall(node);
            }
          }
          return ts.visitEachChild(node, visit, context);
        };
        return (root) => ts.visitNode(root, visit);
      };

      const result = ts.transform(source, [transformer]);
      let output = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]);
      result.dispose();
      if (!changed) return null;
      output = `import { translateLiteral as __noiteTranslateLiteral } from '/src/lib/i18n-runtime';\n${output}`;
      return { code: output, map: null };
    },
  };
}
