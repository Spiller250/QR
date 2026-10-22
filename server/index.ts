import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { seedIfEmpty } from './scripts/resetData';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const { app, ctx } = createApp(db, config);

if (seedIfEmpty(ctx.store, config)) {
  console.log('[veriq] Empty database — seeded fictional demo data.');
}

// In production mode, serve the built SPA from the same origin.
const dist = path.resolve('dist');
if (config.isProduction && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`[veriq] API listening on http://localhost:${config.port} (database: ${config.databasePath})`);
});
