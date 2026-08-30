import { z } from "zod";

export const QuerySchema = z.object({
  searchTerm: z.string().optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  sortBy: z.string().optional,
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
