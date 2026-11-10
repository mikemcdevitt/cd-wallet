import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveConfig, type DeploymentConfig } from "../config";
import { CliError } from "../errors";
import { makeM4a } from "../testing/m4a";
import { fakeJpeg, makeMp3 } from "../testing/mp3";
import { startLocalApi, type LocalApi } from "../testing/local-api";
import { runImport } from "./run";

const TOKEN = "cda_test-token";

let api: LocalApi;
let base: string;
let music: string;
let env: NodeJS.ProcessEnv;
const logged: string[] = [];
const io = () => ({ env, log: (line: string) => void logged.push(line), progress: false });

async function put(rel: string, data: Buffer | string): Promise<void> {
  const file = path.join(music, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

async function saveDeployment(token = TOKEN): Promise<void> {
  const config: DeploymentConfig = {
    version: 1, name: "default", accountId: "1".repeat(12), region: "us-east-1", stackName: "CdWallet",
    apiUrl: api.url, bucketName: "b", tableName: "t", adminToken: token, monthlyBudgetUsd: 10,
    deployedAt: "2026-11-07T12:00:00.000Z",
  };
  await saveConfig(config, path.join(base, "home"));
}

beforeEach(async () => {
  logged.length = 0;
  api = await startLocalApi(TOKEN);
  base = await mkdtemp(path.join(os.tmpdir(), "cdw-e2e-"));
  music = path.join(base, "Music");
  env = { CDWALLET_HOME: path.join(base, "home"), INIT_CWD: base };

  const cover = fakeJpeg(7);
  await put("Radiohead/OK Computer/01 Airbag.mp3", makeMp3({ title: "Airbag", artist: "Radiohead", album: "OK Computer", track: "1", cover, seed: 1 }));
  await put("Radiohead/OK Computer/02 Paranoid Android.mp3", makeMp3({ title: "Paranoid Android", artist: "Radiohead", album: "OK Computer", track: "2", cover, seed: 2 }));
  await put("Misc/Some Artist/Some Album/03 - Mystery.mp3", makeMp3({ seed: 3 }));
  await put("Backup/copy of airbag.mp3", makeMp3({ title: "Airbag", artist: "Radiohead", album: "OK Computer", track: "1", cover, seed: 1 }));
  await put("broken.mp3", "this is not an mp3 ".repeat(40));
  await put("notes.txt", "ignore me");
  await put(".DS_Store", "ignore me");
  await saveDeployment();
});

afterEach(async () => {
  await api.close();
  await rm(base, { recursive: true, force: true });
});

describe("cdwallet import (end to end, against the real API handlers)", () => {
  it("uploads new tracks, shares cover art, flags untagged files and reports the bad file", async () => {
    const result = await runImport(["Music"], io());

    expect(result).toMatchObject({ added: 3, duplicatesInFolder: 1, alreadyInLibrary: 0, artSkipped: 0 });
    expect(result.untagged).toEqual(["Music/Misc/Some Artist/Some Album/03 - Mystery.mp3"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.file).toBe("broken.mp3");

    const keys = [...api.objects.keys()];
    expect(keys.filter((k) => k.startsWith("audio/"))).toHaveLength(3);
    expect(keys.filter((k) => k.startsWith("art/"))).toHaveLength(1); // both albums tracks share one cover

    const page = await api.store.listChanges(0, 100);
    expect(page.tracks.map((t) => [t.title, t.artist, t.album, t.metaSource, t.trackNo])).toEqual([
      ["Mystery", "Some Artist", "Some Album", "folder", 3],
      ["Airbag", "Radiohead", "OK Computer", "tags", 1],
      ["Paranoid Android", "Radiohead", "OK Computer", "tags", 2],
    ]);
    expect(logged.join("\n")).toContain("Added 3 tracks.");
  });

  it("imports M4A files next to MP3s, stores them as m4a, and lists unsupported files as skipped", async () => {
    const cover = fakeJpeg(7);
    await put("Beck/Odelay/01 Devils Haircut.m4a", makeM4a({ title: "Devils Haircut", artist: "Beck", album: "Odelay", track: 1, cover, seed: 80 }));
    await put("Beck/Odelay/02 Hotwax.m4a", makeM4a({ title: "Hotwax", artist: "Beck", album: "Odelay", track: 2, cover, seed: 81 }));
    await put("Bought/Store/01 Protected.m4p", makeM4a({ codec: "drms", seed: 82 }));
    await put("Bought/Store/02 Lossless.m4a", makeM4a({ codec: "alac", title: "L", artist: "A", album: "B", seed: 83 }));

    const result = await runImport(["Music"], io());
    expect(result).toMatchObject({ added: 5, duplicatesInFolder: 1 });
    expect(result.skipped.map((s) => s.file).sort()).toEqual(["Music/Bought/Store/01 Protected.m4p", "Music/Bought/Store/02 Lossless.m4a"].map((f) => f.replace("Music/", "")));
    expect(result.failures.map((f) => f.file)).toEqual(["broken.mp3"]);

    const audio = [...api.objects.keys()].filter((k) => k.startsWith("audio/"));
    expect(audio.filter((k) => k.endsWith(".m4a"))).toHaveLength(2);
    expect(audio.filter((k) => k.endsWith(".mp3"))).toHaveLength(3);

    const tracks = (await api.store.listChanges(0, 100)).tracks;
    expect(tracks.filter((t) => t.container === "m4a").map((t) => t.title).sort()).toEqual(["Devils Haircut", "Hotwax"]);
    expect(tracks.filter((t) => t.container === undefined)).toHaveLength(3);

    const text = logged.join("\n");
    expect(text).toContain("2 files skipped (not supported):");
    expect(text).toContain("Added 5 tracks.");
  });

  it("tells the owner to redeploy when the server predates M4A support", async () => {
    await put("Beck/Odelay/01 Devils Haircut.m4a", makeM4a({ title: "Devils Haircut", artist: "Beck", album: "Odelay", seed: 90 }));
    // An older server ignores "container" and answers without it.
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const res = await realFetch(input, init);
      if (!String(input).endsWith("/uploads")) return res;
      const { container: _container, ...old } = (await res.json()) as Record<string, unknown>;
      return new Response(JSON.stringify(old), { status: res.status, headers: { "content-type": "application/json" } });
    });
    await expect(runImport(["Music"], io())).rejects.toThrow(/cdwallet deploy/);
    vi.restoreAllMocks();
  });

  it("is safe to run again: nothing is uploaded twice", async () => {
    await runImport(["Music"], io());
    const putsAfterFirst = api.puts();

    const second = await runImport(["Music"], io());
    expect(second).toMatchObject({ added: 0, alreadyInLibrary: 3 });
    expect(api.puts()).toBe(putsAfterFirst);
    expect((await api.store.getSettings()).libraryVersion).toBe(3);
  });

  it("picks up only the new files when the folder grows", async () => {
    await runImport(["Music"], io());
    await put("New/Band/New Album/01 Fresh.mp3", makeMp3({ title: "Fresh", artist: "Band", album: "New Album", seed: 50 }));

    const next = await runImport(["Music"], io());
    expect(next).toMatchObject({ added: 1, alreadyInLibrary: 3 });
  });

  it("--dry-run reads everything but uploads nothing and needs no deployment", async () => {
    await rm(path.join(base, "home"), { recursive: true, force: true });
    const result = await runImport(["Music", "--dry-run"], io());

    expect(result).toMatchObject({ dryRun: true, added: 0, filesFound: 5, duplicatesInFolder: 1 });
    expect(api.puts()).toBe(0);
    expect(logged.join("\n")).toContain("Dry run: nothing was uploaded.");
  });

  it("stops with a clear message when the admin token is rejected", async () => {
    await saveDeployment("cda_wrong-token");
    await expect(runImport(["Music"], io())).rejects.toThrow(/rejected the saved admin token/);
    expect(api.puts()).toBe(0);
  });

  it("asks for a deploy first when there is no saved deployment", async () => {
    await rm(path.join(base, "home"), { recursive: true, force: true });
    await expect(runImport(["Music"], io())).rejects.toThrow(/Run `cdwallet deploy` first/);
  });

  it("rejects a folder that does not exist", async () => {
    await expect(runImport(["Nope"], io())).rejects.toBeInstanceOf(CliError);
  });

  it("keeps going when one track fails to save and reports it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // the API logs the deliberate failure below
    await put("Late/Change/01 Grows.mp3", makeMp3({ title: "Grows", artist: "Late", album: "Change", seed: 70 }));
    const original = api.store.addTrack.bind(api.store);
    api.store.addTrack = async (write) => {
      if (write.meta.title === "Grows") throw new Error("database offline");
      return original(write);
    };

    const result = await runImport(["Music"], io());
    expect(result.added).toBe(3);
    expect(result.failures.map((f) => f.file).sort()).toEqual(["Music/Late/Change/01 Grows.mp3", "broken.mp3"]);
    vi.restoreAllMocks();
  });
});
