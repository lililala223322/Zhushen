export const statKeys = [
  "strength",
  "technique",
  "agility",
  "perception",
  "will",
  "constitution",
] as const;

export type StatKey = (typeof statKeys)[number];

export type StatVector = Record<StatKey, number>;

export const statLabels: Record<StatKey, string> = {
  strength: "力量",
  technique: "技巧",
  agility: "敏捷",
  perception: "感知",
  will: "意志",
  constitution: "体质",
};
