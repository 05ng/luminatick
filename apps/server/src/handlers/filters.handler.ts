import { Hono } from "hono";
import { Env } from "../bindings";
import { roleGuard } from "../middleware/role.guard";
import { permissionGuard } from "../middleware/permission.guard";
import { AppVariables } from "../types";
import { z } from "zod";

const filters = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Zod schema for filter validation
const filterConditionSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.any()
});

const filterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  conditions: z.array(filterConditionSchema),
});

/**
 * GET /api/settings/filters
 * List all filters (Agents and Admins)
 */
filters.get("/", roleGuard(["agent", "admin"]), async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM ticket_filters ORDER BY is_system DESC, created_at ASC"
  ).all();

  const parsedResults = results.map(filter => ({
    ...filter,
    conditions: typeof filter.conditions === 'string' ? JSON.parse(filter.conditions) : filter.conditions
  }));

  return c.json(parsedResults);
});

/**
 * POST /api/settings/filters
 * Create a new filter (Admins only)
 */
filters.post("/", roleGuard(["admin"]), async (c) => {
  const body = await c.req.json();
  const result = filterSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const id = `filter_${crypto.randomUUID()}`;
  const { name, conditions } = result.data;

  await c.env.DB.prepare(
    "INSERT INTO ticket_filters (id, name, conditions) VALUES (?, ?, ?)"
  )
    .bind(id, name, JSON.stringify(conditions))
    .run();

  const filter = await c.env.DB.prepare("SELECT * FROM ticket_filters WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; conditions: string; is_system: boolean; created_at: string; updated_at: string }>();

  return c.json({
    ...filter,
    conditions: filter && typeof filter.conditions === 'string' ? JSON.parse(filter.conditions) : (filter?.conditions || [])
  }, 201);
});

/**
 * GET /api/settings/filters/:id
 * Get a specific filter
 */
filters.get("/:id", roleGuard(["agent", "admin"]), async (c) => {
  const { id } = c.req.param();
  const filter = await c.env.DB.prepare("SELECT * FROM ticket_filters WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; conditions: string; is_system: boolean; created_at: string; updated_at: string }>();

  if (!filter) {
    return c.json({ error: "Filter not found" }, 404);
  }

  return c.json({
    ...filter,
    conditions: typeof filter.conditions === 'string' ? JSON.parse(filter.conditions) : filter.conditions
  });
});

/**
 * PUT /api/settings/filters/:id
 * Update a filter (Admins only)
 */
filters.put("/:id", roleGuard(["admin", "agent"]), permissionGuard("filters"), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const result = filterSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: result.error.errors[0].message }, 400);
  }

  const { name, conditions } = result.data;

  const existing = await c.env.DB.prepare("SELECT is_system FROM ticket_filters WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "Filter not found" }, 404);
  }

  if (existing.is_system) {
    return c.json({ error: "Cannot modify system filters" }, 403);
  }

  await c.env.DB.prepare(
    "UPDATE ticket_filters SET name = ?, conditions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(name, JSON.stringify(conditions), id)
    .run();

  const filter = await c.env.DB.prepare("SELECT * FROM ticket_filters WHERE id = ?")
    .bind(id)
    .first<{ id: string; name: string; conditions: string; is_system: boolean; created_at: string; updated_at: string }>();

  return c.json({
    ...filter,
    conditions: filter && typeof filter.conditions === 'string' ? JSON.parse(filter.conditions) : (filter?.conditions || [])
  });
});

/**
 * DELETE /api/settings/filters/:id
 * Delete a filter (Admins only)
 */
filters.delete("/:id", roleGuard(["admin"]), async (c) => {
  const { id } = c.req.param();

  const existing = await c.env.DB.prepare("SELECT is_system FROM ticket_filters WHERE id = ?")
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: "Filter not found" }, 404);
  }

  if (existing.is_system) {
    return c.json({ error: "Cannot delete system filters" }, 403);
  }

  await c.env.DB.prepare("DELETE FROM ticket_filters WHERE id = ?")
    .bind(id)
    .run();

  return c.json({ success: true });
});

export default filters;
