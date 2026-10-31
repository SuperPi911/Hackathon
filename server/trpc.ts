import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { createHash, randomBytes, scrypt, timingSafeEqual, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { academyQuestions, passingScore } from "./academy.js";
import { getNearbyHeliports } from "./heliports.js";
import { getNearbyAircraft } from "./traffic.js";
import { getHourlyWeather } from "./weather.js";
import database from "./db.js";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "aripi_session";
const SESSION_DAYS = 30;

type User = { id: string; name: string; email: string };
type Context = { req: Request; res: Response; user: User | null };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  });
}

async function hashPassword(password: string, salt: string) {
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return key.toString("hex");
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return { req, res, user: null };
  const row = database.prepare(`
    SELECT users.id, users.name, users.email
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashToken(token), new Date().toISOString()) as User | undefined;
  return { req, res, user: row || null };
}

const t = initTRPC.context<Context>().create();
const publicProcedure = t.procedure;
const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
const flightProcedure = protectedProcedure.use(({ ctx, next }) => {
  const progress = database.prepare("SELECT passed_at FROM academy_progress WHERE user_id = ?")
    .get(ctx.user.id) as { passed_at: string | null } | undefined;
  if (!progress?.passed_at) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Promovează Academia Aripi înainte să accesezi planificarea zborului." });
  }
  return next();
});

const cameraSchema = z.object({
  manufacturer: z.string().trim().max(80).default(""),
  model: z.string().trim().max(120).default(""),
  sensor: z.string().trim().max(120).default(""),
  resolution: z.string().trim().max(80).default(""),
  focalLengthMm: z.number().min(0).max(2000).nullable().default(null),
  videoResolution: z.string().trim().max(80).default(""),
  stabilization: z.string().trim().max(80).default("")
});

const droneSchema = z.object({
  model: z.string().trim().min(1).max(120),
  manufacturer: z.string().trim().max(80).default(""),
  weightGrams: z.number().positive().max(250000),
  category: z.enum(["multirotor", "fixed-wing", "fpv", "cinewhoop", "other"]),
  uasClass: z.string().max(40).default(""),
  serial: z.string().trim().max(120).default(""),
  operatorId: z.string().trim().max(120).default(""),
  remoteId: z.string().max(40).default(""),
  camera: cameraSchema
});

type DroneInput = z.infer<typeof droneSchema>;
type DroneRow = {
  id: string;
  model: string;
  manufacturer: string;
  weight_grams: number;
  category: DroneInput["category"];
  uas_class: string;
  serial: string;
  operator_id: string;
  remote_id: string;
  camera_json: string;
};

function presentDrone(row: DroneRow) {
  return {
    id: row.id,
    model: row.model,
    manufacturer: row.manufacturer,
    weightGrams: row.weight_grams,
    category: row.category,
    uasClass: row.uas_class,
    serial: row.serial,
    operatorId: row.operator_id,
    remoteId: row.remote_id,
    camera: JSON.parse(row.camera_json) as DroneInput["camera"]
  };
}

const authRouter = t.router({
  me: publicProcedure.query(({ ctx }) => ctx.user),
  register: publicProcedure.input(z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(200)
  })).mutation(async ({ input, ctx }) => {
    const email = input.email.toLocaleLowerCase("ro-RO");
    if (database.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
      throw new TRPCError({ code: "CONFLICT", message: "Există deja un cont cu acest e-mail." });
    }
    const id = randomUUID();
    const salt = randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(input.password, salt);
    database.prepare(`
      INSERT INTO users (id, name, email, password_salt, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.name, email, salt, passwordHash, new Date().toISOString());
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(hashToken(token), id, expiresAt);
    setSessionCookie(ctx.res, token);
    return { id, name: input.name, email };
  }),
  login: publicProcedure.input(z.object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(200)
  })).mutation(async ({ input, ctx }) => {
    const row = database.prepare("SELECT * FROM users WHERE email = ?")
      .get(input.email.toLocaleLowerCase("ro-RO")) as {
        id: string; name: string; email: string; password_salt: string; password_hash: string;
      } | undefined;
    if (!row) throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mailul sau parola nu sunt corecte." });
    const candidate = Buffer.from(await hashPassword(input.password, row.password_salt), "hex");
    const saved = Buffer.from(row.password_hash, "hex");
    if (candidate.length !== saved.length || !timingSafeEqual(candidate, saved)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mailul sau parola nu sunt corecte." });
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(hashToken(token), row.id, expiresAt);
    setSessionCookie(ctx.res, token);
    return { id: row.id, name: row.name, email: row.email };
  }),
  logout: protectedProcedure.mutation(({ ctx }) => {
    const token = ctx.req.cookies?.[SESSION_COOKIE];
    if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    ctx.res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    return { success: true };
  })
});

const dronesRouter = t.router({
  list: protectedProcedure.query(({ ctx }) => {
    const rows = database.prepare("SELECT * FROM drones WHERE user_id = ? ORDER BY created_at DESC")
      .all(ctx.user.id) as DroneRow[];
    return rows.map(presentDrone);
  }),
  create: protectedProcedure.input(droneSchema).mutation(({ input, ctx }) => {
    const id = randomUUID();
    database.prepare(`
      INSERT INTO drones
      (id, user_id, model, manufacturer, weight_grams, category, uas_class, serial, operator_id, remote_id, camera_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, ctx.user.id, input.model, input.manufacturer, input.weightGrams, input.category,
      input.uasClass, input.serial, input.operatorId, input.remoteId, JSON.stringify(input.camera), new Date().toISOString());
    return { id, ...input };
  }),
  update: protectedProcedure.input(droneSchema.extend({ id: z.string().uuid() })).mutation(({ input, ctx }) => {
    const { id, ...drone } = input;
    const result = database.prepare(`
      UPDATE drones SET model = ?, manufacturer = ?, weight_grams = ?, category = ?, uas_class = ?,
      serial = ?, operator_id = ?, remote_id = ?, camera_json = ?
      WHERE id = ? AND user_id = ?
    `).run(drone.model, drone.manufacturer, drone.weightGrams, drone.category, drone.uasClass,
      drone.serial, drone.operatorId, drone.remoteId, JSON.stringify(drone.camera), id, ctx.user.id);
    if (!result.changes) throw new TRPCError({ code: "NOT_FOUND", message: "Drona nu a fost găsită." });
    return { id, ...drone };
  }),
  delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input, ctx }) => {
    const result = database.prepare("DELETE FROM drones WHERE id = ? AND user_id = ?").run(input.id, ctx.user.id);
    if (!result.changes) throw new TRPCError({ code: "NOT_FOUND", message: "Drona nu a fost găsită." });
    return { success: true };
  })
});

const academyRouter = t.router({
  get: protectedProcedure.query(({ ctx }) => {
    const progress = database.prepare("SELECT score, total, passed_at, answers_json FROM academy_progress WHERE user_id = ?")
      .get(ctx.user.id) as { score: number; total: number; passed_at: string | null; answers_json: string } | undefined;
    return {
      questions: academyQuestions.map(({ answer: _answer, ...question }) => question),
      passingScore,
      passed: Boolean(progress?.passed_at),
      score: progress?.score ?? null,
      total: progress?.total ?? academyQuestions.length,
      passedAt: progress?.passed_at ?? null,
      answers: progress ? JSON.parse(progress.answers_json) as Record<string, string> : {}
    };
  }),
  saveAnswer: protectedProcedure.input(z.object({
    questionId: z.string().min(1).max(20),
    optionId: z.string().min(1).max(20)
  })).mutation(({ input, ctx }) => {
    const question = academyQuestions.find((item) => item.id === input.questionId);
    if (!question || !question.options.some((option) => option.id === input.optionId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Răspunsul selectat nu este valid." });
    }
    const existing = database.prepare("SELECT passed_at FROM academy_progress WHERE user_id = ?")
      .get(ctx.user.id) as { passed_at: string | null } | undefined;
    if (existing?.passed_at) return { saved: true, locked: true };

    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO academy_progress (user_id, score, total, passed_at, answers_json, updated_at)
      VALUES (?, 0, ?, NULL, json_object(?, ?), ?)
      ON CONFLICT(user_id) DO UPDATE SET
        answers_json = json_set(academy_progress.answers_json, ?, ?),
        updated_at = excluded.updated_at
    `).run(ctx.user.id, academyQuestions.length, input.questionId, input.optionId, now, `$.${input.questionId}`, input.optionId);
    return { saved: true, locked: false };
  }),
  submit: protectedProcedure.input(z.object({
    answers: z.array(z.object({
      questionId: z.string().min(1).max(20),
      optionId: z.string().min(1).max(20)
    })).length(academyQuestions.length)
  })).mutation(({ input, ctx }) => {
    const previous = database.prepare("SELECT score, total, passed_at FROM academy_progress WHERE user_id = ?")
      .get(ctx.user.id) as { score: number; total: number; passed_at: string | null } | undefined;
    if (previous?.passed_at) {
      return { passed: true, score: previous.score, total: previous.total, passingScore, alreadyPassed: true };
    }

    const answers = new Map(input.answers.map(({ questionId, optionId }) => [questionId, optionId]));
    if (answers.size !== academyQuestions.length || academyQuestions.some((question) => !answers.has(question.id))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Răspunde o singură dată la fiecare întrebare." });
    }
    const score = academyQuestions.reduce((total, question) => {
      const selectedOption = answers.get(question.id);
      if (!question.options.some((option) => option.id === selectedOption)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unul dintre răspunsuri nu este valid." });
      }
      return total + Number(selectedOption === question.answer);
    }, 0);
    const passed = score >= passingScore;
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO academy_progress (user_id, score, total, passed_at, answers_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        score = excluded.score,
        total = excluded.total,
        passed_at = excluded.passed_at,
        answers_json = excluded.answers_json,
        updated_at = excluded.updated_at
    `).run(ctx.user.id, score, academyQuestions.length, passed ? now : null, JSON.stringify(Object.fromEntries(answers)), now);
    return { passed, score, total: academyQuestions.length, passingScore, alreadyPassed: false };
  })
});

const zonesRouter = t.router({
  list: flightProcedure.query(() => {
    const file = path.resolve(process.cwd(), "data/romatsa-uas-zones.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
      type: "FeatureCollection";
      timeStamp?: string;
      features: Array<{
        type: "Feature";
        geometry: { type: "Polygon"; coordinates: number[][][] };
        properties: Record<string, string>;
      }>;
    };
    if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Fișierul local ROMATSA nu conține un GeoJSON valid." });
    }
    return data;
  })
});

const weatherRouter = t.router({
  at: protectedProcedure.input(z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/)
  })).query(({ input }) => getHourlyWeather(input))
});

const trafficRouter = t.router({
  nearby: flightProcedure.input(z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })).query(({ input }) => getNearbyAircraft(input.latitude, input.longitude))
});

const flightRequestsRouter = t.router({
  mine: flightProcedure.query(({ ctx }) => {
    const rows = database.prepare(`
      SELECT id, status, request_json, submitted_at
      FROM flight_approval_requests
      WHERE user_id = ?
      ORDER BY submitted_at DESC
      LIMIT 10
    `).all(ctx.user.id) as Array<{ id: string; status: "DEMO_APPROVED"; request_json: string; submitted_at: string }>;
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      request: JSON.parse(row.request_json) as {
        date: string;
        time: string;
        droneModel: string;
        requestType?: "flight" | "photo";
        location?: string;
        purpose?: string;
        area: { west: number; east: number; south: number; north: number };
      },
      submittedAt: row.submitted_at
    }));
  }),
  submitDemo: flightProcedure.input(z.object({
    area: z.object({
      west: z.number().min(-180).max(180),
      east: z.number().min(-180).max(180),
      south: z.number().min(-90).max(90),
      north: z.number().min(-90).max(90)
    }).refine((area) => area.west < area.east && area.south < area.north, "Zona invalidă."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    droneId: z.string().uuid(),
    requestType: z.enum(["flight", "photo"]).default("flight"),
    location: z.string().trim().max(160).default(""),
    purpose: z.string().trim().max(500).default(""),
    notes: z.string().trim().max(1000).default("")
  })).mutation(({ input, ctx }) => {
    const drone = database.prepare("SELECT model, manufacturer FROM drones WHERE id = ? AND user_id = ?")
      .get(input.droneId, ctx.user.id) as { model: string; manufacturer: string } | undefined;
    if (!drone) throw new TRPCError({ code: "NOT_FOUND", message: "Drona selectată nu a fost găsită în flota ta." });

    const id = randomUUID();
    const submittedAt = new Date().toISOString();
    const request = {
      requestType: input.requestType,
      date: input.date,
      time: input.time,
      droneModel: [drone.manufacturer, drone.model].filter(Boolean).join(" "),
      area: input.area,
      location: input.location,
      purpose: input.purpose,
      notes: input.notes
    };
    database.prepare(`
      INSERT INTO flight_approval_requests (id, user_id, status, request_json, submitted_at)
      VALUES (?, ?, 'DEMO_APPROVED', ?, ?)
    `).run(id, ctx.user.id, JSON.stringify(request), submittedAt);
    return {
      id,
      status: "DEMO_APPROVED" as const,
      request,
      submittedAt,
      notice: "Statusul APROBAT este simulat exclusiv pentru demo și nu este un aviz sau o autorizare reală."
    };
  })
});

const heliportsRouter = t.router({
  nearby: flightProcedure.input(z.object({
    west: z.number().min(-180).max(180),
    east: z.number().min(-180).max(180),
    south: z.number().min(-90).max(90),
    north: z.number().min(-90).max(90)
  }).refine((area) => area.west < area.east && area.south < area.north, "Zona invalidă."))
    .query(({ input }) => getNearbyHeliports(input))
});

export const appRouter = t.router({
  auth: authRouter,
  drones: dronesRouter,
  academy: academyRouter,
  zones: zonesRouter,
  weather: weatherRouter,
  traffic: trafficRouter,
  heliports: heliportsRouter,
  flightRequests: flightRequestsRouter
});
export type AppRouter = typeof appRouter;
