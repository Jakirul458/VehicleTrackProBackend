# VehicleTrack Pro API

Express, TypeScript, and MongoDB API. This directory is a standalone repository for deploying the API to Render.

## Run locally

Requirements: Node.js 20 or newer and MongoDB (local or Atlas).

```powershell
npm ci
npm run dev
```

Copy `.env.example` to `.env` and configure the environment variables:

- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: At least 32 random characters for JWT signing
- `SUPER_ADMIN_SETUP_KEY`: At least 32 random characters for initial super admin setup
- `CLIENT_ORIGIN`: Frontend URL (default: http://localhost:5173)
- `DEFAULT_EXPIRY_WARNING_DAYS`: Days before expiry to show warnings (default: 7)

Make sure local MongoDB is running before starting the API.

## Initial Setup

To create the first Super Admin, make a POST request to `/api/auth/setup-super-admin` with:

```json
{
  "setupKey": "your-super-admin-setup-key",
  "fullName": "Admin Name",
  "email": "admin@example.com",
  "password": "strong-password-min-12-chars",
  "mobile": "9000000000"
}
```

The setup key must match `SUPER_ADMIN_SETUP_KEY` from your `.env`. This endpoint only works if no Super Admin exists yet.

## Deploy to Render

1. Push the contents of this `backend` folder to its own GitHub repository.
2. In Render, choose **New > Blueprint** and connect the repository. Render detects `render.yaml`.
3. Enter the requested `MONGODB_URI` from MongoDB Atlas and `CLIENT_ORIGIN` as the exact deployed Vercel URL, with no trailing slash.
4. Generate and set `JWT_SECRET` and `SUPER_ADMIN_SETUP_KEY` as secure random strings.
5. Create the service. Render supplies `PORT`.
6. After the first deployment, call the `/api/auth/setup-super-admin` endpoint to create the superadmin.
7. Check `https://your-api.onrender.com/api/health`.
8. Set the Vercel frontend variable `VITE_API_URL` to `https://your-api.onrender.com/api`, then redeploy the frontend.

Never commit `.env`, MongoDB credentials, JWT secrets, or real admin passwords. The API uses JWT tokens in Authorization headers and enforces user permissions on the server.

## API

### Authentication

- `POST /api/auth/login` - Login with email and password, returns JWT token; optionally accepts browser-provided `location` coordinates (latitude, longitude, accuracy) for the session activity log
- `POST /api/auth/register` - Create an Agent account and start a one-month free trial
- `POST /api/auth/superadmin` - Super Admin exclusive login (role-based)
- `POST /api/auth/setup-super-admin` - Create initial Super Admin (requires setup key)
- `POST /api/auth/logout` - Logout
- `POST /api/auth/logout-on-close` - Best-effort logout when the browser tab closes (text/plain JWT body)
- `POST /api/auth/change-password` - Change user password (authenticated)
- `GET /api/auth/me` - Get current user info (authenticated)

### Admin (Super Admin only)

- `GET /api/admin/dashboard` - Platform-wide statistics
- `GET /api/admin/agents` - List all agents with pagination
- `GET /api/admin/agent-subscriptions` - Paginated list of all agents with subscription status and latest UPI payment
- `POST /api/admin/agents` - Create new agent
- `GET /api/admin/agents/:id` - Get agent details
- `PUT /api/admin/agents/:id` - Update agent
- `PATCH /api/admin/agents/:id/status` - Update agent status (ACTIVE/SUSPENDED)
- `PATCH /api/admin/agents/:id/validity` - Set agent validity date
- `PATCH /api/admin/agents/:id/subscription` - Assign a free or manually paid plan with its validity date
- `PATCH /api/admin/agents/:id/password` - Reset agent password as Super Admin
- `GET /api/admin/settings`, `PUT /api/admin/settings` - Read/update UPI, support and invoice supplier details
- `GET /api/admin/plans`, `POST /api/admin/plans`, `PUT /api/admin/plans/:id`, `DELETE /api/admin/plans/:id` - Manage dynamic subscription plans
- `GET /api/admin/subscription-payments` - Review subscription payment submissions
- `GET /api/admin/subscription-payments/:id` - Read a submission and its optional screenshot
- `PATCH /api/admin/subscription-payments/:id` - Approve or reject a payment; approval renews the agent and issues an invoice
- `DELETE /api/admin/agents/:id` - Delete agent
- `GET /api/admin/activity` - View/filter activity log by user (`search`), action, IP, and date (`from`, `to`)
- `GET /api/admin/activity/export` - Export matching activity as CSV (up to 10,000 rows)
- `GET /api/admin/sessions` - List active login sessions
- `DELETE /api/admin/sessions/:id` - Revoke an active session

### Agent (Authenticated agents only)

- `GET /api/reports/dashboard` - Agent-specific statistics
- `GET /api/reports/agent-finances` - Monthly, yearly, and lifetime portal/customer/commission totals
- `GET /api/settings/payment` - Public renewal payment instructions
- `GET /api/plans` - List current subscription plans
- `POST /api/payments/submissions` - Submit a 12-digit UTR and optional payment screenshot (authenticated agents; expired agents can access only payment routes)
- `GET /api/payments/submissions` - List the signed-in agent's submissions
- `GET /api/payments/invoices/:id` - Retrieve an approved invoice for the signed-in agent
- `GET /api/insurance`, `GET /api/tax`, `GET /api/puc` - List document records
- `GET /api/reminders` - Agent-owned insurance, tax, and PUC records due within `DEFAULT_EXPIRY_WARNING_DAYS`, with days remaining
- `POST /api/insurance`, `POST /api/tax`, `POST /api/puc` - Create records (agents only)
- `PUT /api/{insurance|tax|puc}/:id` - Update records (agents only)
- `DELETE /api/{insurance|tax|puc}/:id` - Soft-delete records (agents only)

Agents may start a one-month free trial through `/api/auth/register`. Expired agents can still sign in to submit a renewal payment and access approved invoices; their authenticated token cannot access protected application data until renewal. Super Admins configure UPI, support contacts, supplier GSTIN, invoice GST defaults, and an optional authorized signature from `/admin/settings`, manage plans from `/admin/plans`, and review agents and subscription invoices from the Admin Panel. The first API startup migrates the existing configured annual prices into Mongo-backed plans once. Subscription payments are verified manually from the submitted UTR; only approval extends access and creates an invoice. GST, when enabled, is added to the plan price and included in the UPI quote; invoice approval rejects tax totals that do not match the quoted/received amount. Confirm statutory GST invoice requirements with a tax professional. Super Admins can continue creating and managing agent accounts through `/api/admin/agents`. The retained Vehicle model is only used by the one-time legacy document migration and the existing report count; vehicle CRUD endpoints are not exposed.

### Health

- `GET /api/health` - Health check endpoint

## Authentication

The API uses JWT tokens for authentication. Include the token in the Authorization header. Login sessions expire after 30 minutes without activity and have a 12-hour maximum lifetime. Activity is retained for 90 days; MongoDB TTL cleanup runs asynchronously.

```
Authorization: Bearer <your-jwt-token>
```

Passwords are never returned by the API. Configure HTTPS in production.
