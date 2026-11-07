import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseImportArgs } from "./options";

describe("parseImportArgs", () => {
  it("resolves the folder from where the command was typed", () => {
    const opts = parseImportArgs(["songs"], { INIT_CWD: "/work" }, "/home/m");
    expect(opts).toMatchObject({ folder: path.resolve("/work", "songs"), name: "default", dryRun: false, concurrency: 4 });
  });

  it("expands ~", () => {
    expect(parseImportArgs(["~/Music"], {}, "/home/m").folder).toBe(path.join("/home/m", "Music"));
    expect(parseImportArgs(["~"], {}, "/home/m").folder).toBe("/home/m");
  });

  it("reads flags", () => {
    const opts = parseImportArgs(["/m", "--dry-run", "--name", "sandbox", "--concurrency", "8"], {}, "/h");
    expect(opts).toMatchObject({ dryRun: true, name: "sandbox", concurrency: 8 });
  });

  it("needs exactly one folder and valid numbers", () => {
    expect(() => parseImportArgs([], {}, "/h")).toThrow(/which folder/);
    expect(() => parseImportArgs(["a", "b"], {}, "/h")).toThrow(/which folder/);
    expect(() => parseImportArgs(["a", "--concurrency", "0"], {}, "/h")).toThrow(/1 to 16/);
    expect(() => parseImportArgs(["a", "--concurrency", "x"], {}, "/h")).toThrow(/1 to 16/);
    expect(() => parseImportArgs(["a", "--wat"], {}, "/h")).toThrow(/Usage: cdwallet import/);
  });

  it("shows help without needing a folder", () => {
    expect(parseImportArgs(["--help"], {}, "/h").help).toBe(true);
  });
});
