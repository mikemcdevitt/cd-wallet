/** Audio file formats the library can hold. A track with no `container` is an MP3. */
export type AudioContainer = "mp3" | "m4a";

export const AUDIO_CONTAINERS: Record<AudioContainer, { extension: string; contentType: string }> = {
  mp3: { extension: "mp3", contentType: "audio/mpeg" },
  // AAC in an MP4 container, as sold by iTunes and made by most rippers.
  m4a: { extension: "m4a", contentType: "audio/mp4" },
};

export const isAudioContainer = (value: unknown): value is AudioContainer =>
  typeof value === "string" && Object.hasOwn(AUDIO_CONTAINERS, value);
