export type ClassCategoryId =
  | "cavalry"
  | "archer"
  | "light_infantry"
  | "heavy_infantry"
  | "special";

export type ClassCategoryColor = "red" | "green" | "blue" | "yellow" | "purple";

export interface ClassCategory {
  id: ClassCategoryId;
  label: string;
  color: ClassCategoryColor;
  classes: string[];
}
