import 'reflect-metadata';
import { AppModule } from '../app.module.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';
import { REQUIRED_PERMISSIONS_KEY } from './decorators/require-permissions.decorator.js';

// Nest's own metadata keys for @Controller/@Get/@Post handlers.
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

/**
 * Walks the module graph by reflection only - no DI container, no database -
 * so the whole route table of the application is discovered automatically as
 * new modules are added.
 */
function collectControllers(
  moduleRef: unknown,
  seen = new Set<unknown>(),
): Ctor[] {
  if (!moduleRef || seen.has(moduleRef)) {
    return [];
  }

  seen.add(moduleRef);

  const dynamic = moduleRef as DynamicModuleLike;
  const target = typeof moduleRef === 'function' ? moduleRef : dynamic.module;

  const controllers: Ctor[] = [
    ...(dynamic.controllers ?? []),
    ...(target
      ? ((Reflect.getMetadata(CONTROLLERS_METADATA, target) as Ctor[]) ?? [])
      : []),
  ];

  const imports: unknown[] = [
    ...(dynamic.imports ?? []),
    ...(target
      ? ((Reflect.getMetadata(IMPORTS_METADATA, target) as unknown[]) ?? [])
      : []),
  ];

  for (const imported of imports) {
    controllers.push(...collectControllers(imported, seen));
  }

  return controllers;
}

interface Route {
  name: string;
  isPublic: boolean;
  requiredPermissions: string[] | undefined;
}

function collectRoutes(controller: Ctor): Route[] {
  const prototype = controller.prototype as Record<string, unknown>;
  const classIsPublic =
    Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
  const classPermissions = Reflect.getMetadata(
    REQUIRED_PERMISSIONS_KEY,
    controller,
  ) as string[] | undefined;

  return Object.getOwnPropertyNames(prototype)
    .filter((property) => property !== 'constructor')
    .map((property) => prototype[property])
    .filter(
      (handler): handler is (...args: unknown[]) => unknown =>
        typeof handler === 'function' &&
        Reflect.hasMetadata(PATH_METADATA, handler) &&
        Reflect.hasMetadata(METHOD_METADATA, handler),
    )
    .map((handler) => ({
      name: `${controller.name}.${handler.name}`,
      isPublic:
        Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true || classIsPublic,
      requiredPermissions:
        (Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler) as
          | string[]
          | undefined) ?? classPermissions,
    }));
}

const routes = collectControllers(AppModule).flatMap(collectRoutes);

describe('route permission coverage', () => {
  it('discovers the application routes', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('classifies every route as either @Public() or permission protected', () => {
    const unclassified = routes
      .filter(
        (route) =>
          !route.isPublic &&
          (!route.requiredPermissions ||
            route.requiredPermissions.length === 0),
      )
      .map((route) => route.name);

    expect(unclassified).toEqual([]);
  });

  it('does not let a route be public and permission protected at once', () => {
    const contradictory = routes
      .filter(
        (route) =>
          route.isPublic && (route.requiredPermissions?.length ?? 0) > 0,
      )
      .map((route) => route.name);

    expect(contradictory).toEqual([]);
  });

  it('keeps the set of public routes small and intentional', () => {
    const publicRoutes = routes
      .filter((route) => route.isPublic)
      .map((route) => route.name)
      .sort();

    expect(publicRoutes).toEqual([
      'AuthController.login',
      'AuthController.logout',
      'HealthController.check',
    ]);
  });
});
