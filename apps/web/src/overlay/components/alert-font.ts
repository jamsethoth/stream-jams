export type FontLoader = (assetId: string) => Promise<Blob>;
interface LoadedFont { readonly family: string; readonly face: FontFace; }
interface FontEntry { readonly promise: Promise<LoadedFont>; users: number; }
const fonts = new WeakMap<FontLoader, Map<string, FontEntry>>();
let nextFamily = 0;

/** Loader identity includes delivery version/auth scope; entries live only while used. */
export function acquireAlertFont(assetId: string, load: FontLoader): { ready: Promise<string>; release: () => void } {
  let entries = fonts.get(load);
  if (entries === undefined) { entries = new Map(); fonts.set(load, entries); }
  let entry = entries.get(assetId);
  if (entry === undefined) {
    if (entries.size >= 64) return { ready: Promise.reject(new Error("Too many fonts are preparing. Remove unused text layers and retry.")), release: () => undefined };
    const family = `stream-jams-font-${++nextFamily}`;
    const promise = load(assetId).then(async blob => {
      if (blob.size > 10 * 1024 * 1024) throw new Error("Font exceeds the supported size.");
      const face = new FontFace(family, await blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      return { family, face };
    });
    entry = { promise, users: 0 };
    entries.set(assetId, entry);
  }
  entry.users++;
  const current = entry;
  let released = false;
  return {
    ready: current.promise.then(font => font.family),
    release: () => {
      if (released) return;
      released = true;
      current.users--;
      if (current.users === 0) {
        entries.delete(assetId);
        void current.promise.then(font => document.fonts.delete(font.face), () => undefined);
      }
    }
  };
}
