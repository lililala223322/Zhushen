import type { ClassCategory } from "../types/class";

export const classCategories: ClassCategory[] = [
  {
    id: "cavalry",
    label: "骑兵",
    color: "red",
    classes: ["皇家骑兵", "掠袭骑兵", "重装骑兵", "统御骑士", "恐惧骑士", "天启骑士", "翼骑兵", "曙光骑兵"],
  },
  {
    id: "archer",
    label: "射手",
    color: "green",
    classes: ["长弓手", "游侠", "盾弩手", "重弩手", "丛林猎手", "魔弓手"],
  },
  {
    id: "light_infantry",
    label: "轻步兵",
    color: "blue",
    classes: ["狂战士", "大剑士", "刺客", "剑圣", "决斗士", "暗影刀客"],
  },
  {
    id: "heavy_infantry",
    label: "重步兵",
    color: "yellow",
    classes: ["王室禁卫", "铁甲军士", "重甲僧侣", "圣堂铁卫", "神鹰侍卫", "勇士精英"],
  },
  {
    id: "special",
    label: "特殊",
    color: "purple",
    classes: [],
  },
];

export function getClassCategories(): ClassCategory[] {
  return classCategories;
}

export function getClassCategory(className: string): ClassCategory {
  return classCategories.find((category) => category.classes.includes(className)) || classCategories[classCategories.length - 1]!;
}

export function groupClassesByCategory(classNames: string[]): Array<ClassCategory & { availableClasses: string[] }> {
  const itemSet = new Set(classNames);
  return classCategories
    .map((category) => ({
      ...category,
      availableClasses: category.classes.length
        ? category.classes.filter((className) => itemSet.has(className))
        : classNames.filter((className) => getClassCategory(className).id === category.id),
    }))
    .filter((category) => category.availableClasses.length > 0);
}
