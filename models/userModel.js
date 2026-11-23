import { pool } from "../config/db.js";

export async function createUser(name, email, password, role = "customer") {
  const result = await pool.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, created_at`,
    [name, email, password, role]
  );

  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  return result.rows[0];
}

export async function findUserById(id) {
  const result = await pool.query(
    "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
    [id]
  );

  return result.rows[0];
}

export async function updateUserProfile(id, name, email) {
  const result = await pool.query(
    `UPDATE users
     SET name = $1, email = $2
     WHERE id = $3
     RETURNING id, name, email, role`,
    [name, email, id]
  );

  return result.rows[0];
}

export async function updateUserPassword(id, hashedPassword) {
  const result = await pool.query(
    "UPDATE users SET password = $1 WHERE id = $2 RETURNING id",
    [hashedPassword, id]
  );

  return result.rowCount > 0;
}

export async function setResetToken(email, token, expires) {
  const result = await pool.query(
    `UPDATE users 
     SET reset_token = $1, reset_token_expires = $2 
     WHERE email = $3 
     RETURNING id, email, reset_token`,
    [token, expires, email]
  );

  return result.rows[0];
}

export async function findUserByResetToken(token) {
  const result = await pool.query(
    `SELECT * FROM users 
     WHERE reset_token = $1 AND reset_token_expires > NOW()`,
    [token]
  );

  return result.rows[0];
}

export async function clearResetToken(id) {
  await pool.query(
    "UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = $1",
    [id]
  );
}

export async function getAllUsers() {
  const result = await pool.query(
    `SELECT id, name, email, role, created_at,
      (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id) as order_count,
      (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE orders.user_id = users.id) as total_spent
     FROM users 
     ORDER BY created_at DESC`
  );

  return result.rows;
}

export async function updateUserRole(id, role) {
  const result = await pool.query(
    "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role",
    [role, id]
  );

  return result.rows[0];
}
