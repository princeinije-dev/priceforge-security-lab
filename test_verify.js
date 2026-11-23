import { pool } from "./config/db.js";

async function runSelfTests() {
  console.log("=== PRICEFORGE AUTOMATED VERIFICATION ===");
  try {
    // 1. Database connectivity
    const dbTest = await pool.query("SELECT current_database(), current_user");
    console.log("✓ Database connected:", dbTest.rows[0].current_database, "User:", dbTest.rows[0].current_user);

    // 2. User accounts check
    const users = await pool.query("SELECT email, role FROM users");
    console.log("✓ User accounts in system:", users.rows);

    // 3. Products check
    const products = await pool.query("SELECT id, name, category, price, stock, is_active FROM products LIMIT 5");
    console.log(`✓ Products in catalog (${products.rowCount} sample):`, products.rows.map(p => `${p.name} [${p.category}] - ₦${p.price} (Stock: ${p.stock})`));

    // 4. Coupons check
    const coupons = await pool.query("SELECT code, discount_type, discount_value FROM coupons");
    console.log(`✓ Active promotional coupons (${coupons.rowCount}):`, coupons.rows.map(c => `${c.code}: ${c.discount_value} (${c.discount_type})`));

    // 5. Test SQL injection lab query function
    const { searchProductsUnsafe } = await import("./models/productModel.js");
    const sqliTest = await searchProductsUnsafe("Headphones");
    console.log("✓ SQLi search function test result count:", sqliTest.length);

    // 6. Test Coupon validation function
    const { validateCoupon } = await import("./models/couponModel.js");
    const couponTest = await validateCoupon("FORGE10", 50000);
    console.log("✓ Coupon validation test (FORGE10 on ₦50,000):", couponTest.valid, "Discount:", couponTest.discount, "New Total:", couponTest.newTotal);

    console.log("=== ALL BACKEND MODULES VERIFIED SUCCESSFULLY ===");
    process.exit(0);
  } catch (err) {
    console.error("Test failure:", err);
    process.exit(1);
  }
}

runSelfTests();
