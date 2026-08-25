import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

export function createTestPrisma() {
  return new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
}

export async function createIdentity(prisma, suffix = randomUUID().slice(0, 8), { tenantId, userId, role = "A", isDefault = true } = {}) {
  const resolvedTenantId = tenantId || randomUUID();
  const resolvedUserId = userId || randomUUID();
  const tenantCode = `MT01B-${suffix}`.toUpperCase().slice(0, 64);
  if (!tenantId) {
    await prisma.tenant.create({
      data: { id: resolvedTenantId, code: tenantCode, name: `MT-01B ${suffix}` },
    });
  }
  if (!userId) {
    await prisma.user.create({
      data: {
        id: resolvedUserId,
        code: `MT01B-U-${suffix}`,
        name: `Usuario sintético ${suffix}`,
        email: `mt01b-${suffix}@example.invalid`,
        phone: "0000000000",
        role,
        status: "active",
        department: "QA",
        joinDate: "2026-08-03",
        passwordHash: "not-used",
      },
    });
  }
  const membership = await prisma.tenantMembership.create({
    data: {
      id: randomUUID(),
      tenantId: resolvedTenantId,
      userId: resolvedUserId,
      role,
      status: "ACTIVE",
      isDefault,
    },
  });
  return { tenantId: resolvedTenantId, userId: resolvedUserId, membershipId: membership.id, role, authorizationVersion: 1 };
}

export function syntheticRequest({ userAgent = "MT01B-Test/1.0", clientId = "mt01b-test-client", origin = "http://localhost:5173", cookie, authorization } = {}) {
  return {
    method: "POST",
    socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" },
    headers: {
      "user-agent": userAgent,
      "x-osi-client-id": clientId,
      origin,
      host: new URL(origin).host,
      "x-forwarded-proto": new URL(origin).protocol.slice(0, -1),
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
    },
  };
}

export function mockResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.ended = true; return this; },
    end() { this.ended = true; return this; },
    headers,
  };
}
