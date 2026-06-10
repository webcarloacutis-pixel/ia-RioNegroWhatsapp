import { scoreKnowledgeEntry } from "@/lib/knowledge-metadata";
import { classifyPrismaError, logger, sanitizeError } from "@/lib/logger";
import type { KnowledgeEntrySummary } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { serializeKnowledgeEntry } from "@/server/serializers";
import { withDatabaseRetry } from "@/server/database-retry";

const KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;

type KnowledgeCacheState = {
  entries: KnowledgeEntrySummary[];
  refreshedAt: number;
};

type KnowledgeCacheResult = {
  entries: KnowledgeEntrySummary[];
  source: "db" | "cache";
  cacheAgeMs: number | null;
  dbErrorType?: ReturnType<typeof classifyPrismaError>["type"];
};

const globalForKnowledgeCache = globalThis as unknown as {
  __rionegroKnowledgeCache?: KnowledgeCacheState | null;
};

function getCache() {
  return globalForKnowledgeCache.__rionegroKnowledgeCache ?? null;
}

function setCache(entries: KnowledgeEntrySummary[]) {
  globalForKnowledgeCache.__rionegroKnowledgeCache = {
    entries,
    refreshedAt: Date.now(),
  };
}

function getCacheAgeMs(cache: KnowledgeCacheState | null) {
  return cache ? Date.now() - cache.refreshedAt : null;
}

function isCacheFresh(cache: KnowledgeCacheState | null) {
  const age = getCacheAgeMs(cache);
  return age !== null && age <= KNOWLEDGE_CACHE_TTL_MS;
}

async function fetchActiveKnowledgeEntriesFromDb(requestId?: string) {
  const entries = await withDatabaseRetry(
    "knowledge.active_entries",
    async () => {
      const rows = await prisma.knowledgeBaseEntry.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      return rows.map(serializeKnowledgeEntry);
    },
    { requestId },
  );

  setCache(entries);

  logger.info("eva-knowledge", "db_search_success", {
    requestId,
    entriesFound: entries.length,
    source: "db",
  });

  return entries;
}

export async function refreshKnowledgeCache(requestId?: string) {
  const entries = await fetchActiveKnowledgeEntriesFromDb(requestId);

  return {
    entries,
    source: "db" as const,
    cacheAgeMs: 0,
  };
}

export async function getActiveKnowledgeEntries(input: {
  requestId?: string;
  preferDatabase?: boolean;
} = {}): Promise<KnowledgeCacheResult> {
  const cache = getCache();

  if (!input.preferDatabase && isCacheFresh(cache)) {
    logger.info("eva-knowledge", "cache_hit", {
      requestId: input.requestId,
      entriesFound: cache?.entries.length ?? 0,
      cacheAgeMs: getCacheAgeMs(cache),
    });

    return {
      entries: cache?.entries ?? [],
      source: "cache",
      cacheAgeMs: getCacheAgeMs(cache),
    };
  }

  try {
    logger.info("eva-knowledge", "db_search_started", {
      requestId: input.requestId,
      hasCache: Boolean(cache?.entries.length),
      cacheAgeMs: getCacheAgeMs(cache),
    });

    const entries = await fetchActiveKnowledgeEntriesFromDb(input.requestId);

    return {
      entries,
      source: "db",
      cacheAgeMs: 0,
    };
  } catch (error) {
    const classification = classifyPrismaError(error);

    if (cache?.entries.length) {
      logger.warn("eva-knowledge", "db_search_failed_using_cache", {
        requestId: input.requestId,
        entriesFound: cache.entries.length,
        cacheAgeMs: getCacheAgeMs(cache),
        classification,
        error: sanitizeError(error),
      });

      return {
        entries: cache.entries,
        source: "cache",
        cacheAgeMs: getCacheAgeMs(cache),
        dbErrorType: classification.type,
      };
    }

    logger.error("eva-knowledge", "db_search_failed_without_cache", {
      requestId: input.requestId,
      classification,
      error: sanitizeError(error),
    });

    throw error;
  }
}

export function searchKnowledgeCache(query: string, maxItems = 4) {
  const cache = getCache();

  if (!cache?.entries.length) {
    return [];
  }

  return cache.entries
    .map((entry) => ({
      entry,
      score: scoreKnowledgeEntry(entry, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxItems);
}

export function invalidateKnowledgeCache(reason = "manual") {
  const previousSize = getCache()?.entries.length ?? 0;
  globalForKnowledgeCache.__rionegroKnowledgeCache = null;

  logger.info("eva-knowledge", "cache_invalidated", {
    reason,
    previousSize,
  });
}

export const knowledgeCacheInternals = {
  getCache,
  setCache,
  getCacheAgeMs,
  isCacheFresh,
  KNOWLEDGE_CACHE_TTL_MS,
};
