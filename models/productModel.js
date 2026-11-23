import { pool } from "../config/db.js";

export async function getAllProducts({
  search = "",
  category = "",
  sort = "newest",
  minPrice = null,
  maxPrice = null,
  page = 1,
  limit = 12,
  includeInactive = false
} = {}) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (!includeInactive) {
    conditions.push("is_active = TRUE");
  }

  if (category && category !== "all") {
    conditions.push(`category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (search && search.trim() !== "") {
    conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
    params.push(`%${search.trim()}%`);
    paramIndex++;
  }

  if (minPrice !== null && !isNaN(Number(minPrice)) && Number(minPrice) > 0) {
    conditions.push(`price >= $${paramIndex}`);
    params.push(Number(minPrice));
    paramIndex++;
  }

  if (maxPrice !== null && !isNaN(Number(maxPrice)) && Number(maxPrice) > 0) {
    conditions.push(`price <= $${paramIndex}`);
    params.push(Number(maxPrice));
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  // Sorting
  let orderBy = "created_at DESC";
  if (sort === "price-asc") {
    orderBy = "price ASC";
  } else if (sort === "price-desc") {
    orderBy = "price DESC";
  } else if (sort === "name-asc") {
    orderBy = "name ASC";
  } else if (sort === "popularity") {
    orderBy = `(SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_items.product_id = products.id) DESC`;
  }

  // Count total for pagination
  const countQuery = `SELECT COUNT(*) FROM products ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const totalItems = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const offset = (currentPage - 1) * limit;

  // Data query
  const dataParams = [...params, limit, offset];
  const dataQuery = `
    SELECT products.*,
      (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE reviews.product_id = products.id) as avg_rating,
      (SELECT COUNT(*) FROM reviews WHERE reviews.product_id = products.id) as review_count
    FROM products
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const result = await pool.query(dataQuery, dataParams);

  return {
    products: result.rows,
    totalItems,
    totalPages,
    currentPage,
    limit
  };
}

export async function getProductById(id) {
  const result = await pool.query(
    `SELECT products.*,
       (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE reviews.product_id = products.id) as avg_rating,
       (SELECT COUNT(*) FROM reviews WHERE reviews.product_id = products.id) as review_count
     FROM products 
     WHERE id = $1`,
    [id]
  );

  return result.rows[0];
}

export async function getRelatedProducts(category, excludeId, limit = 4) {
  const result = await pool.query(
    `SELECT products.*,
       (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE reviews.product_id = products.id) as avg_rating,
       (SELECT COUNT(*) FROM reviews WHERE reviews.product_id = products.id) as review_count
     FROM products 
     WHERE category = $1 AND id != $2 AND is_active = TRUE
     ORDER BY RANDOM()
     LIMIT $3`,
    [category, excludeId, limit]
  );
  return result.rows;
}

export async function getDistinctCategories() {
  const result = await pool.query(
    "SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category ASC"
  );
  return result.rows.map(r => r.category);
}

export async function createProduct({ name, description, price, stock, category, image_url, is_active = true }) {
  const result = await pool.query(
    `INSERT INTO products (name, description, price, stock, category, image_url, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, description, price, stock, category || "Accessories", image_url || null, Boolean(is_active)]
  );
  return result.rows[0];
}

export async function updateProduct(id, { name, description, price, stock, category, image_url, is_active }) {
  const result = await pool.query(
    `UPDATE products
     SET name = $1, description = $2, price = $3, stock = $4, category = $5, image_url = $6, is_active = $7
     WHERE id = $8
     RETURNING *`,
    [name, description, price, stock, category, image_url, Boolean(is_active), id]
  );
  return result.rows[0];
}

export async function deleteProduct(id) {
  const result = await pool.query(
    "DELETE FROM products WHERE id = $1 RETURNING *",
    [id]
  );
  return result.rowCount > 0;
}

export async function toggleProductActive(id) {
  const result = await pool.query(
    "UPDATE products SET is_active = NOT is_active WHERE id = $1 RETURNING *",
    [id]
  );
  return result.rows[0];
}

export async function getLowStockProducts(threshold = 10) {
  const result = await pool.query(
    "SELECT * FROM products WHERE stock <= $1 AND is_active = TRUE ORDER BY stock ASC",
    [threshold]
  );
  return result.rows;
}

export async function getBestSellingProducts(limit = 5) {
  const result = await pool.query(
    `SELECT products.*, 
       COALESCE(SUM(order_items.quantity), 0) as total_sold
     FROM products
     JOIN order_items ON order_items.product_id = products.id
     GROUP BY products.id
     ORDER BY total_sold DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// INTENTIONAL LAB VULNERABILITY (SQL Injection):
// Deliberate unsafe search query that concatenates raw user query into SQL string
export async function searchProductsUnsafe(rawQuery) {
  const sql = `SELECT * FROM products WHERE is_active = TRUE AND (name ILIKE '%${rawQuery}%' OR description ILIKE '%${rawQuery}%')`;
  const result = await pool.query(sql);
  return result.rows;
}
