import { describe, expect, it } from "vitest";
import { applyTenantScope } from "./tenant-scope";

const TENANT_A = "tenant-aaa";
const TENANT_B = "tenant-bbb";

describe("applyTenantScope", () => {
  it("injects tenantId into a findMany where clause for a scoped model", () => {
    const result = applyTenantScope("Contact", "findMany", { where: { leadStatus: "NEW" } }, TENANT_A);
    expect(result.where).toEqual({ leadStatus: "NEW", tenantId: TENANT_A });
  });

  it("injects tenantId even when no where clause was given", () => {
    const result = applyTenantScope("Contact", "findMany", {}, TENANT_A);
    expect(result.where).toEqual({ tenantId: TENANT_A });
  });

  it("overwrites a caller-supplied tenantId with the session's tenant — a forged/wrong id can't leak another tenant's rows", () => {
    const result = applyTenantScope("Contact", "findUnique", { where: { id: "contact-1", tenantId: TENANT_B } }, TENANT_A);
    expect(result.where).toEqual({ id: "contact-1", tenantId: TENANT_A });
  });

  it("injects tenantId into create data", () => {
    const result = applyTenantScope("Room", "create", { data: { name: "Deluxe King" } }, TENANT_A);
    expect(result.data).toEqual({ name: "Deluxe King", tenantId: TENANT_A });
  });

  it("injects tenantId into every row of a createMany", () => {
    const result = applyTenantScope(
      "Faq",
      "createMany",
      { data: [{ question: "Q1" }, { question: "Q2" }] },
      TENANT_A
    );
    expect(result.data).toEqual([
      { question: "Q1", tenantId: TENANT_A },
      { question: "Q2", tenantId: TENANT_A },
    ]);
  });

  it("scopes both where and create on an upsert", () => {
    const result = applyTenantScope(
      "HotelProfile",
      "upsert",
      { where: { tenantId: "irrelevant" }, create: { name: "Hotel Ivory Towers" }, update: { name: "New name" } },
      TENANT_A
    );
    expect(result.where).toEqual({ tenantId: TENANT_A });
    expect(result.create).toEqual({ name: "Hotel Ivory Towers", tenantId: TENANT_A });
  });

  it("leaves args untouched for a model with no tenantId column", () => {
    const args = { where: { id: "tenant-1" } };
    const result = applyTenantScope("Tenant", "findUnique", args, TENANT_A);
    expect(result).toBe(args);
  });

  it("leaves args untouched when model is unknown (e.g. a raw query with no model context)", () => {
    const args = { where: { id: "x" } };
    const result = applyTenantScope(undefined, "queryRaw", args, TENANT_A);
    expect(result).toBe(args);
  });

  it("does not mutate the original args object", () => {
    const original = { where: { leadStatus: "NEW" } };
    applyTenantScope("Contact", "findMany", original, TENANT_A);
    expect(original.where).toEqual({ leadStatus: "NEW" });
  });
});
