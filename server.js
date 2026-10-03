const express = require("express");
const path = require("path");
const session = require("express-session");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3000;

// ===============================
// DATABASE
// ===============================

const db = new Database(
    path.join(__dirname, "complaints.db")
);

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// ADMIN SESSION
// ===============================

app.use(session({
    secret: "CMADD-Abhishek-Admin-Session-2026",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false
    }
}));

// ===============================
// WEBSITE
// ===============================

app.use(express.static(__dirname));

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

    const ADMIN_USERNAME = "Abhishek";
    const ADMIN_PASSWORD = "@Abhishek3002";

    if (
        username === ADMIN_USERNAME &&
        password === ADMIN_PASSWORD
    ) {

        req.session.isAdmin = true;

        return res.json({
            success: true,
            message: "Login successful."
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