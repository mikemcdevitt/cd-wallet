import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

export const sha256Buffer = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
