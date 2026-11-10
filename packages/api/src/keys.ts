import { AUDIO_CONTAINERS, type AudioContainer } from "@cdwallet/shared";

/** S3 object keys. Content-addressed, so re-uploading the same file is a no-op. */
export const audioKey = (hash: string, container: AudioContainer = "mp3"): string =>
  `audio/${hash}.${AUDIO_CONTAINERS[container].extension}`;
export const artKey = (hash: string): string => `art/${hash}.jpg`;
