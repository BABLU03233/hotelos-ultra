import { prisma } from "./prisma";
import { applyTenantScope } from "./tenant-scope";

/**
 * Returns a Prisma client scoped to one tenant: every query against a
 * tenant-owned model automatically gets `tenantId` merged into its `where`
 * (reads/updates/deletes) or `data` (creates), so a route handler that
 * forgets to filter by tenant still can't leak or mutate another tenant's
 * rows. This is the multi-tenant isolation guard required by the spec —
 * every API route should get its Prisma client from here, never import the
 * raw `prisma` singleton directly for tenant-owned data. The actual
 * scoping rules live in tenant-scope.ts (kept Prisma-client-free so they're
 * unit-testable without a database).
 */
export function tenantDb(tenantId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(applyTenantScope(model, operation, args as Record<string, unknown>, tenantId));
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
