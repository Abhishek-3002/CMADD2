# CMADD2 implementation plan

- Secure admin authentication with environment variables.
- Customer registration with medical name, customer name, mobile, email and password.
- Admin approval required before customer login.
- Customer-only dashboard and isolated ledger data.
- Order tracking separate from complaint tracking, with order status updates.
- Admin management for complaints, feedback, enquiries, orders and customer approvals.
- Festival promotion management with schedule, categories and banners; no public prices.
- Meeting booking requests for online or offline shop visits.
- Customer activity analytics, with WhatsApp clicks distinguished from messages actually sent.
- Regression testing before production deployment.

Keep existing complaint, feedback, enquiry, order tracking and admin dashboard routes working. Do not deploy untested changes to the production site.
