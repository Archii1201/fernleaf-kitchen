import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { Public } from './decorators/public.decorator.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';
import { RequirePermissions, REQUIRED_PERMISSIONS_KEY } from './decorators/require-permissions.decorator.js';
import { PERMISSIONS } from './permissions.js';

const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
const CONTROLLERS_METADATA = 'controllers';
const IMPORTS_METADATA = 'imports';

type Ctor = new (...args: never[]) => unknown;

interface DynamicModuleLike {
  module?: Ctor;
  imports?: unknown[];
  controllers?: Ctor[];
}

export interface RouteInspection {
  controllerName: string;
  handlerName: string;
  name: string;
  isPublic: boolean;
  requiredPermissions: string[];
}

/**
 * Discovers all controllers in the application module graph through metadata reflection.
 */
export function discoverControllers(moduleRef: unknown, seen = new Set<unknown>()): Ctor[] {
  if (!moduleRef || seen.has(moduleRef)) {
    return [];
  }
  seen.add(moduleRef);

  const dynamic = moduleRef as DynamicModuleLike;
  const target = typeof moduleRef === 'function' ? moduleRef : dynamic.module;

  const controllers: Ctor[] = [
    ...(dynamic.controllers ?? []),
    ...(target ? ((Reflect.getMetadata(CONTROLLERS_METADATA, target) as Ctor[]) ?? []) : []),
  ];

  const imports: unknown[] = [
    ...(dynamic.imports ?? []),
    ...(target ? ((Reflect.getMetadata(IMPORTS_METADATA, target) as unknown[]) ?? []) : []),
  ];

  for (const imported of imports) {
    controllers.push(...discoverControllers(imported, seen));
  }

  return [...new Set(controllers)];
}

/**
 * Extracts and inspects security metadata on all route handlers in a controller.
 */
export function inspectControllerRoutes(controller: Ctor): RouteInspection[] {
  const prototype = controller.prototype as Record<string, unknown>;
  const classIsPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
  const classPermissions = (Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controller) as string[] | undefined) ?? [];

  return Object.getOwnPropertyNames(prototype)
    .filter((property) => property !== 'constructor')
    .map((property) => prototype[property])
    .filter(
      (handler): handler is (...args: unknown[]) => unknown =>
        typeof handler === 'function' &&
        Reflect.hasMetadata(PATH_METADATA, handler) &&
        Reflect.hasMetadata(METHOD_METADATA, handler),
    )
    .map((handler) => {
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true || classIsPublic;
      const handlerPermissions =
        (Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler) as string[] | undefined) ?? [];
      const requiredPermissions = handlerPermissions.length > 0 ? handlerPermissions : classPermissions;

      return {
        controllerName: controller.name,
        handlerName: handler.name,
        name: `${controller.name}.${handler.name}`,
        isPublic,
        requiredPermissions,
      };
    });
}

describe('Step 24 Part 6: Permission Coverage & Route Protection Tests', () => {
  const allControllers = discoverControllers(AppModule);
  const allRoutes = allControllers.flatMap(inspectControllerRoutes);

  it('discovers the complete route catalog through reflection', () => {
    expect(allControllers.length).toBeGreaterThan(5);
    expect(allRoutes.length).toBeGreaterThan(20);
  });

  it('verifies that EVERY application route is protected by @RequirePermissions or explicitly marked @Public', () => {
    const unprotectedRoutes = allRoutes.filter(
      (route) => !route.isPublic && route.requiredPermissions.length === 0,
    );

    if (unprotectedRoutes.length > 0) {
      const formatted = unprotectedRoutes.map((r) => r.name).join(', ');
      throw new Error(`Found unprotected API routes without authorization: ${formatted}`);
    }

    expect(unprotectedRoutes).toEqual([]);
  });

  it('ensures no route is both @Public and @RequirePermissions (contradictory security declaration)', () => {
    const contradictoryRoutes = allRoutes.filter(
      (route) => route.isPublic && route.requiredPermissions.length > 0,
    );

    expect(contradictoryRoutes).toEqual([]);
  });

  it('strictly limits public routes to the designated whitelist', () => {
    const publicRoutes = allRoutes
      .filter((route) => route.isPublic)
      .map((route) => route.name)
      .sort();

    // Only authentication entrypoints and health probes may be public
    expect(publicRoutes).toEqual([
      'AuthController.login',
      'AuthController.logout',
      'HealthController.check',
    ]);
  });

  it('regression protection: fails security inspection if a route is left without permission decorator', () => {
    // Dummy controller without @Public() and without @RequirePermissions()
    @Controller('unprotected-test')
    class UnprotectedDummyController {
      @Get('leak')
      leakData() {
        return { secret: true };
      }
    }

    const inspected = inspectControllerRoutes(UnprotectedDummyController);
    expect(inspected).toHaveLength(1);

    const unprotected = inspected.filter(
      (r) => !r.isPublic && r.requiredPermissions.length === 0,
    );
    expect(unprotected).toHaveLength(1);
    expect(unprotected[0].name).toBe('UnprotectedDummyController.leakData');
  });

  it('regression protection: fails if a route is decorated contradictorily with both @Public and @RequirePermissions', () => {
    @Controller('contradictory-test')
    class ContradictoryDummyController {
      @Get('confused')
      @Public()
      @RequirePermissions(PERMISSIONS.ORDERS_EDIT)
      confusedEndpoint() {
        return { ok: true };
      }
    }

    const inspected = inspectControllerRoutes(ContradictoryDummyController);
    expect(inspected).toHaveLength(1);

    const contradictory = inspected.filter(
      (r) => r.isPublic && r.requiredPermissions.length > 0,
    );
    expect(contradictory).toHaveLength(1);
    expect(contradictory[0].name).toBe('ContradictoryDummyController.confusedEndpoint');
  });
});
