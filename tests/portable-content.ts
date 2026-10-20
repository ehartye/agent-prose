// Match raw paths, slash-normalized paths and JSON-escaped Windows separators.
// Generic API examples outside a personal home directory remain valid.
export const personalPath = /(?:[A-Za-z]:[\\/]+Users[\\/]+|\/(?:mnt\/)?[a-z]\/Users\/|\/(?:Users|home)\/[^\s/<>]+\/|\bAppData\b)/i;
