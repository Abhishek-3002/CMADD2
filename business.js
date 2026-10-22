function registerBusinessRoutes(app, db) {
  db.exec(\`
    CREATE TABLE IF NOT EXISTS catalog_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'General', image_url TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS business_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sale_date TEXT NOT NULL, amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
      party_name TEXT NOT NULL DEFAULT '', mr_name TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS business_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, period_type TEXT NOT NULL CHECK(period_type IN ('day','month')),
      period_key TEXT NOT NULL, target_paise INTEGER NOT NULL CHECK(target_paise >= 0), updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(period_type, period_key)
    );
    CREATE TABLE IF NOT EXISTS medical_representatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, mobile TEXT NOT NULL DEFAULT '',
      target_paise INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS mr_points_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, mr_id INTEGER NOT NULL REFERENCES medical_representatives(id),
      sale_id INTEGER REFERENCES business_sales(id), points INTEGER NOT NULL DEFAULT 2, note TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  \`);
  const admin = (req,res,next) => req.session && req.session.isAdmin ? next() : res.status(401).json({success:false,message:"Admin login required."});
  const rupees = n => Math.round(Number(n) * 100);
  const validAmount = n => Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) <= 1000000000;
  const today = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const month = () => today().slice(0,7);
  const scoreFor = id => {
    const row = db.prepare(\`SELECT
      COALESCE(SUM(CASE WHEN entry_type='debit' THEN amount_paise ELSE 0 END),0) AS billed,
      COALESCE(SUM(CASE WHEN entry_type='credit' THEN amount_paise ELSE 0 END),0) AS paid,
      COALESCE(SUM(CASE WHEN entry_type='debit' THEN amount_paise ELSE -amount_paise END),0) AS balance
      FROM customer_ledger WHERE customer_id=?\`).get(id);
    if (!row.billed && !row.paid) return {score:600, band:"New account", billedPaise:0, paidPaise:0, balancePaise:0, paymentRatio:0};
    const ratio = row.billed > 0 ? Math.min(1.2, row.paid / row.billed) : (row.paid > 0 ? 1 : 0);
    const balanceRatio = row.billed > 0 ? Math.max(0, row.balance) / row.billed : 0;
    const score = Math.max(300, Math.min(900, Math.round(300 + Math.min(1,ratio)*500 + (row.balance <= 0 ? 100 : Math.max(0,100 - balanceRatio*200)))));
    return {score, band:score>=800?"Excellent":score>=700?"Good":score>=600?"Fair":"Needs improvement", billedPaise:row.billed, paidPaise:row.paid, balancePaise:row.balance, paymentRatio:Math.round(ratio*100)};
  };
  app.get("/api/products/catalog", (req,res) => {
    try { res.json({success:true,products:db.prepare("SELECT id,name,description,category,image_url AS imageUrl FROM catalog_products WHERE active=1 ORDER BY name COLLATE NOCASE").all()}); }
    catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to load products."});}
  });
  app.post("/api/admin/products", admin, (req,res) => {
    const name=String(req.body.name||"").trim(), description=String(req.body.description||"").trim(), category=String(req.body.category||"General").trim(), imageUrl=String(req.body.imageUrl||"").trim();
    if(!name||name.length>160||description.length>1000||category.length>80||imageUrl.length>500|| (imageUrl && !/^https:\/\/|^\//i.test(imageUrl))) return res.status(400).json({success:false,message:"Enter a valid product name, description, category and HTTPS/local image path."});
    try { const r=db.prepare("INSERT INTO catalog_products(name,description,category,image_url) VALUES(?,?,?,?)").run(name,description,category||"General",imageUrl); res.status(201).json({success:true,id:Number(r.lastInsertRowid),message:"Product added to public catalog. Rates are not displayed."});}
    catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to save product."});}
  });
  app.get("/api/admin/business/summary", admin, (req,res) => {
    try {
      const t=today(), m=month();
      const daySales=db.prepare("SELECT COALESCE(SUM(amount_paise),0) v FROM business_sales WHERE sale_date=?").get(t).v;
      const monthSales=db.prepare("SELECT COALESCE(SUM(amount_paise),0) v FROM business_sales WHERE sale_date LIKE ?").get(m+"%").v;
      const dt=db.prepare("SELECT target_paise v FROM business_targets WHERE period_type='day' AND period_key=?").get(t);
      const mt=db.prepare("SELECT target_paise v FROM business_targets WHERE period_type='month' AND period_key=?").get(m);
      const pct=(v,target)=>target>0?Math.round(v/target*100):0;
      const mr=db.prepare(\`SELECT mr.id,mr.name,mr.mobile,mr.target_paise AS targetPaise,
        COALESCE(SUM(CASE WHEN s.sale_date LIKE ? THEN s.amount_paise ELSE 0 END),0) AS monthSalesPaise,
        COALESCE(SUM(CASE WHEN s.sale_date=? THEN s.amount_paise ELSE 0 END),0) AS todaySalesPaise,
        COALESCE((SELECT SUM(points) FROM mr_points_events p WHERE p.mr_id=mr.id),0) AS points
        FROM medical_representatives mr LEFT JOIN business_sales s ON s.mr_name=mr.name
        WHERE mr.active=1 GROUP BY mr.id ORDER BY monthSalesPaise DESC\`).all(m+"%",t).map(x=>({...x,monthPercent:pct(x.monthSalesPaise,x.targetPaise),todayPercent:pct(x.todaySalesPaise,dt?.v||0),level:Math.floor(x.points/100)+1,levelName:["Starter","Bronze","Silver","Gold","Platinum","Diamond","Elite"][Math.min(6,Math.floor(x.points/100))]}));
      const recent=db.prepare("SELECT id,sale_date AS date,amount_paise AS amountPaise,party_name AS partyName,mr_name AS mrName,note FROM business_sales ORDER BY id DESC LIMIT 100").all();
      res.json({success:true,today:{salesPaise:daySales,targetPaise:dt?.v||0,percent:pct(daySales,dt?.v||0)},month:{salesPaise:monthSales,targetPaise:mt?.v||0,percent:pct(monthSales,mt?.v||0)},mr,recent});
    } catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to load business analysis."});}
  });
  app.post("/api/admin/business/sales", admin, (req,res) => {
    const date=String(req.body.date||today()), amount=Number(req.body.amount), party=String(req.body.partyName||"").trim(), mrName=String(req.body.mrName||"").trim(), note=String(req.body.note||"").trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!validAmount(amount)||amount<=0||party.length>160||mrName.length>120||note.length>300) return res.status(400).json({success:false,message:"Enter a valid date, sale amount, party, MR and note."});
    try {
      const tx=db.transaction(()=>{const s=db.prepare("INSERT INTO business_sales(sale_date,amount_paise,party_name,mr_name,note) VALUES(?,?,?,?,?)").run(date,rupees(amount),party,mrName,note);
        if(mrName){const rep=db.prepare("SELECT id FROM medical_representatives WHERE name=? AND active=1").get(mrName);if(rep)db.prepare("INSERT INTO mr_points_events(mr_id,sale_id,points,note) VALUES(?,?,2,?)").run(rep.id,Number(s.lastInsertRowid),"2 points for recorded sale");}
        return Number(s.lastInsertRowid);}); const id=tx(); res.status(201).json({success:true,id,message:mrName?"Sale recorded; 2 MR points awarded when the MR name matches an active representative.":"Sale recorded."});
    }catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to record sale."});}
  });
  app.post("/api/admin/business/targets", admin, (req,res) => {
    const type=String(req.body.periodType||""), key=String(req.body.periodKey||""), amount=Number(req.body.amount);
    if(!["day","month"].includes(type)||!validAmount(amount)||amount<0||!(type==="day"?/^\d{4}-\d{2}-\d{2}$/.test(key):/^\d{4}-\d{2}$/.test(key))) return res.status(400).json({success:false,message:"Invalid target period or amount."});
    try{db.prepare("INSERT INTO business_targets(period_type,period_key,target_paise) VALUES(?,?,?) ON CONFLICT(period_type,period_key) DO UPDATE SET target_paise=excluded.target_paise,updated_at=CURRENT_TIMESTAMP").run(type,key,rupees(amount));res.json({success:true,message:"Target saved."});}catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to save target."});}
  });
  app.post("/api/admin/business/mrs", admin, (req,res) => {
    const name=String(req.body.name||"").trim(),mobile=String(req.body.mobile||"").trim(),target=Number(req.body.target||0);
    if(!name||name.length>120||mobile.length>25||!validAmount(target)) return res.status(400).json({success:false,message:"Enter a valid MR name, mobile and monthly target."});
    try{const r=db.prepare("INSERT INTO medical_representatives(name,mobile,target_paise) VALUES(?,?,?)").run(name,mobile,rupees(target));res.status(201).json({success:true,id:Number(r.lastInsertRowid),message:"MR added. Every recorded sale assigned to this MR earns 2 points."});}catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to add MR."});}
  });
  app.get("/api/customer/credit-score", (req,res) => {
    if(!req.session||!req.session.customerId)return res.status(401).json({success:false,message:"Customer login required."});
    try{const u=db.prepare("SELECT id,approval_status FROM customer_users WHERE id=?").get(req.session.customerId);if(!u||u.approval_status!=="Approved")return res.status(403).json({success:false,message:"Customer account is not approved."});res.json({success:true,credit:scoreFor(u.id)});}catch(e){console.error(e);res.status(500).json({success:false,message:"Unable to calculate internal payment score."});}
  });
}
module.exports = { registerBusinessRoutes };