# PriceForge Security Remediation Guide

This guide explains how each vulnerability documented in `SECURITY-LAB.md` can be resolved using industry-standard defensive patterns for Express.js and PostgreSQL.

---

## 1. Remediation: Price Manipulation

### Root Cause
The server trusted client-supplied prices submitted in HTTP POST bodies (`items[i].price`) instead of treating the database as the single source of truth.

### Secure Fix
Never accept or trust product prices from the client. Look up prices directly from the `products` table inside a database transaction with a row lock (`FOR UPDATE`):

```javascript
// SECURE IMPLEMENTATION (models/orderModel.js)
for (const item of items) {
  const productRes = await client.query(
    "SELECT id, name, price, stock FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE",
    [item.productId]
  );
  if (productRes.rowCount === 0) throw new Error("Product unavailable");
  
  const product = productRes.rows[0];
  const unitPrice = Number(product.price); // Server authoritative price
  const lineSubtotal = unitPrice * item.quantity;
  totalAmount += lineSubtotal;
}
```

PriceForge includes this remediation at `POST /orders/checkout-secure`.

---

## 2. Remediation: IDOR on Orders

### Root Cause
Database queries fetched order details using only the predictable sequential integer order ID (e.g. 1, 2, 3...) without verifying that the authenticated customer is the owner of the record. Because numeric order IDs are sequential and predictable, an attacker can iterate through IDs to enumerate and inspect all orders across the system.

### Secure Fix
Include the authenticated user ID (`req.user.id`) in the `WHERE` clause:

```javascript
// SECURE IMPLEMENTATION (models/orderModel.js)
export async function getOrderDetails(userId, orderId) {
  const result = await pool.query(
    "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
    [orderId, userId]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0];
}
```

PriceForge provides this secure check at `GET /orders/secure/:id`.

---

## 3. Remediation: IDOR on Addresses

### Root Cause
The address deletion endpoint accepted an address ID without verifying user ownership.

### Secure Fix
Always validate user ownership before performing state modifications:

```javascript
// SECURE IMPLEMENTATION (models/addressModel.js)
export async function deleteAddressSecure(addressId, userId) {
  const result = await pool.query(
    "DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id",
    [addressId, userId]
  );
  return result.rowCount > 0;
}
```

PriceForge provides this secure check at `POST /account/addresses/:id/delete`.

---

## 4. Remediation: IDOR on Wishlists

### Root Cause
The controller removed items using only the record ID without verifying ownership.

### Secure Fix
Enforce that the deletion query matches both `user_id` and `product_id`:

```javascript
// SECURE IMPLEMENTATION (models/wishlistModel.js)
export async function removeFromWishlist(userId, productId) {
  const result = await pool.query(
    "DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2 RETURNING id",
    [userId, productId]
  );
  return result.rowCount > 0;
}
```

---

## 5. Remediation: Broken Access Control

### Root Cause
Administrative routes and metrics APIs were defined before the `requireAdmin` authorization middleware.

### Secure Fix
Mount strict authorization middleware before all administrative routes, ensuring both authentication and role verification:

```javascript
// SECURE IMPLEMENTATION (middleware/authMiddleware.js)
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.redirect("/auth/login");
  }
  if (req.user.role !== "admin") {
    return res.status(403).render("errors/403");
  }
  next();
}

// In routes/adminRoutes.js:
router.use(requireAdmin); // Protects all subsequent routes
```

---

## 6. Remediation: SQL Injection

### Root Cause
The vulnerable search endpoint used string interpolation (`ILIKE '%${rawQuery}%'`) to construct SQL statements.

### Secure Fix
Use parameterized queries with the `pg` driver:

```javascript
// SECURE IMPLEMENTATION (models/productModel.js)
export async function searchProductsSafe(query) {
  const sql = `
    SELECT * FROM products 
    WHERE is_active = TRUE 
      AND (name ILIKE $1 OR description ILIKE $1)
  `;
  const result = await pool.query(sql, [`%${query.trim()}%`]);
  return result.rows;
}
```

---

## 7. Remediation: Stored XSS

### Root Cause
User-generated reviews were rendered using unescaped EJS syntax (`<%- rev.comment %>`).

### Secure Fix
Use escaped output tags (`<%= rev.comment %>`) which automatically entity-encodes `<`, `>`, `&`, `"`, and `'`:

```html
<!-- SECURE FIX in views/shop/product-details.ejs -->
<div class="review-body-text">
  <%= rev.comment %>
</div>
```

If rich text is required, sanitize user content on the server using an established library like `DOMPurify` (with `jsdom`) or `sanitize-html`.

---

## 8. Remediation: Reflected XSS

### Root Cause
Search terms in the catalog results were output using unescaped EJS tags (`<%- searchQuery %>`).

### Secure Fix
Always escape search query parameters before rendering in HTML:

```html
<!-- SECURE FIX in views/shop/products.ejs -->
<h2>Results for “<%= searchQuery %>”</h2>
```

---

## 9. Remediation: CSRF

### Root Cause
State-changing POST requests relied solely on ambient cookie authentication without anti-forgery tokens.

### Secure Fix
Implement SameSite cookie attributes and use anti-CSRF tokens:

1. Configure cookies with `SameSite: "lax"` or `"strict"`:
   ```javascript
   res.cookie("token", token, {
     httpOnly: true,
     sameSite: "lax",
     secure: process.env.NODE_ENV === "production"
   });
   ```
2. Integrate CSRF middleware (e.g. `csrf-csrf` or double-submit cookie patterns) to validate unique per-session tokens in all state-changing forms.

---

## 10. Remediation: Password Reset Token Leakage

### Root Cause
The reset token was generated and output directly in the HTTP response body.

### Secure Fix
1. Generate cryptographically strong random tokens (`crypto.randomBytes(32)`).
2. Store a hash of the token (e.g. SHA-256) in the database rather than the plaintext token.
3. Transmit the reset link exclusively via authenticated email (SMTP) to the verified address on record.
4. Return a generic confirmation message regardless of whether the email exists to prevent user enumeration.

---

## 11. Remediation: Insecure File Upload

### Root Cause
Multer disk storage accepted files without verifying file extensions or MIME signatures, preserving arbitrary uploaded extensions in a public folder.

### Secure Fix
1. Validate MIME types and enforce a strict extension allowlist (e.g., `.jpg`, `.jpeg`, `.png`, `.webp`).
2. Verify the file's magic bytes using a package like `file-type`.
3. Store uploaded assets outside the web root or serve them with strict `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
4. Rename files with randomly generated UUIDs, discarding client-provided filenames.

```javascript
// SECURE MULTER FILTER
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext) && allowed.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only standard image formats (.jpg, .png, .webp) are allowed."));
  }
});
```

---

## 12. Remediation: Business Logic Flaws

### Root Cause
Coupons and discounts were calculated client-side or without re-validating the final order subtotal against coupon rules inside the checkout transaction.

### Secure Fix
Re-evaluate coupon eligibility, minimum order constraints, and user usage counts directly within the database transaction right before committing the order. Clamp discounts so they can never exceed the authoritative subtotal.
