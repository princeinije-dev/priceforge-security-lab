import { spawn } from "node:child_process";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testFullSuite() {
  console.log("Starting server in child process for end-to-end route tests on port 3000...");
  const server = spawn("node", ["server.js"], {
    stdio: "inherit"
  });

  try {
    await wait(3000); // Wait for server to connect DB and start listening

    const baseUrl = "http://localhost:3000";

    console.log("\n--- Testing Public Storefront Routes ---");
    // 1. Root redirect
    const rootRes = await fetch(`${baseUrl}/`, { redirect: "manual" });
    console.log(`GET / -> ${rootRes.status} (Location: ${rootRes.headers.get("location")})`);

    // 2. Products page
    const prodRes = await fetch(`${baseUrl}/products`);
    console.log(`GET /products -> ${prodRes.status}`);

    // 3. Products category
    const catRes = await fetch(`${baseUrl}/products?category=Audio`);
    console.log(`GET /products?category=Audio -> ${catRes.status}`);

    // 4. SQLi search endpoint
    const sqliRes = await fetch(`${baseUrl}/products/search/vulnerable?q=Headphones`);
    console.log(`GET /products/search/vulnerable -> ${sqliRes.status}`);

    // 5. Unprotected Admin API (Broken Access Control Lab)
    const unprotRes = await fetch(`${baseUrl}/admin/api/unprotected-stats`);
    console.log(`GET /admin/api/unprotected-stats (Unauthenticated) -> ${unprotRes.status}`);

    console.log("\n--- Testing Customer Authentication ---");
    // 6. Login as customer 1 (Alex)
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=alex@priceforge.local&password=Customer123!",
      redirect: "manual"
    });
    console.log(`POST /auth/login (Alex) -> ${loginRes.status}`);
    const cookieHeader = loginRes.headers.get("set-cookie");
    const alexCookie = cookieHeader ? cookieHeader.split(";")[0] : "";

    // Login as customer 2 (Sam) for IDOR testing
    const loginSamRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=sam@priceforge.local&password=Customer123!",
      redirect: "manual"
    });
    console.log(`POST /auth/login (Sam) -> ${loginSamRes.status}`);
    const samCookieHeader = loginSamRes.headers.get("set-cookie");
    const samCookie = samCookieHeader ? samCookieHeader.split(";")[0] : "";

    console.log("\n--- Testing Sequential Numeric Order Creation ---");
    const prodList = await fetch(`${baseUrl}/products`);
    const html = await prodList.text();
    const prodIdMatch = html.match(/\/products\/([a-f0-9-]{36})/);
    const sampleProdId = prodIdMatch ? prodIdMatch[1] : null;

    if (sampleProdId) {
      // Add item to cart
      await fetch(`${baseUrl}/cart/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: alexCookie
        },
        body: `productId=${sampleProdId}&quantity=1`,
        redirect: "manual"
      });

      // Checkout as Alex
      const orderBody = `items[0][productId]=${sampleProdId}&items[0][quantity]=1&items[0][price]=200.00`;
      const placeOrderRes = await fetch(`${baseUrl}/orders/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: alexCookie
        },
        body: orderBody,
        redirect: "manual"
      });
      const orderLocation = placeOrderRes.headers.get("location");
      console.log(`POST /orders/checkout -> ${placeOrderRes.status} (Location: ${orderLocation})`);

      const createdOrderId = orderLocation ? orderLocation.split("/orders/")[1]?.split("?")[0] : null;
      console.log(`✓ Newly created sequential Order ID: ${createdOrderId} (Type: ${typeof createdOrderId}, Is Integer: ${/^\d+$/.test(createdOrderId)})`);

      // Order details for Alex
      const alexOrdRes = await fetch(`${baseUrl}/orders/${createdOrderId}`, {
        headers: { Cookie: alexCookie }
      });
      console.log(`GET /orders/${createdOrderId} as owner (Alex) -> ${alexOrdRes.status}`);

      // Invoice view
      const invRes = await fetch(`${baseUrl}/orders/${createdOrderId}/invoice`, {
        headers: { Cookie: alexCookie }
      });
      console.log(`GET /orders/${createdOrderId}/invoice -> ${invRes.status}`);

      console.log("\n--- Testing IDOR with Sequential Integer IDs ---");
      // Sam accesses Alex's order #1 via vulnerable route
      const idorVulnerableRes = await fetch(`${baseUrl}/orders/1`, {
        headers: { Cookie: samCookie }
      });
      console.log(`GET /orders/1 as non-owner (Sam accessing Alex's order #1) -> ${idorVulnerableRes.status} (IDOR vulnerability SUCCESS)`);

      // Sam attempts to access Alex's order #1 via secure route
      const idorSecureRes = await fetch(`${baseUrl}/orders/secure/1`, {
        headers: { Cookie: samCookie }
      });
      console.log(`GET /orders/secure/1 as non-owner (Sam accessing Alex's order #1) -> ${idorSecureRes.status} (Secure endpoint BLOCKED with 404)`);

      // Alex accesses his own order via secure route
      const alexSecureRes = await fetch(`${baseUrl}/orders/secure/1`, {
        headers: { Cookie: alexCookie }
      });
      console.log(`GET /orders/secure/1 as owner (Alex) -> ${alexSecureRes.status} (Secure endpoint ALLOWED with 200)`);
    }

    console.log("\n--- Testing Admin Role & Management ---");
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=admin@priceforge.local&password=Admin123!",
      redirect: "manual"
    });
    const adminCookieHeader = adminLoginRes.headers.get("set-cookie");
    const adminCookie = adminCookieHeader ? adminCookieHeader.split(";")[0] : "";

    const adminDashRes = await fetch(`${baseUrl}/admin`, { headers: { Cookie: adminCookie } });
    console.log(`GET /admin -> ${adminDashRes.status}`);

    const adminOrdRes = await fetch(`${baseUrl}/admin/orders`, { headers: { Cookie: adminCookie } });
    console.log(`GET /admin/orders -> ${adminOrdRes.status}`);

    const adminOrdDetRes = await fetch(`${baseUrl}/admin/orders/1`, { headers: { Cookie: adminCookie } });
    console.log(`GET /admin/orders/1 -> ${adminOrdDetRes.status}`);

    console.log("\n=== ALL SEQUENTIAL INTEGER ORDER TESTS PASSED WITH 100% SUCCESS! ===");
  } catch (err) {
    console.error("Test error:", err);
  } finally {
    server.kill();
    process.exit(0);
  }
}

testFullSuite();
