#!/usr/bin/env node
/*
 * Fast source-integrity check. This validates TypeScript/TSX syntax and local
 * import paths without pretending to replace `tsc --noEmit` or a Next.js build.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'src');
const sourceFiles = [];
const syntaxErrors = [];
const unresolvedImports = [];
const nativePrompts = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      sourceFiles.push(absolute);
    }
  }
}

function existsAsModule(base) {
  const candidates = [
    base,
    ...['.ts', '.tsx', '.js', '.jsx', '.d.ts'].map((extension) => `${base}${extension}`),
    ...['index.ts', 'index.tsx', 'index.js'].map((file) => path.join(base, file)),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

walk(sourceRoot);

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const transpiled = ts.transpileModule(text, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
    },
  });

  for (const diagnostic of transpiled.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    const location = diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
    syntaxErrors.push({
      file: path.relative(projectRoot, file),
      line: location ? location.line + 1 : null,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    });
  }

  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith('.')) {
        if (!existsAsModule(path.resolve(path.dirname(file), specifier))) {
          unresolvedImports.push({ file: path.relative(projectRoot, file), specifier });
        }
      } else if (specifier.startsWith('@/')) {
        const base = path.join(sourceRoot, specifier.slice(2));
        if (!existsAsModule(base)) {
          unresolvedImports.push({ file: path.relative(projectRoot, file), specifier });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);

  for (const match of text.matchAll(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g)) {
    nativePrompts.push({ file: path.relative(projectRoot, file), call: match[0] });
  }
}

const result = {
  filesChecked: sourceFiles.length,
  syntaxErrors,
  unresolvedLocalImports: unresolvedImports,
  nativeBrowserPrompts: nativePrompts,
};
console.log(JSON.stringify(result, null, 2));
if (syntaxErrors.length || unresolvedImports.length || nativePrompts.length) process.exitCode = 1;
