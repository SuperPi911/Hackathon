import cookieParser from "cookie-parser";
import express from "express";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, createContext } from "./trpc.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

const distPath = path.resolve("dist");
app.use(express.static(distPath));
app.get("*", (_req, res, next) => {
  res.sendFile(path.join(distPath, "index.html"), (error) => {
    if (error) next();
  });
});

app.listen(port, () => {
  console.log(`Aripi server running on http://localhost:${port}`);
});
