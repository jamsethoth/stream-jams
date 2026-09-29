export function isTimerAssetCompatible(role: string, mediaType: string): boolean {
  return role === "icon" ? mediaType === "image" || mediaType === "gif"
    : (role === "start-audio" || role === "end-audio") && mediaType === "audio";
}
