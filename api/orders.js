// Vercel serverless API: persist CMADD2 orders in Supabase.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("CMADD2 order API is missing Supabase environment variables");
    return res.status(503).json({
      success: false,
      message: "Order saving is temporarily unavailable. Please share your order on WhatsApp."
    });
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    body = body || {};

    const medicalName = String(body.medical_name || body.customer_name || "").trim().slice(0, 160);
    const customerName = String(body.customer_name || medicalName).trim().slice(0, 160);
    const mobile = String(body.mobile || "").trim().slice(0, 24);
    const orderDetails = String(body.order_details || "").trim().slice(0, 12000);
    const notes = String(body.notes || "").trim().slice(0, 2000);

    if (!medicalName || !mobile || !orderDetails) {
      return res.status(400).json({
        success: false,
        message: "Medical/shop name, mobile number and products with quantity are required."
      });
    }
    if (!/^[0-9+() -]{10,24}$/.test(mobile)) {
      return res.status(400).json({ success: false, message: "Please enter a valid mobile number." });
    }

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    const trackingId = "CMD-" + datePart + "-" + randomPart;

    const response = await fetch(
      supabaseUrl.replace(/\/$/, "") + "/rest/v1/orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": "Bearer " + serviceKey,
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          tracking_id: trackingId,
          customer_name: customerName,
          medical_name: medicalName,
          mobile,
          order_details: orderDetails + (notes ? "\n\nNote: " + notes : ""),
          order_items: [],
          status: "Order Received"
        })
      }
    );

    const resultText = await response.text();
    if (!response.ok) {
      console.error("Supabase order insert failed:", response.status, resultText.slice(0, 1000));
      return res.status(502).json({
        success: false,
        message: "The order could not be saved right now. Please retry or share it on WhatsApp."
      });
    }

    return res.status(201).json({ success: true, tracking_id: trackingId });
  } catch (error) {
    console.error("CMADD2 order API error:", error);
    return res.status(500).json({
      success: false,
      message: "Unexpected error while saving the order. Please retry or share it on WhatsApp."
    });
  }
};
