import { describe, expect, it } from "vitest";
import { SqlLibrary } from "./sql-library";
import { makeTrack, nodeSqlDb } from "./testing";

async function seeded() {
  const lib = await SqlLibrary.open(nodeSqlDb());
  await lib.applyChanges({
    version: 1,
    deletedIds: [],
    tracks: [
      makeTrack(1, { title: "Second", artist: "Band", album: "First LP", trackNo: 2, year: 1999 }),
      makeTrack(2, { title: "First", artist: "Band", album: "First LP", trackNo: 1, year: 1999 }),
      makeTrack(3, { title: "Hit 100%", artist: "Solo", album: "Singles" }),
      makeTrack(4, { title: "Disc two opener", artist: "Band", album: "Double", discNo: 2, trackNo: 1 }),
      makeTrack(5, { title: "Disc one closer", artist: "Band", album: "Double", discNo: 1, trackNo: 9 }),
      makeTrack(6, { title: "Collab", artist: "Guest", albumArtist: "Various", album: "Compilation" }),
      makeTrack(7, { title: "Other collab", artist: "Someone", albumArtist: "Various", album: "Compilation" }),
    ],
  });
  return lib;
}

describe("sql library", () => {
  it("lists albums grouped by album artist, with counts", async () => {
    const lib = await seeded();
    const albums = await lib.albums();
    expect(albums.map((a) => [a.album, a.artist, a.trackCount])).toEqual([
      ["Compilation", "Various", 2],
      ["Double", "Band", 2],
      ["First LP", "Band", 2],
      ["Singles", "Solo", 1],
    ]);
    expect(albums.find((a) => a.album === "First LP")?.year).toBe(1999);
  });

  it("plays an album in disc and track order", async () => {
    const lib = await seeded();
    const [double] = (await lib.albums()).filter((a) => a.album === "Double");
    expect((await lib.tracks({ albumKey: double!.key })).map((t) => t.title)).toEqual(["Disc one closer", "Disc two opener"]);
    const [lp] = (await lib.albums()).filter((a) => a.album === "First LP");
    expect((await lib.tracks({ albumKey: lp!.key })).map((t) => t.title)).toEqual(["First", "Second"]);
  });

  it("lists artists and filters albums by artist", async () => {
    const lib = await seeded();
    const artists = await lib.artists();
    expect(artists.map((a) => [a.artist, a.albumCount, a.trackCount])).toEqual([
      ["Band", 2, 4],
      ["Solo", 1, 1],
      ["Various", 1, 2],
    ]);
    const band = artists.find((a) => a.artist === "Band")!;
    expect((await lib.albums({ artistKey: band.key })).map((a) => a.album)).toEqual(["Double", "First LP"]);
  });

  it("searches title, artist and album with every word required", async () => {
    const lib = await seeded();
    expect((await lib.tracks({ query: "band first" })).map((t) => t.title)).toEqual(["First", "Second"]);
    expect((await lib.tracks({ query: "SOLO" })).map((t) => t.title)).toEqual(["Hit 100%"]);
    expect(await lib.tracks({ query: "nothing like this" })).toEqual([]);
    expect((await lib.albums({ query: "singles" })).map((a) => a.album)).toEqual(["Singles"]);
  });

  it("treats % and _ in a search literally", async () => {
    const lib = await seeded();
    expect((await lib.tracks({ query: "100%" })).length).toBe(1);
    expect((await lib.tracks({ query: "%" })).length).toBe(1);
    expect((await lib.tracks({ query: "_" })).length).toBe(0);
  });

  it("replaces a track that changed and drops deleted ones", async () => {
    const lib = await seeded();
    await lib.applyChanges({ version: 2, tracks: [makeTrack(3, { title: "Renamed" })], deletedIds: [makeTrack(1).hash] });
    expect(await lib.count()).toBe(6);
    expect((await lib.tracks({ query: "renamed" })).length).toBe(1);
  });
});
