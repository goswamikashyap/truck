import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import masterRoutes from "./routes/masters.js";
import tripRoutes from "./routes/trips.js";
import insightRoutes from "./routes/insights.js";
import { errorHandler } from "./middleware/error.js";
import { getEnv } from "./utils/env.js";

export function createApp() {
  const env = getEnv();
  const app = express();
  app.set("trust proxy", 1); // running behind nginx / a cloud load balancer
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600 }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Each router declares full paths, so they are all mounted under /api.
  app.use("/api", authRoutes);
  app.use("/api", masterRoutes);
  app.use("/api", tripRoutes);
  app.use("/api", insightRoutes);

  app.use(errorHandler);
  return app;
}
