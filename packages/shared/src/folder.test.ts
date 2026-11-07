import { describe, expect, it } from "vitest";
import { guessFromPath } from "./folder";

describe("guessFromPath", () => {
  it("reads Artist/Album/NN - Title.mp3", () => {
    expect(guessFromPath("Radiohead/OK Computer/03 - Subterranean Homesick Alien.mp3")).toEqual({
      artist: "Radiohead",
      album: "OK Computer",
      title: "Subterranean Homesick Alien",
      trackNo: 3,
    });
  });

  it("handles 'NN. Title' and 'NN Title'", () => {
    expect(guessFromPath("A/B/04. Four.mp3").trackNo).toBe(4);
    expect(guessFromPath("A/B/05 Five.mp3").title).toBe("Five");
  });

  it("leaves titles without a track number alone", () => {
    expect(guessFromPath("A/B/Song.mp3")).toEqual({ artist: "A", album: "B", title: "Song" });
  });

  it("keeps a title that is only digits", () => {
    expect(guessFromPath("A/B/1979.mp3").title).toBe("1979");
  });

  it("uses only the last three segments and either slash style", () => {
    expect(guessFromPath("Music\\Rock\\A\\B\\01 X.mp3").artist).toBe("A");
  });

  it("falls back for shallow paths", () => {
    expect(guessFromPath("Song.mp3")).toEqual({
      artist: "Unknown Artist",
      album: "Unknown Album",
      title: "Song",
    });
    expect(guessFromPath("B/Song.mp3").artist).toBe("Unknown Artist");
  });
});
