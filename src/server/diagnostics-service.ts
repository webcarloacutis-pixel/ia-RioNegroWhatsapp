import { prisma } from "@/lib/prisma";
import { classifyPrismaError, getRecentSafeLogs, logger, sanitizeError } from "@/lib/logger";

type EnvGroup = Record<string, boolean>;

export type EnvDiagnostics = {
  ok: boolean;
  database: EnvGroup;
  ultramsg: EnvGroup;
  openai: EnvGroup;
  cloudinary: EnvGroup;
  scheduler: EnvGroup;
  security: EnvGroup;
};

export type DbDiagnostics = {
  ok: boolean;
  connected: boolean;
  responseMs: number;
  tables: Record<string, boolean>;
  issues: Array<{
    table: string;
    problem: string;
    suggestion: string;
  }>;
  error: ReturnType<typeof sanitizeError> | null;
};

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function groupStatus(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, hasEnv(key)]));
}

function allTrue(group: EnvGroup) {
  return Object.values(group).every(Boolean);
}

export function getEnvDiagnostics(): EnvDiagnostics {
  const diagnostics = {
    database: groupStatus(["DATABASE_URL"]),
    ultramsg: groupStatus([
      "ULTRAMSG_TOKEN",
      "ULTRAMSG_INSTANCE_ID",
      "ULTRAMSG_DEFAULT_TO",
    ]),
    openai: groupStatus(["OPENAI_API_KEY", "OPENAI_CHAT_MODEL"]),
    cloudinary: groupStatus([
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ]),
    scheduler: groupStatus(["CRON_SECRET", "SCHEDULER_ENABLED"]),
    security: groupStatus(["SESSION_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"]),
  };
  const missing = Object.entries(diagnostics).flatMap(([group, values]) =>
    Object.entries(values)
      .filter(([, present]) => !present)
      .map(([name]) => ({ group, name })),
  );

  for (const item of missing) {
    logger.warn("env", "missing required variable", item);
  }

  return {
    ok: Object.values(diagnostics).every(allTrue),
    ...diagnostics,
  };
}

async function tableExists(tableName: string) {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = ${tableName}
    ) AS "exists"
  `;

  return Boolean(result[0]?.exists);
}

export async function getDbDiagnostics(): Promise<DbDiagnostics> {
  const startedAt = Date.now();
  const tablesToCheck = [
    "Announcement",
    "Segment",
    "DeliveryLog",
    "KnowledgeBaseEntry",
    "CitizenReport",
    "SchedulerRun",
  ];

  try {
    await prisma.$queryRaw`SELECT 1`;

    const tableEntries = await Promise.all(
      tablesToCheck.map(async (table) => [table, await tableExists(table)] as const),
    );
    const tables = Object.fromEntries(tableEntries);
    const issues = Object.entries(tables)
      .filter(([, exists]) => !exists)
      .map(([table]) => ({
        table,
        problem: "TABLE_NOT_FOUND",
        suggestion: "Run npx prisma db push",
      }));

    return {
      ok: issues.length === 0,
      connected: true,
      responseMs: Date.now() - startedAt,
      tables,
      issues,
      error: null,
    };
  } catch (error) {
    const classification = classifyPrismaError(error);
    logger.error("db", "database diagnostics failed", {
      classification,
      error: sanitizeError(error),
    });

    return {
      ok: false,
      connected: false,
      responseMs: Date.now() - startedAt,
      tables: Object.fromEntries(tablesToCheck.map((table) => [table, false])),
      issues: [
        {
          table: "database",
          problem: classification.type,
          suggestion:
            classification.type === "TABLE_NOT_FOUND"
              ? "Run npx prisma db push"
              : "Review Render DATABASE_URL and database availability.",
        },
      ],
      error: sanitizeError(error),
    };
  }
}

export async function getDiagnosticsOverview() {
  const [env, db] = await Promise.all([getEnvDiagnostics(), getDbDiagnostics()]);

  return {
    env,
    db,
    logs: getRecentSafeLogs(20),
  };
}
