import { NextResponse } from "next/server";
import { getPloyContext } from "@meetploy/nextjs";

export async function GET() {
  const { env } = getPloyContext();

  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS repo_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      days_analyzed INTEGER,
      total_runs INTEGER,
      analyzed_runs INTEGER,
      linux_minutes REAL DEFAULT 0,
      windows_minutes REAL DEFAULT 0,
      macos_minutes REAL DEFAULT 0,
      actual_cost REAL DEFAULT 0,
      monthly_cost REAL DEFAULT 0,
      yearly_cost REAL DEFAULT 0,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return NextResponse.json({ success: true });
}
