const crypto = require("crypto");

module.exports = function registerCmaddFeatures(app, db, requireAdmin) {
  app.set("trust proxy", 1);
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL, medical_name TEXT NOT NULL, mobile TEXT NOT NULL,
      address TEXT NOT NULL, meeting_type TEXT NOT NULL, preferred_datetime TEXT NOT NULL,
      meeting_link TEXT DEFAULT '', notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, medical_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, mobile TEXT NOT NULL, password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL UNIQUE,
      balance REAL NOT NULL DEFAULT 0, note TEXT DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, occasion TEXT DEFAULT '',
      details TEXT DEFAULT '', categories TEXT DEFAULT '', products TEXT DEFAULT '',
      start_date TEXT NOT NULL, end_date TEXT NOT NULL, coupon TEXT DEFAULT '',
      banner_url TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, visitor_key TEXT NOT NULL, event_type TEXT NOT NULL,
      page TEXT DEFAULT '', detail TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const txt = (v, n=500) => String(v == null ? "" : v).trim().slice(0,n);
  const id = p => p + "-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const hash = (p, salt=crypto.randomBytes(16).toString("hex")) => salt + ":" + crypto.scryptSync(String(p), salt, 64).toString("hex");
  const verify = (p, saved) => { try { const [s,h]=saved.split(":"); return crypto.timingSafeEqual(crypto.scryptSync(String(p),s,64),Buffer.from(h,"hex")); } catch { return false; } };
  const customer = (req,res,next) => req.session && req.session.customerId ? next() : res.status(401).json({success:false,message:"Please sign in."});

  app.post("/api/meetings",(req,res)=>{
    try {
      const b=req.body, name=txt(b.customerName,100), med=txt(b.medicalName,120), mobile=txt(b.mobile,20), address=txt(b.address,300), type=txt(b.meetingType,20), when=txt(b.preferredDateTime,40);
      if(!name||!med||!mobile||!address||!when||!["Online","Offline"].includes(type)) return res.status(400).json({success:false,message:"Please fill all required fields."});
      const meetingId=id("MTG");
      db.prepare("INSERT INTO meeting_requests(meeting_id,customer_name,medical_name,mobile,address,meeting_type,preferred_datetime,notes) VALUES(?,?,?,?,?,?,?,?)").run(meetingId,name,med,mobile,address,type,when,txt(b.notes,1000));
      res.json({success:true,meetingId,message:"Request saved. You can also send the details directly on WhatsApp."});
    } catch(e){ console.error(e); res.status(500).json({success:false,message:"Unable to save meeting request."}); }
  });

  app.post("/api/customers/register",(req,res)=>{
    try {
      const b=req.body, name=txt(b.customerName,100), med=txt(b.medicalName,120), email=txt(b.email,160).toLowerCase(), mobile=txt(b.mobile,20), password=String(b.password||"");
      if(!name||!med||!email||!mobile||password.length<8) return res.status(400).json({success:false,message:"Fill all fields; password must be at least 8 characters."});
      const r=db.prepare("INSERT INTO customers(customer_name,medical_name,email,mobile,password_hash) VALUES(?,?,?,?,?)").run(name,med,email,mobile,hash(password));
      db.prepare("INSERT INTO customer_ledger(customer_id,balance,note) VALUES(?,0,'Awaiting ledger update')").run(r.lastInsertRowid);
      res.json({success:true,message:"Registration received. Admin approval is required before login."});
    } catch(e){ if(String(e.message).includes("UNIQUE")) return res.status(409).json({success:false,message:"Email already registered."}); console.error(e); res.status(500).json({success:false,message:"Registration failed."}); }
  });
  app.post("/api/customers/login",(req,res)=>{
    const email=txt(req.body.email,160).toLowerCase(), password=String(req.body.password||"");
    const c=db.prepare("SELECT * FROM customers WHERE email=?").get(email);
    if(!c||!verify(password,c.password_hash)) return res.status(401).json({success:false,message:"Email or password is incorrect."});
    if(c.status!=="Approved") return res.status(403).json({success:false,message:c.status==="Rejected"?"Registration was not approved.":"Verification in progress — your account awaits admin approval.",status:c.status});
    req.session.customerId=c.id;
    res.json({success:true,customer:{name:c.customer_name,medicalName:c.medical_name,email:c.email}});
  });
  app.post("/api/customers/logout",(req,res)=>{ delete req.session.customerId; res.json({success:true}); });
  app.get("/api/customers/me",customer,(req,res)=>{
    const c=db.prepare("SELECT id,customer_name,medical_name,email,mobile FROM customers WHERE id=?").get(req.session.customerId);
    const ledger=db.prepare("SELECT balance,note,updated_at FROM customer_ledger WHERE customer_id=?").get(req.session.customerId);
    res.json({success:true,customer:c,ledger:ledger||{balance:0,note:"No ledger entry yet"}});
  });

  app.get("/api/campaigns",(req,res)=>{
    const today=new Date().toISOString().slice(0,10);
    res.json({success:true,campaigns:db.prepare("SELECT id,title,occasion,details,categories,products,start_date,end_date,banner_url FROM campaigns WHERE active=1 AND start_date<=? AND end_date>=? ORDER BY id DESC").all(today,today)});
  });
  app.post("/api/activity",(req,res)=>{
    try {
      const visitor=txt(req.body.visitorKey,100)|| (req.session.visitorKey ||= crypto.randomUUID());
      const event=txt(req.body.eventType,40), allowed=["page_view","product_view","whatsapp_click","enquiry_click","campaign_view","repeat_visit"];
      if(!allowed.includes(event)) return res.status(400).json({success:false});
      db.prepare("INSERT INTO activity_events(visitor_key,event_type,page,detail) VALUES(?,?,?,?)").run(visitor,event,txt(req.body.page,180),txt(req.body.detail,180));
      res.json({success:true});
    } catch(e){ console.error(e); res.status(500).json({success:false}); }
  });

  app.get("/api/admin/meetings",requireAdmin,(req,res)=>res.json({success:true,meetings:db.prepare("SELECT * FROM meeting_requests ORDER BY id DESC").all()}));
  app.put("/api/admin/meetings/:id",requireAdmin,(req,res)=>{
    const status=txt(req.body.status,30), link=txt(req.body.meetingLink,500);
    if(!["Pending","Confirmed","Completed","Cancelled"].includes(status)) return res.status(400).json({success:false,message:"Invalid status."});
    const r=db.prepare("UPDATE meeting_requests SET status=?,meeting_link=? WHERE meeting_id=?").run(status,link,req.params.id);
    if(!r.changes) return res.status(404).json({success:false,message:"Meeting not found."}); res.json({success:true});
  });
  app.get("/api/admin/customers",requireAdmin,(req,res)=>res.json({success:true,customers:db.prepare("SELECT c.id,c.customer_name,c.medical_name,c.email,c.mobile,c.status,c.created_at,l.balance,l.note FROM customers c LEFT JOIN customer_ledger l ON l.customer_id=c.id ORDER BY c.id DESC").all()}));
  app.put("/api/admin/customers/:id",requireAdmin,(req,res)=>{
    const status=txt(req.body.status,20), balance=Number(req.body.balance), note=txt(req.body.note,500);
    if(!["Pending","Approved","Rejected"].includes(status)||!Number.isFinite(balance)||balance<0) return res.status(400).json({success:false,message:"Invalid status or balance."});
    const tx=db.transaction(()=>{ const found=db.prepare("SELECT id FROM customers WHERE id=?").get(req.params.id); if(!found)return false; db.prepare("UPDATE customers SET status=? WHERE id=?").run(status,req.params.id); db.prepare("INSERT INTO customer_ledger(customer_id,balance,note,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(customer_id) DO UPDATE SET balance=excluded.balance,note=excluded.note,updated_at=CURRENT_TIMESTAMP").run(req.params.id,balance,note); return true; });
    if(!tx()) return res.status(404).json({success:false,message:"Customer not found."}); res.json({success:true});
  });
  app.get("/api/admin/campaigns",requireAdmin,(req,res)=>res.json({success:true,campaigns:db.prepare("SELECT * FROM campaigns ORDER BY id DESC").all()));
  app.post("/api/admin/campaigns",requireAdmin,(req,res)=>{
    const b=req.body, title=txt(b.title,120), start=txt(b.startDate,10), end=txt(b.endDate,10);
    if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start) return res.status(400).json({success:false,message:"Enter title and valid dates."});
    const r=db.prepare("INSERT INTO campaigns(title,occasion,details,categories,products,start_date,end_date,coupon,banner_url,active) VALUES(?,?,?,?,?,?,?,?,?,?)").run(title,txt(b.occasion,80),txt(b.details,1000),txt(b.categories,300),txt(b.products,500),start,end,txt(b.coupon,50),txt(b.bannerUrl,500),b.active===false?0:1);
    res.json({success:true,id:r.lastInsertRowid});
  });
  app.put("/api/admin/campaigns/:id",requireAdmin,(req,res)=>{
    const r=db.prepare("UPDATE campaigns SET active=? WHERE id=?").run(req.body.active?1:0,req.params.id);
    if(!r.changes)return res.status(404).json({success:false,message:"Campaign not found."});res.json({success:true});
  });
  app.get("/api/admin/analytics",requireAdmin,(req,res)=>{
    const summary=db.prepare("SELECT COUNT(*) events,COUNT(DISTINCT visitor_key) visitors,SUM(CASE WHEN event_type='page_view' THEN 1 ELSE 0 END) pageViews,SUM(CASE WHEN event_type='whatsapp_click' THEN 1 ELSE 0 END) whatsappClicks,SUM(CASE WHEN event_type='product_view' THEN 1 ELSE 0 END) productViews,SUM(CASE WHEN event_type='enquiry_click' THEN 1 ELSE 0 END) enquiryClicks FROM activity_events").get();
    const recent=db.prepare("SELECT event_type,page,detail,created_at FROM activity_events ORDER BY id DESC LIMIT 50").all(); res.json({success:true,summary,recent});
  });
};
