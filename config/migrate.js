import { pool } from "./db.js";
import bcrypt from "bcrypt";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log("Starting safe database migrations...");
    await client.query("BEGIN");

    // 1. Update users table
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'customer',
      ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
    `);

    // 2. Update products table
    await client.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Accessories';
    `);

    // Set categories for existing products if currently null or default
    await client.query(`
      UPDATE products SET category = 'Audio' WHERE name ILIKE '%Headphones%' AND (category IS NULL OR category = 'Accessories');
      UPDATE products SET category = 'Gaming' WHERE name ILIKE '%Gaming%' AND (category IS NULL OR category = 'Accessories');
      UPDATE products SET category = 'Connectivity' WHERE name ILIKE '%Hub%' AND (category IS NULL OR category = 'Accessories');
    `);

    // 3. Addresses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        street_address TEXT NOT NULL,
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20),
        country VARCHAR(100) DEFAULT 'Nigeria',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 4. Wishlist items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, product_id)
      );
    `);

    // 5. Coupons table
    await client.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
        discount_value NUMERIC(10, 2) NOT NULL,
        min_order_amount NUMERIC(10, 2) DEFAULT 0,
        max_uses INTEGER DEFAULT 100,
        used_count INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 6. Coupon usages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS coupon_usages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id UUID,
        used_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 7. Reviews table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(255),
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 8. Update orders table
    await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS shipping_address_text TEXT,
      ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50),
      ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(10, 2) DEFAULT 0;
    `);

    // Ensure orders table uses auto-incrementing integer ID
    const orderIdCol = await client.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'orders' AND column_name = 'id'
    `);

    if (orderIdCol.rows.length > 0 && orderIdCol.rows[0].data_type === 'uuid') {
      await client.query(`
        ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
        CREATE SEQUENCE IF NOT EXISTS orders_id_seq;
        ALTER TABLE orders ADD COLUMN new_id INTEGER;
        
        WITH numbered_orders AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as seq_num
          FROM orders
        )
        UPDATE orders
        SET new_id = numbered_orders.seq_num
        FROM numbered_orders
        WHERE orders.id = numbered_orders.id;

        ALTER TABLE orders ALTER COLUMN new_id SET DEFAULT nextval('orders_id_seq');
        SELECT setval('orders_id_seq', COALESCE((SELECT MAX(new_id) FROM orders), 0));

        ALTER TABLE order_items ADD COLUMN new_order_id INTEGER;
        UPDATE order_items SET new_order_id = orders.new_id FROM orders WHERE order_items.order_id = orders.id;

        ALTER TABLE coupon_usages ADD COLUMN IF NOT EXISTS new_order_id INTEGER;
        UPDATE coupon_usages SET new_order_id = orders.new_id FROM orders WHERE coupon_usages.order_id = orders.id;

        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pkey;
        ALTER TABLE orders DROP COLUMN id;
        ALTER TABLE orders RENAME COLUMN new_id TO id;
        ALTER TABLE orders ALTER COLUMN id SET NOT NULL;
        ALTER TABLE orders ADD PRIMARY KEY (id);

        ALTER TABLE order_items DROP COLUMN order_id;
        ALTER TABLE order_items RENAME COLUMN new_order_id TO order_id;
        ALTER TABLE order_items ALTER COLUMN order_id SET NOT NULL;
        ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

        ALTER TABLE coupon_usages DROP COLUMN IF EXISTS order_id;
        ALTER TABLE coupon_usages RENAME COLUMN new_order_id TO order_id;
        ALTER TABLE coupon_usages ADD CONSTRAINT coupon_usages_order_id_fkey 
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
      `);
    } else {
      await client.query(`
        CREATE SEQUENCE IF NOT EXISTS orders_id_seq;
        ALTER TABLE orders ALTER COLUMN id SET DEFAULT nextval('orders_id_seq');
        SELECT setval('orders_id_seq', COALESCE((SELECT MAX(id) FROM orders), 0));
      `);
    }

    // Ensure status default is 'Pending'
    await client.query(`
      ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'Pending';
    `);

    // 9. Seed Default Users if none exist
    const adminCheck = await client.query("SELECT id FROM users WHERE email = 'admin@priceforge.local'");
    if (adminCheck.rowCount === 0) {
      const adminPass = await bcrypt.hash("Admin123!", 12);
      await client.query(`
        INSERT INTO users (name, email, password, role)
        VALUES ('PriceForge Admin', 'admin@priceforge.local', $1, 'admin')
      `, [adminPass]);
      console.log("Seeded admin account: admin@priceforge.local / Admin123!");
    }

    const customerCheck = await client.query("SELECT id FROM users WHERE email = 'alex@priceforge.local'");
    if (customerCheck.rowCount === 0) {
      const custPass = await bcrypt.hash("Customer123!", 12);
      await client.query(`
        INSERT INTO users (name, email, password, role)
        VALUES ('Alex Johnson', 'alex@priceforge.local', $1, 'customer')
      `, [custPass]);
      console.log("Seeded customer account: alex@priceforge.local / Customer123!");
    }

    const customer2Check = await client.query("SELECT id FROM users WHERE email = 'sam@priceforge.local'");
    if (customer2Check.rowCount === 0) {
      const custPass = await bcrypt.hash("Customer123!", 12);
      await client.query(`
        INSERT INTO users (name, email, password, role)
        VALUES ('Sam Rivera', 'sam@priceforge.local', $1, 'customer')
      `, [custPass]);
      console.log("Seeded second customer account: sam@priceforge.local / Customer123!");
    }

    // 10. Seed additional products across Audio, Accessories, Gaming, Connectivity if catalog < 10
    const prodCountRes = await client.query("SELECT COUNT(*) FROM products");
    if (Number(prodCountRes.rows[0].count) <= 4) {
      const sampleProducts = [
        {
          name: "Noise-Cancelling Studio Pro",
          description: "Active noise cancelling with 40-hour battery life and spatial audio driver.",
          price: 85000.00,
          stock: 18,
          category: "Audio",
          image_url: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Acoustic Earbuds Ultra",
          description: "True wireless earbuds with transparency mode and water resistance.",
          price: 32000.00,
          stock: 25,
          category: "Audio",
          image_url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Pro Gaming Mechanical Keyboard",
          description: "Hot-swappable switches, per-key RGB backlighting and aircraft-grade aluminum frame.",
          price: 72000.00,
          stock: 12,
          category: "Gaming",
          image_url: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Wireless Esports Gaming Mouse",
          description: "Ultralight 58g chassis, 26,000 DPI optical sensor and zero-lag 2.4GHz connection.",
          price: 42000.00,
          stock: 35,
          category: "Gaming",
          image_url: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Thunderbolt 4 Docking Station",
          description: "Dual 4K display output, 100W PD pass-through charging and 10Gbps transfer speeds.",
          price: 95000.00,
          stock: 10,
          category: "Connectivity",
          image_url: "https://images.unsplash.com/photo-1544652478-6653e09f18a2?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Braided 100W USB-C Cable Pack",
          description: "Set of 3 Kevlar-reinforced 2-meter fast charging and 480Mbps data transfer cables.",
          price: 12000.00,
          stock: 50,
          category: "Connectivity",
          image_url: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Anodized Aluminum Laptop Stand",
          description: "Ergonomic foldable desktop riser for better posture and enhanced airflow cooling.",
          price: 22000.00,
          stock: 28,
          category: "Accessories",
          image_url: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=900&q=85"
        },
        {
          name: "Desk Mat Extended Leatherette",
          description: "Water-resistant smooth micro-weave surface with non-slip natural rubber base.",
          price: 15000.00,
          stock: 40,
          category: "Accessories",
          image_url: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=900&q=85"
        }
      ];

      for (const p of sampleProducts) {
        await client.query(`
          INSERT INTO products (name, description, price, stock, category, image_url, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        `, [p.name, p.description, p.price, p.stock, p.category, p.image_url]);
      }
      console.log("Seeded additional products across Audio, Accessories, Gaming, Connectivity.");
    }

    // 11. Seed sample coupons
    const couponCodes = [
      { code: "FORGE10", type: "percentage", val: 10, min: 20000, maxUses: 50, exp: "2027-12-31" },
      { code: "FORGE20", type: "percentage", val: 20, min: 50000, maxUses: 20, exp: "2027-12-31" },
      { code: "FLAT5000", type: "fixed", val: 5000, min: 30000, maxUses: 100, exp: "2027-12-31" },
      { code: "EXPIRED50", type: "percentage", val: 50, min: 10000, maxUses: 10, exp: "2020-01-01" },
      { code: "MAXEDOUT", type: "fixed", val: 10000, min: 20000, maxUses: 5, used: 5, exp: "2027-12-31" }
    ];

    for (const c of couponCodes) {
      await client.query(`
        INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_uses, used_count, expires_at, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
        ON CONFLICT (code) DO NOTHING
      `, [c.code, c.type, c.val, c.min, c.maxUses, c.used || 0, c.exp]);
    }
    console.log("Seeded coupons.");

    await client.query("COMMIT");
    console.log("Migrations and seeding completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration error:", err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith("migrate.js")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
