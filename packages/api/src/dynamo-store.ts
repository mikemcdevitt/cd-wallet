import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { HttpError } from "./errors";
import type {
  AddResult,
  DeviceRecord,
  LibraryPage,
  Settings,
  Store,
  StoredTrack,
  TrackWrite,
} from "./store";

/**
 * Single-table layout (partition key `pk` only):
 *   TRACK#<sha256>   one item per track, also in the `byVersion` index
 *   DEVICE#<id>      one item per paired phone
 *   SETTINGS         admin token hash and the library version counter
 */
export const VERSION_INDEX = "byVersion";
const LIBRARY = "LIBRARY";
const TRACK_PREFIX = "TRACK#";
const MAX_ADD_ATTEMPTS = 5;

const trackPk = (hash: string): string => `${TRACK_PREFIX}${hash}`;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type Item = Record<string, unknown>;

function toStored(item: Item): StoredTrack {
  const { pk: _pk, gsi1pk: _g1, gsi1sk, audioKey: _a, artKey: _k, ...rest } = item;
  return { ...rest, version: Number(gsi1sk) } as unknown as StoredTrack;
}

export class DynamoStore implements Store {
  private readonly doc: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    client: DynamoDBClient = new DynamoDBClient({}),
  ) {
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async getSettings(): Promise<Settings> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: "SETTINGS" }, ConsistentRead: true }),
    );
    const item = res.Item;
    const settings: Settings = { libraryVersion: Number(item?.libraryVersion ?? 0) };
    if (typeof item?.adminTokenHash === "string") settings.adminTokenHash = item.adminTokenHash;
    return settings;
  }

  async getDevice(id: string): Promise<DeviceRecord | undefined> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: `DEVICE#${id}` }, ConsistentRead: true }),
    );
    const item = res.Item;
    if (!item) return undefined;
    const device: DeviceRecord = {
      id,
      name: String(item.name ?? ""),
      tokenHash: String(item.tokenHash ?? ""),
      pairedAt: String(item.pairedAt ?? ""),
    };
    if (typeof item.lastSeenAt === "string") device.lastSeenAt = item.lastSeenAt;
    return device;
  }

  async findLiveHashes(hashes: string[]): Promise<Set<string>> {
    const live = new Set<string>();
    const unique = [...new Set(hashes)];
    for (let i = 0; i < unique.length; i += 100) {
      let keys: Array<Record<string, unknown>> = unique
        .slice(i, i + 100)
        .map((hash) => ({ pk: trackPk(hash) }));
      for (let attempt = 0; keys.length > 0 && attempt < 6; attempt++) {
        if (attempt > 0) await sleep(50 * 2 ** attempt);
        const res = await this.doc.send(
          new BatchGetCommand({
            RequestItems: {
              [this.tableName]: { Keys: keys, ConsistentRead: true, ProjectionExpression: "pk, deletedAt" },
            },
          }),
        );
        for (const item of res.Responses?.[this.tableName] ?? []) {
          if (!item.deletedAt) live.add(String(item.pk).slice(TRACK_PREFIX.length));
        }
        keys = res.UnprocessedKeys?.[this.tableName]?.Keys ?? [];
      }
      if (keys.length > 0) throw new HttpError(503, "throttled", "Database is busy, try again");
    }
    return live;
  }

  async addTrack(write: TrackWrite): Promise<AddResult> {
    const { meta, now } = write;
    const pk = trackPk(meta.hash);

    for (let attempt = 0; attempt < MAX_ADD_ATTEMPTS; attempt++) {
      const [settings, existingRes] = await Promise.all([
        this.getSettings(),
        this.doc.send(new GetCommand({ TableName: this.tableName, Key: { pk }, ConsistentRead: true })),
      ]);
      const existing = existingRes.Item;
      if (existing && !existing.deletedAt) {
        return { track: toStored(existing), created: false, libraryVersion: settings.libraryVersion };
      }

      const next = settings.libraryVersion + 1;
      const item: Item = {
        ...meta,
        pk,
        gsi1pk: LIBRARY,
        gsi1sk: next,
        audioKey: write.audioKey,
        artKey: write.artKey,
        addedAt: typeof existing?.addedAt === "string" ? existing.addedAt : now,
        updatedAt: now,
      };

      try {
        // One transaction bumps the counter and writes the track, so versions never have gaps
        // and two writers can't take the same version. If another writer got there first,
        // the condition fails and we retry with fresh values.
        await this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: this.tableName,
                  Key: { pk: "SETTINGS" },
                  UpdateExpression: "SET libraryVersion = :next",
                  ConditionExpression: "attribute_not_exists(libraryVersion) OR libraryVersion = :cur",
                  ExpressionAttributeValues: { ":next": next, ":cur": settings.libraryVersion },
                },
              },
              {
                Put: {
                  TableName: this.tableName,
                  Item: item,
                  ConditionExpression: "attribute_not_exists(pk) OR attribute_exists(deletedAt)",
                },
              },
            ],
          }),
        );
      } catch (err) {
        if (err instanceof Error && err.name === "TransactionCanceledException") {
          await sleep(20 * (attempt + 1));
          continue;
        }
        throw err;
      }
      return { track: toStored(item), created: true, libraryVersion: next };
    }
    throw new HttpError(503, "busy", "Library is busy, try again");
  }

  async listChanges(after: number, limit: number): Promise<LibraryPage> {
    // Read the counter first. Anything committed later is picked up on the next sync.
    const settings = await this.getSettings();
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: VERSION_INDEX,
        KeyConditionExpression: "gsi1pk = :p AND gsi1sk > :after",
        ExpressionAttributeValues: { ":p": LIBRARY, ":after": after },
        ScanIndexForward: true,
        Limit: limit,
      }),
    );
    const tracks = (res.Items ?? []).map(toStored);
    const hasMore = res.LastEvaluatedKey !== undefined;
    const last = tracks[tracks.length - 1];
    const version = hasMore ? (last?.version ?? after) : Math.max(settings.libraryVersion, last?.version ?? 0);
    return { version, tracks, hasMore };
  }
}
