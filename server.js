const express = require("express");
const path = require("path");
const session = require("express-session");
const { registerCustomerAuth } = require("./auth");
const { registerCustomerLedger } = require("./ledger");
const { registerMeetingRoutes } = require("./meetings");
const { registerOfferRoutes } = require("./offers");
const { registerAnalyticsRoutes } = require("./analytics");
const { registerBusinessRoutes } = require("./business");
const Database = require("better-sqlite3");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

// Configure proxy trust before any middleware relies on req.ip or HTTPS detection.
if (isProduction) app.set("trust proxy", 1);
const dataDir = process.env.CMADD2_DATA_DIR
    ? path.resolve(process.env.CMADD2_DATA_DIR)
    : __dirname;

if (isProduction && !process.env.CMADD2_DATA_DIR) {
    throw new Error("Production safety check: set CMADD2_DATA_DIR to the mounted persistent-disk directory before starting.");
}
if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error("Production safety check: SESSION_SECRET must be configured.");
}

// ===============================
// DATABASE
// ===============================

const db = new Database(path.join(dataDir, "complaints.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ===============================
// TABLES
// ===============================

db.prepare(`
    CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        mobile TEXT NOT NULL,
        complaint_type TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        mobile TEXT NOT NULL,
        rating INTEGER NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS enquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enquiry_id TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        mobile TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'New',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_id TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        mobile TEXT NOT NULL,
        order_details TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Order Received',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb", parameterLimit: 100 }));

// Baseline browser security headers. Keep CSP report-only out of this patch to
// avoid unexpectedly breaking the existing inline-script-heavy public pages.
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
});

// Block cross-site browser requests that try to change server state.
// Requests with no Origin (e.g. some command-line clients) are left to route auth.
app.use((req, res, next) => {
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (!unsafe) return next();
    const origin = req.get("origin");
    if (origin) {
        try {
            const parsed = new URL(origin);
            const expectedHost = req.get("host");
            if (parsed.host !== expectedHost || (isProduction && parsed.protocol !== "https:")) {
                return res.status(403).json({ success: false, message: "Cross-site request blocked." });
            }
        } catch {
            return res.status(403).json({ success: false, message: "Invalid request origin." });
        }
    }
    if (req.get("sec-fetch-site") === "cross-site") {
        return res.status(403).json({ success: false, message: "Cross-site request blocked." });
    }
    next();
});

// Lightweight per-process authentication throttle. For multiple instances or
// stronger abuse protection, add edge/WAF rate limits and a shared limiter.
const adminLoginAttempts = new Map();
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 8;
app.use(["/api/admin/login", "/api/auth/login", "/api/auth/register"], (req, res, next) => {
    if (req.method !== "POST") return next();
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let entry = adminLoginAttempts.get(key);
    if (!entry || now - entry.windowStart >= ADMIN_LOGIN_WINDOW_MS) {
        entry = { windowStart: now, count: 0 };
    }
    if (entry.count >= ADMIN_LOGIN_MAX_ATTEMPTS) {
        const retryAfter = Math.max(1, Math.ceil((entry.windowStart + ADMIN_LOGIN_WINDOW_MS - now) / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({ success: false, message: "Too many authentication attempts. Please try again later." });
    }
    entry.count += 1;
    adminLoginAttempts.set(key, entry);
    if (adminLoginAttempts.size > 5000) {
        for (const [ip, item] of adminLoginAttempts) {
            if (now - item.windowStart >= ADMIN_LOGIN_WINDOW_MS) adminLoginAttempts.delete(ip);
        }
    }
    next();
});

// ===============================
// ADMIN SESSION
// ===============================

// Use the persistent SQLite database for sessions so restarts do not erase
// login sessions. Proxy trust is configured before request middleware above.

db.exec(`
    CREATE TABLE IF NOT EXISTS web_sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_web_sessions_expires ON web_sessions(expires);
`);

const { SQLiteSessionStore } = require("./session-store");
const sessionStore = new SQLiteSessionStore(db);
sessionStore.pruneStatement.run(Date.now());

app.use(session({
    name: "cmadd2.sid",
    store: sessionStore,
    secret: process.env.SESSION_SECRET || require("crypto").randomBytes(48).toString("hex"),
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 8 * 60 * 60 * 1000
    }
}));

// ===============================
// WEBSITE
// ===============================

app.use(express.static(__dirname));

// Customer email/password authentication routes
registerCustomerAuth(app, db);
registerCustomerLedger(app, db);
registerMeetingRoutes(app, db);
registerOfferRoutes(app, db);
registerAnalyticsRoutes(app, db);
registerBusinessRoutes(app, db);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ===============================
// CUSTOMER COMPLAINT
// ===============================

app.post("/api/complaints", (req, res) => {
    try {

        const {
            customerName,
            mobile,
            complaintType,
            complaintDetails
        } = req.body;

        if (
            !customerName ||
            !mobile ||
            !complaintType ||
            !complaintDetails
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        const complaintId =
            "CMD" +
            Math.floor(100000 + Math.random() * 900000);

        db.prepare(`
            INSERT INTO complaints
            (
                complaint_id,
                customer_name,
                mobile,
                complaint_type,
                details
            )
            VALUES (?, ?, ?, ?, ?)
        `).run(
            complaintId,
            customerName,
            mobile,
            complaintType,
            complaintDetails
        );

        res.json({
            success: true,
            complaintId: complaintId,
            message: "Complaint submitted successfully."
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to save complaint."
        });
    }
});

// ===============================
// TRACK COMPLAINT
// ===============================

app.get("/api/complaints/:id", (req, res) => {
    try {

        const complaint = db.prepare(`
            SELECT
                complaint_id,
                customer_name,
                complaint_type,
                details,
                status,
                created_at
            FROM complaints
            WHERE complaint_id = ?
        `).get(req.params.id);

        if (!complaint) {
            return res.status(404).json({
                success: false,
                message: "Complaint not found."
            });
        }

        res.json({
            success: true,
            complaint: complaint
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to track complaint."
        });
    }
});

// ===============================
// CUSTOMER FEEDBACK
// ===============================

app.post("/api/feedback", (req, res) => {
    try {

        const {
            customerName,
            mobile,
            rating,
            message
        } = req.body;

        if (
            !customerName ||
            !mobile ||
            !rating ||
            !message
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        const ratingNumber = Number(rating);

        if (
            !Number.isInteger(ratingNumber) ||
            ratingNumber < 1 ||
            ratingNumber > 5
        ) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5."
            });
        }

        db.prepare(`
            INSERT INTO feedback
            (
                customer_name,
                mobile,
                rating,
                message
            )
            VALUES (?, ?, ?, ?)
        `).run(
            customerName,
            mobile,
            ratingNumber,
            message
        );

        res.json({
            success: true,
            message: "Feedback submitted successfully."
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to save feedback."
        });
    }
});

// ===============================
// PRODUCT ENQUIRY
// ===============================

app.post("/api/enquiries", (req, res) => {
    try {

        const {
            customerName,
            mobile,
            productName,
            quantity,
            message
        } = req.body;

        if (
            !customerName ||
            !mobile ||
            !productName ||
            !quantity
        ) {
            return res.status(400).json({
                success: false,
                message: "All required fields are required."
            });
        }

        const quantityNumber = Number(quantity);

        if (
            !Number.isInteger(quantityNumber) ||
            quantityNumber < 1
        ) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be at least 1."
            });
        }

        const enquiryId =
            "ENQ" +
            Math.floor(100000 + Math.random() * 900000);

        db.prepare(`
            INSERT INTO enquiries
            (
                enquiry_id,
                customer_name,
                mobile,
                product_name,
                quantity,
                message
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            enquiryId,
            customerName,
            mobile,
            productName,
            quantityNumber,
            message || ""
        );

        res.json({
            success: true,
            enquiryId: enquiryId,
            message: "Enquiry submitted successfully."
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to save enquiry."
        });
    }
});

// ===============================
// ADMIN LOGIN
// ===============================

app.post("/api/admin/login", (req, res) => {

    const { username, password } = req.body;

    const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!process.env.SESSION_SECRET || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
        console.error("Admin login unavailable: required environment variables are missing.");
        return res.status(503).json({
            success: false,
            message: "Admin login is not configured. Please contact the site administrator."
        });
    }

    const supplied = Buffer.from(String(password ?? ""));
    const expected = Buffer.from(String(ADMIN_PASSWORD));
    const credentialsMatch = supplied.length === expected.length
        && require("crypto").timingSafeEqual(supplied, expected);

    if (username === ADMIN_USERNAME && credentialsMatch) {
        return req.session.regenerate((sessionError) => {
            if (sessionError) {
                console.error("Admin session regeneration failed:", sessionError);
                return res.status(500).json({ success: false, message: "Unable to start admin session." });
            }
            req.session.isAdmin = true;
            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Admin session save failed:", saveError);
                    return res.status(500).json({ success: false, message: "Unable to start admin session." });
                }
                return res.json({ success: true, message: "Login successful." });
            });
        });
    }

    res.status(401).json({
        success: false,
        message: "Invalid username or password."
    });
});

// ===============================
// ADMIN AUTH
// ===============================

function requireAdmin(req, res, next) {

    if (req.session && req.session.isAdmin) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: "Admin login required."
    });
}

// ===============================
// ADMIN LOGOUT
// ===============================

app.post("/api/admin/logout", requireAdmin, (req, res) => {

    req.session.destroy(() => {

        res.json({
            success: true,
            message: "Logged out successfully."
        });

    });
});

// ===============================
// ADMIN COMPLAINTS
// ===============================

app.get(
    "/api/admin/complaints",
    requireAdmin,
    (req, res) => {

        const complaints = db.prepare(`
            SELECT *
            FROM complaints
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            complaints: complaints
        });
    }
);

// ===============================
// UPDATE COMPLAINT
// ===============================

app.put(
    "/api/admin/complaints/:id",
    requireAdmin,
    (req, res) => {

        const { status } = req.body;

        const allowedStatuses = [
            "Pending",
            "Under Review",
            "Resolved",
            "Rejected"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status."
            });
        }

        const result = db.prepare(`
            UPDATE complaints
            SET status = ?
            WHERE complaint_id = ?
        `).run(
            status,
            req.params.id
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "Complaint not found."
            });
        }

        res.json({
            success: true,
            message: "Complaint status updated."
        });
    }
);

// ===============================
// ADMIN FEEDBACK
// ===============================

app.get(
    "/api/admin/feedback",
    requireAdmin,
    (req, res) => {

        const feedback = db.prepare(`
            SELECT *
            FROM feedback
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            feedback: feedback
        });
    }
);

// ===============================
// ADMIN ENQUIRIES
// ===============================

app.get(
    "/api/admin/enquiries",
    requireAdmin,
    (req, res) => {

        const enquiries = db.prepare(`
            SELECT *
            FROM enquiries
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            enquiries: enquiries
        });
    }
);

// ===============================
// UPDATE ENQUIRY
// ===============================

app.put(
    "/api/admin/enquiries/:id",
    requireAdmin,
    (req, res) => {

        const { status } = req.body;

        const allowedStatuses = [
            "New",
            "Contacted",
            "Completed"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid enquiry status."
            });
        }

        const result = db.prepare(`
            UPDATE enquiries
            SET status = ?
            WHERE enquiry_id = ?
        `).run(
            status,
            req.params.id
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: "Enquiry not found."
            });
        }

        res.json({
            success: true,
            message: "Enquiry status updated."
        });
    }
);

// =====================================================
// ORDER TRACKING
// =====================================================

// ===============================
// GENERATE TRACKING ID
// ===============================

function generateTrackingId() {

    const today = new Date();

    const year = today.getFullYear();

    const month = String(
        today.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        today.getDate()
    ).padStart(2, "0");

    const prefix =
        `CMADD-${year}${month}${day}`;

    const lastOrder = db.prepare(`
        SELECT tracking_id
        FROM orders
        WHERE tracking_id LIKE ?
        ORDER BY id DESC
        LIMIT 1
    `).get(`${prefix}-%`);

    let number = 1;

    if (lastOrder) {

        const lastNumber = parseInt(
            lastOrder.tracking_id
                .split("-")
                .pop()
        );

        if (!isNaN(lastNumber)) {
            number = lastNumber + 1;
        }
    }

    return `${prefix}-${String(number).padStart(3, "0")}`;
}

// ===============================
// ADMIN CREATE ORDER
// ===============================

app.post(
    "/api/admin/orders",
    requireAdmin,
    (req, res) => {

        try {

            const {
                customer_name,
                mobile,
                order_details,
                status,
                tracking_id
            } = req.body;

            if (
                !customer_name ||
                !mobile ||
                !order_details
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Customer name, mobile and order details are required."
                });
            }

            const finalTrackingId =
                tracking_id &&
                String(tracking_id).trim()
                    ? String(tracking_id).trim().toUpperCase()
                    : generateTrackingId();

            const existingOrder = db.prepare(`
                SELECT id
                FROM orders
                WHERE tracking_id = ?
            `).get(finalTrackingId);

            if (existingOrder) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Tracking ID already exists."
                });
            }

            const allowedStatuses = [
                "Order Received",
                "Confirmed",
                "Processing",
                "Dispatched",
                "Delivered",
                "Cancelled"
            ];

            const finalStatus =
                allowedStatuses.includes(status)
                    ? status
                    : "Order Received";

            db.prepare(`
                INSERT INTO orders
                (
                    tracking_id,
                    customer_name,
                    mobile,
                    order_details,
                    status
                )
                VALUES (?, ?, ?, ?, ?)
            `).run(
                finalTrackingId,
                String(customer_name).trim(),
                String(mobile).trim(),
                String(order_details).trim(),
                finalStatus
            );

            res.json({
                success: true,
                tracking_id: finalTrackingId,
                message:
                    "Order created successfully."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Unable to create order."
            });
        }
    }
);

// ===============================
// CUSTOMER TRACK ORDER
// ===============================

app.get(
    "/api/orders/:trackingId",
    (req, res) => {

        try {

            const trackingId =
                req.params.trackingId
                    .trim()
                    .toUpperCase();

            const order = db.prepare(`
                SELECT
                    tracking_id,
                    customer_name,
                    mobile,
                    order_details,
                    status,
                    created_at,
                    updated_at
                FROM orders
                WHERE tracking_id = ?
            `).get(trackingId);

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: "Order not found."
                });
            }

            res.json({
                success: true,
                order: order
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to track order."
            });
        }
    }
);

// ===============================
// ADMIN GET ALL ORDERS
// ===============================

app.get(
    "/api/admin/orders",
    requireAdmin,
    (req, res) => {

        try {

            const orders = db.prepare(`
                SELECT *
                FROM orders
                ORDER BY id DESC
            `).all();

            res.json({
                success: true,
                orders: orders
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to load orders."
            });
        }
    }
);

// ===============================
// ADMIN UPDATE ORDER STATUS
// ===============================

app.put(
    "/api/admin/orders/:trackingId",
    requireAdmin,
    (req, res) => {

        try {

            const { status } = req.body;

            const allowedStatuses = [
                "Order Received",
                "Confirmed",
                "Processing",
                "Dispatched",
                "Delivered",
                "Cancelled"
            ];

            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid order status."
                });
            }

            const trackingId =
                req.params.trackingId
                    .trim()
                    .toUpperCase();

            const result = db.prepare(`
                UPDATE orders
                SET
                    status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE tracking_id = ?
            `).run(
                status,
                trackingId
            );

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Order not found."
                });
            }

            res.json({
                success: true,
                message:
                    "Order status updated successfully."
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message:
                    "Unable to update order status."
            });
        }
    }
);
// ===============================
// ADMIN DASHBOARD
// ===============================

app.get(
    "/api/admin/dashboard",
    requireAdmin,
    (req, res) => {

        try {

            const totalOrders = db.prepare(`
                SELECT COUNT(*) AS count
                FROM orders
            `).get().count;

            const deliveredOrders = db.prepare(`
                SELECT COUNT(*) AS count
                FROM orders
                WHERE status = 'Delivered'
            `).get().count;

            const activeOrders = db.prepare(`
                SELECT COUNT(*) AS count
                FROM orders
                WHERE status NOT IN ('Delivered', 'Cancelled')
            `).get().count;

            const totalEnquiries = db.prepare(`
                SELECT COUNT(*) AS count
                FROM enquiries
            `).get().count;

            const newEnquiries = db.prepare(`
                SELECT COUNT(*) AS count
                FROM enquiries
                WHERE status = 'New'
            `).get().count;

            const totalComplaints = db.prepare(`
                SELECT COUNT(*) AS count
                FROM complaints
            `).get().count;

            const pendingComplaints = db.prepare(`
                SELECT COUNT(*) AS count
                FROM complaints
                WHERE status = 'Pending'
            `).get().count;

            const totalFeedback = db.prepare(`
                SELECT COUNT(*) AS count
                FROM feedback
            `).get().count;

            res.json({
                success: true,

                dashboard: {
                    totalOrders,
                    deliveredOrders,
                    activeOrders,
                    totalEnquiries,
                    newEnquiries,
                    totalComplaints,
                    pendingComplaints,
                    totalFeedback
                }
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                message: "Unable to load dashboard data."
            });
        }
    }
);
// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

    console.log(
        `Website running at http://localhost:${PORT}`
    );

    console.log(
        "Real complaint database is connected."
    );

    console.log(
        "Feedback database is connected."
    );

    console.log(
        "Product enquiry database is connected."
    );

    console.log(
        "Order tracking database is connected."
    );

    console.log(
        "Admin login protection is enabled."
    );

    console.log(
        "Server is running. Keep this PowerShell window open."
    );
});