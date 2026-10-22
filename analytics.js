function registerAnalyticsRoutes(app, db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL CHECK(event_type IN ('page_view','whatsapp_click')),
      page_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_site_analytics_created ON site_analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_site_analytics_page ON site_analytics_events(page_path);
  `);

  app.post("/api/analytics/event", (req, res) => {
    const eventType = String(req.body?.eventType || "");
    const rawPage = String(req.body?.pagePath || "/").slice(0, 180);
    const pagePath = rawPage.startsWith("/") && !rawPage.startsWith("//") && !rawPage.includes("..")
      ? rawPage.split("?")[0].split("#")[0]
      : "/";
    if (!["page_view", "whatsapp_click"].includes(eventType)) {
      return res.status(400).json({ success: false, message: "Unsupported analytics event." });
    }
    try {
      db.prepare("INSERT INTO site_analytics_events (event_type, page_path) VALUES (?, ?)").run(eventType, pagePath || "/");
      return res.status(204).end();
    } catch (error) {
      console.error("Analytics event save failed:", error);
      return res.status(500).json({ success: false });
    }
  });

  app.get("/api/admin/analytics/summary", (req, res) => {
    if (!req.session || !req.session.isAdmin) {
      return res.status(401).json({ success: false, message: "Admin login required." });
    }
    try {
      const today = db.prepare("SELECT COUNT(*) AS total FROM site_analytics_events WHERE event_type='page_view' AND date(created_at)=date('now')").get().total;
      const last7 = db.prepare("SELECT COUNT(*) AS total FROM site_analytics_events WHERE event_type='page_view' AND created_at >= datetime('now','-7 days')").get().total;
      const last30 = db.prepare("SELECT COUNT(*) AS total FROM site_analytics_events WHERE event_type='page_view' AND created_at >= datetime('now','-30 days')").get().total;
      const whatsapp = db.prepare("SELECT COUNT(*) AS total FROM site_analytics_events WHERE event_type='whatsapp_click' AND created_at >= datetime('now','-30 days')").get().total;
      const pages = db.prepare("SELECT page_path AS pagePath, COUNT(*) AS views FROM site_analytics_events WHERE event_type='page_view' AND created_at >= datetime('now','-30 days') GROUP BY page_path ORDER BY views DESC LIMIT 12").all();
      const daily = db.prepare("SELECT date(created_at) AS day, SUM(CASE WHEN event_type='page_view' THEN 1 ELSE 0 END) AS pageViews, SUM(CASE WHEN event_type='whatsapp_click' THEN 1 ELSE 0 END) AS whatsappClicks FROM site_analytics_events WHERE created_at >= datetime('now','-7 days') GROUP BY date(created_at) ORDER BY day").all();
      return res.json({ success: true, metrics: { todayPageViews: today, sevenDayPageViews: last7, thirtyDayPageViews: last30, thirtyDayWhatsAppClicks: whatsapp }, pages, daily, note: "Counts are recorded page views and WhatsApp link clicks, not unique people or confirmed messages sent." });
    } catch (error) {
      console.error("Analytics summary failed:", error);
      return res.status(500).json({ success: false, message: "Unable to load analytics." });
    }
  });
}
module.exports = { registerAnalyticsRoutes };
