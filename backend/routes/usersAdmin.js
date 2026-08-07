import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { getPostgresPool } from "../db/postgres.js";

const router = Router();

const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(200)
  .regex(/[a-z]/, "Password requires a lowercase letter")
  .regex(/[A-Z]/, "Password requires an uppercase letter")
  .regex(/[0-9]/, "Password requires a number");

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Username may only use letters, numbers, dots, underscores, and hyphens",
    ),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  role: z.enum(["admin", "user"]),
  temporaryPassword: passwordSchema,
});

const passwordResetSchema = z.object({
  newPassword: passwordSchema,
});

const updateSchema = z
  .object({
    role: z.enum(["admin", "user"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined || value.isActive !== undefined,
    { message: "No user changes supplied" },
  );

const safeUserColumns = `
  id,
  username,
  first_name,
  last_name,
  email,
  role,
  is_active,
  must_change_password,
  created_at
`;

router.get("/", async (_request, response) => {
  const pool = await getPostgresPool();
  const result = await pool.query(
    `SELECT ${safeUserColumns}
     FROM app_users
     ORDER BY username ASC`,
  );

  return response.json({ data: result.rows });
});

router.post("/", async (request, response) => {
  const parsed = createSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      error:
        parsed.error.issues[0]?.message || "Invalid user details",
    });
  }

  const pool = await getPostgresPool();
  const passwordHash = await bcrypt.hash(
    parsed.data.temporaryPassword,
    12,
  );

  try {
    const result = await pool.query(
      `INSERT INTO app_users (
         username,
         first_name,
         last_name,
         email,
         role,
         is_active,
         password_hash,
         must_change_password,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, TRUE, NOW(), NOW())
       RETURNING ${safeUserColumns}`,
      [
        parsed.data.username.toLowerCase(),
        parsed.data.firstName,
        parsed.data.lastName,
        parsed.data.email.toLowerCase(),
        parsed.data.role,
        passwordHash,
      ],
    );

    return response.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return response.status(409).json({
        error: "A user with that username or email already exists",
      });
    }

    throw error;
  }
});

router.patch("/:id", async (request, response) => {
  const userId = String(request.params.id);
  const parsed = updateSchema.safeParse(request.body);

  if (!/^\d+$/.test(userId)) {
    return response.status(400).json({ error: "Invalid user ID" });
  }

  if (!parsed.success) {
    return response.status(400).json({
      error:
        parsed.error.issues[0]?.message || "Invalid user changes",
    });
  }

  if (String(request.user.id) === userId) {
    return response.status(400).json({
      error: "You cannot change your own role or status",
    });
  }

  const pool = await getPostgresPool();
  await pool.query("BEGIN");

  try {
    const updated = await pool.query(
      `UPDATE app_users
       SET role = COALESCE($2, role),
           is_active = COALESCE($3, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${safeUserColumns}`,
      [
        userId,
        parsed.data.role ?? null,
        parsed.data.isActive ?? null,
      ],
    );

    if (updated.rowCount === 0) {
      await pool.query("ROLLBACK");
      return response.status(404).json({ error: "User not found" });
    }

    if (parsed.data.isActive === false) {
      await pool.query(
        "DELETE FROM app_sessions WHERE user_id = $1",
        [userId],
      );
    }

    await pool.query("COMMIT");
    return response.json({ data: updated.rows[0] });
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    throw error;
  }
});

router.post("/:id/password", async (request, response) => {
  const userId = String(request.params.id);
  const parsed = passwordResetSchema.safeParse(request.body);

  if (!/^\d+$/.test(userId)) {
    return response.status(400).json({ error: "Invalid user ID" });
  }

  if (String(request.user.id) === userId) {
    return response.status(400).json({
      error: "Use your profile to change your own password",
    });
  }

  if (!parsed.success) {
    return response.status(400).json({
      error: parsed.error.issues[0]?.message || "Invalid password",
    });
  }

  const pool = await getPostgresPool();
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await pool.query("BEGIN");

  try {
    const updated = await pool.query(
      `UPDATE app_users
       SET password_hash = $2,
           must_change_password = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, username`,
      [userId, passwordHash],
    );

    if (updated.rowCount === 0) {
      await pool.query("ROLLBACK");
      return response.status(404).json({ error: "User not found" });
    }

    await pool.query(
      "DELETE FROM app_sessions WHERE user_id = $1",
      [userId],
    );
    await pool.query("COMMIT");

    return response.json({
      status: "OK",
      message: `Password reset for ${updated.rows[0].username}`,
    });
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    throw error;
  }
});

export default router;
