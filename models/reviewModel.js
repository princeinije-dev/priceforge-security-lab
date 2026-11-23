import { pool } from "../config/db.js";

export async function getProductReviews(productId) {
  const result = await pool.query(
    `SELECT 
       reviews.*,
       users.name as reviewer_name
     FROM reviews
     JOIN users ON users.id = reviews.user_id
     WHERE reviews.product_id = $1
     ORDER BY reviews.created_at DESC`,
    [productId]
  );
  return result.rows;
}

export async function getProductRatingStats(productId) {
  const result = await pool.query(
    `SELECT 
       COUNT(*) as review_count,
       COALESCE(AVG(rating), 0) as average_rating
     FROM reviews
     WHERE product_id = $1`,
    [productId]
  );
  const row = result.rows[0];
  return {
    count: Number(row.review_count),
    average: Math.round(Number(row.average_rating) * 10) / 10
  };
}

export async function createReview(userId, productId, rating, title, comment) {
  const result = await pool.query(
    `INSERT INTO reviews (user_id, product_id, rating, title, comment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, productId, Math.max(1, Math.min(5, Number(rating))), title, comment]
  );
  return result.rows[0];
}

export async function updateReview(reviewId, userId, rating, title, comment) {
  const result = await pool.query(
    `UPDATE reviews
     SET rating = $1, title = $2, comment = $3, updated_at = NOW()
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [Math.max(1, Math.min(5, Number(rating))), title, comment, reviewId, userId]
  );
  return result.rows[0];
}

export async function deleteReview(reviewId, userId) {
  const result = await pool.query(
    "DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING *",
    [reviewId, userId]
  );
  return result.rowCount > 0;
}

export async function deleteReviewAdmin(reviewId) {
  const result = await pool.query(
    "DELETE FROM reviews WHERE id = $1 RETURNING *",
    [reviewId]
  );
  return result.rowCount > 0;
}

export async function getAllReviewsAdmin() {
  const result = await pool.query(
    `SELECT 
       reviews.*,
       users.name as reviewer_name,
       users.email as reviewer_email,
       products.name as product_name
     FROM reviews
     JOIN users ON users.id = reviews.user_id
     JOIN products ON products.id = reviews.product_id
     ORDER BY reviews.created_at DESC`
  );
  return result.rows;
}
