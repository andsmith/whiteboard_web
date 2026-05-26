const ADJECTIVES = [
  "brave", "brisk", "calm", "clever", "cozy", "crisp", "eager", "fancy",
  "fuzzy", "gentle", "happy", "jolly", "kind", "lively", "lucky", "merry",
  "nimble", "plucky", "proud", "quick", "quiet", "rapid", "royal", "silly",
  "smooth", "sneaky", "snug", "spry", "sunny", "swift", "tidy", "witty",
  "zany", "zesty",
];

const COLORS = [
  "amber", "azure", "coral", "crimson", "emerald", "golden", "indigo", "ivory",
  "jade", "lemon", "mint", "olive", "peach", "plum", "ruby", "scarlet",
  "silver", "teal", "violet", "yellow",
];

const ANIMALS = [
  "bear", "bird", "crow", "deer", "duck", "elk", "fox", "frog",
  "goat", "hawk", "lion", "lynx", "mole", "moth", "newt", "otter",
  "owl", "panda", "pony", "quail", "robin", "seal", "shark", "sloth",
  "snail", "swan", "tiger", "toad", "whale", "wolf", "yak",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function generateRoomId(): string {
  return `${pick(ADJECTIVES)}-${pick(COLORS)}-${pick(ANIMALS)}`;
}

export function isValidRoomId(s: string): boolean {
  return /^[a-z0-9-]{3,64}$/.test(s);
}
