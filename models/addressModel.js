import { pool } from "../config/db.js";

export async function getUserAddresses(userId) {
  const result = await pool.query(
    `SELECT * FROM addresses 
     WHERE user_id = $1 
     ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getAddressById(addressId) {
  // Vulnerable to IDOR when called without userId verification
  const result = await pool.query(
    "SELECT * FROM addresses WHERE id = $1",
    [addressId]
  );
  return result.rows[0];
}

export async function getAddressByIdAndUser(addressId, userId) {
  // Secure reference check
  const result = await pool.query(
    "SELECT * FROM addresses WHERE id = $1 AND user_id = $2",
    [addressId, userId]
  );
  return result.rows[0];
}

export async function createAddress(userId, { full_name, phone, street_address, city, state, postal_code, country, is_default }) {
  if (is_default) {
    await pool.query("UPDATE addresses SET is_default = FALSE WHERE user_id = $1", [userId]);
  }

  const result = await pool.query(
    `INSERT INTO addresses (user_id, full_name, phone, street_address, city, state, postal_code, country, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [userId, full_name, phone, street_address, city, state, postal_code, country || "Nigeria", Boolean(is_default)]
  );
  return result.rows[0];
}

export async function updateAddress(addressId, { full_name, phone, street_address, city, state, postal_code, country, is_default }) {
  const result = await pool.query(
    `UPDATE addresses
     SET full_name = $1, phone = $2, street_address = $3, city = $4, state = $5, postal_code = $6, country = $7, is_default = $8
     WHERE id = $9
     RETURNING *`,
    [full_name, phone, street_address, city, state, postal_code, country || "Nigeria", Boolean(is_default), addressId]
  );
  return result.rows[0];
}

export async function deleteAddressInsecure(addressId) {
  // INTENTIONAL LAB VULNERABILITY (IDOR):
  // Deletes address solely by ID without checking whether the requesting user owns it!
  const result = await pool.query(
    "DELETE FROM addresses WHERE id = $1 RETURNING *",
    [addressId]
  );
  return result.rowCount > 0;
}

export async function deleteAddressSecure(addressId, userId) {
  const result = await pool.query(
    "DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING *",
    [addressId, userId]
  );
  return result.rowCount > 0;
}

export async function setDefaultAddress(addressId, userId) {
  await pool.query("UPDATE addresses SET is_default = FALSE WHERE user_id = $1", [userId]);
  const result = await pool.query(
    "UPDATE addresses SET is_default = TRUE WHERE id = $1 AND user_id = $2 RETURNING *",
    [addressId, userId]
  );
  return result.rows[0];
}
