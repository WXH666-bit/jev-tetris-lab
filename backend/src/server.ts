import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createApp } from "./app.js";
import { ProviderStore } from "./services/providerStore.js";
const store = new ProviderStore();
const app = createApp(store);
const client = resolve("dist/client");
if (existsSync(client)) {
  app.use(express.static(client));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(resolve(client, "index.html")),
  );
}
const port = Number(process.env.PORT || 3001);
app.listen(port, "127.0.0.1", () =>
  console.log(
    `Jev Tetris Lab http://127.0.0.1:${port} | ${store.secrets.mode}`,
  ),
);
