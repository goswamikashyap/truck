import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { requireRole, requireAuth } from "./auth.js";
import { tenant } from "./tenant.js";

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

process.env.DATABASE_URL = "postgresql://x";
process.env.JWT_ACCESS_SECRET = "test-access-secret-123456";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-12345";

function tokenFor(payload: object, secret = process.env.JWT_ACCESS_SECRET!) {
  return jwt.sign(payload, secret, { expiresIn: "5m" });
}

describe("requireRole", () => {
  it("lets an allowed role through", () => {
    const next = vi.fn();
    requireRole("MANAGER")({ user: { id: "1", companyId: "c", role: "MANAGER" } } as any, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks a role that is not allowed with 403", () => {
    const next = vi.fn();
    const res = mockRes();
    requireRole("COMPANY_OWNER")({ user: { id: "1", companyId: "c", role: "DRIVER" } } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 without a user", () => {
    const res = mockRes();
    requireRole("MANAGER")({} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe("requireAuth", () => {
  it("rejects a missing token", () => {
    const res = mockRes();
    requireAuth({ headers: {} } as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a refresh token used as an access token", () => {
    const res = mockRes();
    const t = tokenFor({ id: "1", companyId: "c", role: "MANAGER", type: "refresh" });
    requireAuth({ headers: { authorization: `Bearer ${t}` } } as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("accepts a valid access token", () => {
    const next = vi.fn();
    const req: any = {
      headers: {
        authorization: `Bearer ${tokenFor({ id: "1", companyId: "c", role: "MANAGER", type: "access" })}`,
      },
    };
    requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe("1");
  });
});

describe("tenant isolation", () => {
  it("takes companyId from the token and ignores a company id sent by the client", () => {
    const next = vi.fn();
    const req: any = {
      headers: {
        authorization: `Bearer ${tokenFor({ id: "1", companyId: "company-A", role: "COMPANY_OWNER", type: "access" })}`,
      },
      body: { companyId: "company-B" },
      query: { companyId: "company-B" },
    };
    tenant(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.companyId).toBe("company-A");
  });

  it("blocks users without a company", () => {
    const res = mockRes();
    const req: any = {
      headers: {
        authorization: `Bearer ${tokenFor({ id: "1", companyId: null, role: "PLATFORM_ADMIN", type: "access" })}`,
      },
    };
    tenant(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
