import type { Category, CategoryTree } from "../types";

/**
 * Mirror of `shared/categories/category_tree.json`. The Rust core validates
 * against the authoritative JSON; this copy keeps the web bundle self-contained.
 * Keep both in sync when editing the tree.
 */
export const CATEGORY_TREE: CategoryTree = {
  version: 1,
  categories: [
    { name: "Documents", subcategories: ["Research", "Notes", "Reports", "Legal", "Presentations"] },
    { name: "Development", subcategories: ["Code", "Documentation", "Screenshots", "Configs", "Databases"] },
    { name: "Finance", subcategories: ["Statements", "Invoices", "Receipts", "Taxes", "Budgets"] },
    { name: "Images", subcategories: ["Screenshots", "Photos", "Graphics", "Scans"] },
    { name: "Books", subcategories: ["Ebooks", "Papers", "Manuals"] },
    { name: "Work", subcategories: ["Projects", "Meetings", "Contracts"] },
    { name: "Personal", subcategories: ["Identity", "Health", "Travel", "Education"] },
    { name: "Software", subcategories: ["Installers", "Portable", "Licenses"] },
    { name: "Archives", subcategories: ["Zip", "Compressed", "Backups"] },
    { name: "Other", subcategories: ["Misc", "Unknown"] },
  ],
  fallback: { category: "Other", subcategory: "Unknown" },
};

export function categoryNames(): string[] {
  return CATEGORY_TREE.categories.map((c) => c.name);
}

export function subcategoriesOf(category: string): string[] {
  return CATEGORY_TREE.categories.find((c) => c.name === category)?.subcategories ?? [];
}

export function isValidCategory(category: string): boolean {
  return CATEGORY_TREE.categories.some((c) => c.name === category);
}

export function isValidSubcategory(category: string, subcategory: string): boolean {
  return subcategoriesOf(category).includes(subcategory);
}

export function normalizeCategory(
  category: string | null | undefined,
  subcategory: string | null | undefined,
): { category: string; subcategory: string } {
  const cat = category && isValidCategory(category) ? category : CATEGORY_TREE.fallback.category;
  const subs = subcategoriesOf(cat);
  const sub =
    subcategory && subs.includes(subcategory)
      ? subcategory
      : subs.includes(CATEGORY_TREE.fallback.subcategory)
        ? CATEGORY_TREE.fallback.subcategory
        : (subs[0] ?? CATEGORY_TREE.fallback.subcategory);
  return { category: cat, subcategory: sub };
}

/** Maps a validated category/subcategory to an application-owned folder. */
export function suggestedFolder(category: string, subcategory: string | null): string {
  const { category: cat, subcategory: sub } = normalizeCategory(category, subcategory);
  return `${cat}/${sub}`;
}

export const ALL_CATEGORIES: Category[] = CATEGORY_TREE.categories;
