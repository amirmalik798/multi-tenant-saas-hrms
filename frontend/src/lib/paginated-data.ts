export interface PaginatedPage<T> {
  items: T[];
  totalPages?: number | null;
}

/**
 * Loads every page of a backend collection without silently truncating
 * employee/department selectors at the first 100 results.
 */
export async function loadAllPages<T>(
  fetchPage: (page: number) => Promise<PaginatedPage<T>>,
  maxPages = 10000,
): Promise<T[]> {
  const first = await fetchPage(1);
  if (!Array.isArray(first.items)) {
    throw new Error("The list response was incomplete. Refresh and try again.");
  }

  const reportedPages = Number(first.totalPages);
  const totalPages = Number.isSafeInteger(reportedPages) && reportedPages > 0
    ? reportedPages
    : 1;
  if (totalPages > maxPages) {
    throw new Error("This list contains too many pages to load safely. Refine the list and try again.");
  }

  const items = [...first.items];
  for (let page = 2; page <= totalPages; page += 1) {
    const result = await fetchPage(page);
    if (!Array.isArray(result.items)) {
      throw new Error("The list response was incomplete. Refresh and try again.");
    }
    items.push(...result.items);
  }
  return items;
}
