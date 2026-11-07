import { createInterface } from "node:readline/promises";

export const isInteractive = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function confirm(question: string): Promise<boolean> {
  return /^y(es)?$/i.test(await ask(`${question} [y/N] `));
}
