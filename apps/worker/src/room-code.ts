export function generateRoomCode(random = crypto.getRandomValues(new Uint32Array(1))[0]): string {
  return random.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

export function discordRoomCode(instanceId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < instanceId.length; index += 1) {
    hash ^= instanceId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}
