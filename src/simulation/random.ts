// 随机数由语义键寻址，新增一个事件不会挪动其他事件的外部扰动。
export function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}
export function random(seed: string, month: number, key: string): number {
  let value = hash(`${seed}|${month}|${key}`);
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
export const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));
export const round = (value: number, digits = 1) =>
  Number(value.toFixed(digits));
export function pick<T>(items: readonly T[], seed: string, key: string): T {
  return items[Math.floor(random(seed, 0, key) * items.length)];
}
export const clone = <T>(value: T): T => structuredClone(value);
