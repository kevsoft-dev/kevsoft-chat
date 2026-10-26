import { neon } from "@neondatabase/serverless";
import { cfg } from "./config";
export const sql = neon(cfg.databaseUrl);
