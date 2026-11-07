import type {
  AddResult,
  DeviceRecord,
  LibraryPage,
  Settings,
  Store,
  StoredTrack,
  TrackWrite,
} from "../store";
import type { PresignPutRequest, Storage } from "../storage";

/** In-memory Store for tests, with the same rules as the DynamoDB one. */
export class MemoryStore implements Store {
  private adminTokenHash: string | undefined;
  private version = 0;
  private readonly tracks = new Map<string, StoredTrack>();
  private readonly devices = new Map<string, DeviceRecord>();

  setAdminTokenHash(hash: string): void {
    this.adminTokenHash = hash;
  }

  addDevice(device: DeviceRecord): void {
    this.devices.set(device.id, device);
  }

  /** Test helper: soft-delete the way a future delete endpoint will. */
  softDelete(hash: string, now: string): void {
    const track = this.tracks.get(hash);
    if (!track) return;
    this.tracks.set(hash, { ...track, version: ++this.version, deletedAt: now, updatedAt: now });
  }

  async getSettings(): Promise<Settings> {
    const settings: Settings = { libraryVersion: this.version };
    if (this.adminTokenHash) settings.adminTokenHash = this.adminTokenHash;
    return settings;
  }

  async getDevice(id: string): Promise<DeviceRecord | undefined> {
    return this.devices.get(id);
  }

  async findLiveHashes(hashes: string[]): Promise<Set<string>> {
    return new Set(hashes.filter((h) => this.tracks.get(h) && !this.tracks.get(h)?.deletedAt));
  }

  async addTrack(write: TrackWrite): Promise<AddResult> {
    const existing = this.tracks.get(write.meta.hash);
    if (existing && !existing.deletedAt) {
      return { track: existing, created: false, libraryVersion: this.version };
    }
    const stored: StoredTrack = {
      ...write.meta,
      addedAt: existing?.addedAt ?? write.now,
      updatedAt: write.now,
      version: ++this.version,
    };
    this.tracks.set(stored.hash, stored);
    return { track: stored, created: true, libraryVersion: this.version };
  }

  async listChanges(after: number, limit: number): Promise<LibraryPage> {
    const changed = [...this.tracks.values()]
      .filter((t) => t.version > after)
      .sort((a, b) => a.version - b.version);
    const tracks = changed.slice(0, limit);
    const hasMore = changed.length > limit;
    const last = tracks[tracks.length - 1];
    const version = hasMore ? (last?.version ?? after) : Math.max(this.version, last?.version ?? 0);
    return { version, tracks, hasMore };
  }
}

/** Fake S3: remembers which keys "exist" and hands out predictable URLs. */
export class FakeStorage implements Storage {
  readonly objects = new Set<string>();
  readonly presigned: PresignPutRequest[] = [];

  async objectExists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async presignPut(request: PresignPutRequest): Promise<string> {
    this.presigned.push(request);
    return `https://s3.test/${request.key}?put`;
  }

  async presignGet(key: string): Promise<string> {
    return `https://s3.test/${key}?get`;
  }
}
