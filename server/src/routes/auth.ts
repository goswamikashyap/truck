import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../utils/db.js";
import { getEnv } from "../utils/env.js";
import { requireAuth, type AuthUser } from "../middleware/auth.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  // Only failed attempts count, so a whole office behind one IP is not locked out by normal logins.
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts, try again later" },
});

function sign(user: { id: string; companyId: string | null; role: string }) {
  const env = getEnv();
  const base = { id: user.id, companyId: user.companyId, role: user.role };
  return {
    accessToken: jwt.sign({ ...base, type: "access" }, env.JWT_ACCESS_SECRET, {
      expiresIn: env.ACCESS_TOKEN_TTL,
    } as jwt.SignOptions),
    refreshToken: jwt.sign({ ...base, type: "refresh" }, env.JWT_REFRESH_SECRET, {
      expiresIn: env.REFRESH_TOKEN_TTL,
    } as jwt.SignOptions),
  };
}

const signupSchema = z.object({
  companyName: z.string().trim().min(2),
  gstNo: z.string().trim().optional(),
  name: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().optional(),
  password: z.string().min(8),
});

router.post("/auth/signup", authLimiter, async (req, res, next) => {
  try {
    const data = signupSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    // Company and owner are created together or not at all.
    const user = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { name: data.companyName, gstNo: data.gstNo } });
      return tx.user.create({
        data: {
          companyId: company.id,
          name: data.name,
          email: data.email,
          phone: data.phone,
          passwordHash,
          role: "COMPANY_OWNER",
        },
      });
    });
    res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role },
      ...sign(user),
    });
  } catch (e) {
    next(e);
  }
});

router.post("/auth/login", authLimiter, async (req, res, next) => {
  try {
    const { email, password } = z
      .object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) })
      .parse(req.body);
    const user = await prisma.user.findUnique({ where: { email }, include: { company: { select: { status: true } } } });
    // Same message for unknown email and wrong password, so emails cannot be guessed.
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (user.company && user.company.status !== "active") {
      return res.status(403).json({ error: "This company account is suspended. Contact support." });
    }
    res.json({ user: { id: user.id, email: user.email, role: user.role }, ...sign(user) });
  } catch (e) {
    next(e);
  }
});

router.post("/auth/refresh", authLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    let payload: AuthUser;
    try {
      payload = jwt.verify(refreshToken, getEnv().JWT_REFRESH_SECRET, { algorithms: ["HS256"] }) as AuthUser;
    } catch {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    if (payload.type !== "refresh") return res.status(401).json({ error: "Invalid refresh token" });
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { company: { select: { status: true } } },
    });
    if (!user?.active || (user.company && user.company.status !== "active")) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    res.json(sign(user));
  } catch (e) {
    next(e);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        company: { select: { id: true, name: true } },
      },
    });
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

export default router;
