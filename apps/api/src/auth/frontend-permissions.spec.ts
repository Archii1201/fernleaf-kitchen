import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, ROLES } from './permissions.js';

const webRoot = resolve(process.cwd(), '../web');
const managementChecks = [
  ['app/catalogue/page.tsx', 'canEdit', 'catalogue.manage'],
  ['app/catalogue/groups/page.tsx', 'canEdit', 'catalogue.manage'],
  ['app/catalogue/dishes/page.tsx', 'canEdit', 'catalogue.manage'],
  ['app/menu/page.tsx', 'canEdit', 'menu.manage'],
  ['app/orders/[id]/page.tsx', 'canCredit', 'billing.manage'],
  ['app/orders/[id]/page.tsx', 'canConfirm', 'orders.confirm'],
  ['app/driver/page.tsx', 'canDeliver', 'driver.update'],
] as const;

function source(path: string) {
  return ts.createSourceFile(
    path,
    readFileSync(resolve(webRoot, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function files(path: string): string[] {
  return readdirSync(resolve(webRoot, path), { withFileTypes: true }).flatMap(
    (entry) => {
      const child = `${path}/${entry.name}`;
      return entry.isDirectory()
        ? files(child)
        : /\.tsx?$/.test(entry.name)
          ? [child]
          : [];
    },
  );
}

describe('frontend permission contracts', () => {
  it('every frontend permission literal belongs to the authoritative catalogue', () => {
    const catalogue = new Set<string>(ALL_PERMISSIONS);
    const unknown: string[] = [];
    let checked = 0;
    for (const path of ['app', 'components', 'lib'].flatMap(files)) {
      walk(source(path), (node) => {
        const namespaces = new Set(
          ALL_PERMISSIONS.map((key) => key.split('.')[0]),
        );
        const directCheck =
          node.parent &&
          ts.isCallExpression(node.parent) &&
          /^(can|canAny|hasPermission|permissions\.includes)$/.test(
            node.parent.expression.getText(),
          );
        if (
          ts.isStringLiteral(node) &&
          (directCheck ||
            (/^[a-z_]+\.[a-z_]+$/.test(node.text) &&
              namespaces.has(node.text.split('.')[0]!)))
        ) {
          checked++;
          if (!catalogue.has(node.text)) unknown.push(`${path}: ${node.text}`);
        }
      });
    }
    expect(checked).toBeGreaterThan(50);
    expect(unknown).toEqual([]);
  });

  it.each(managementChecks)(
    '%s gates %s on %s, without an override fallback',
    (path, variable, permission) => {
      const checks: ts.Expression[] = [];
      walk(source(path), (node) => {
        if (
          ts.isVariableDeclaration(node) &&
          node.name.getText() === variable &&
          node.initializer
        ) {
          checks.push(node.initializer);
        }
      });
      expect(checks).toHaveLength(1);
      const check = checks[0]!;
      expect(ts.isCallExpression(check)).toBe(true);
      if (!ts.isCallExpression(check))
        throw new Error('Expected a permission check');
      expect(check.expression.getText()).toBe('can');
      expect(check.arguments).toHaveLength(1);
      const argument = check.arguments[0]!;
      expect(ts.isStringLiteral(argument)).toBe(true);
      if (!ts.isStringLiteral(argument))
        throw new Error('Expected a permission identifier');
      expect(argument.text).toBe(permission);
      expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toContain(argument.text);
      for (const role of [ROLES.KITCHEN, ROLES.DISPATCH, ROLES.DRIVER]) {
        if (permission === 'driver.update' && role === ROLES.DRIVER) {
          expect(ROLE_PERMISSIONS[role]).toContain(argument.text);
        } else {
          expect(ROLE_PERMISSIONS[role]).not.toContain(argument.text);
        }
      }
    },
  );

  it('billing management actions use billing.manage', () => {
    const checks: string[] = [];
    walk(source('app/billing/page.tsx'), (node) => {
      if (ts.isCallExpression(node) && node.expression.getText() === 'can') {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument))
          checks.push(argument.text);
      }
    });
    expect(checks.length).toBeGreaterThan(0);
    expect(new Set(checks)).toEqual(new Set(['billing.manage']));
  });

  it('the new-order route requires orders.edit rather than the parent orders.view permission', () => {
    const checks: ts.ConditionalExpression[] = [];
    walk(source('components/layout/AppShell.tsx'), (node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText() === 'allowed' &&
        node.initializer && ts.isConditionalExpression(node.initializer)) checks.push(node.initializer);
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]!.condition.getText()).toBe("pathname === '/orders/new'");
    expect(checks[0]!.whenTrue.getText()).toBe("canAny(['orders.edit'])");
    expect(ROLE_PERMISSIONS[ROLES.ADMIN]).toContain('orders.edit');
    for (const role of [ROLES.KITCHEN, ROLES.DISPATCH, ROLES.DRIVER]) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('orders.edit');
    }
  });
});
