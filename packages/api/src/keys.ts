/** S3 object keys. Content-addressed, so re-uploading the same file is a no-op. */
export const audioKey = (hash: string): string => `audio/${hash}.mp3`;
export const artKey = (hash: string): string => `art/${hash}.jpg`;
