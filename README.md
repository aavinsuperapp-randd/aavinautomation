# WhatsApp Automation Platform

## 1. Project Overview
This is Phase 1 of a web-based WhatsApp API automation platform. The goal of this phase is to establish the project structure, a secure backend with Express.js, integration with Supabase for authentication, and a clean frontend featuring a login system and a protected dashboard placeholder. 

## 2. Folder Structure
The project is split into completely decoupled `frontend` and `backend` directories.

```text
whatsapp-automation/
├── frontend/             # HTML, CSS, Vanilla JS
│   ├── index.html        # Login page
│   ├── dashboard.html    # Protected dashboard
│   ├── css/              # Stylesheets
│   └── js/               # Frontend logic
├── backend/              # Node.js, Express.js backend
│   ├── controllers/
│   ├── routes/
│   ├── config/
│   ├── middleware/
│   ├── server.js
│   └── .env
└── README.md
```

## 3. Required Environment Variables
To run the backend, create a `.env` file in the `backend/` directory using the provided `.env.example`.

```env
PORT=5000

# Supabase details
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# AskEVA details (Prepared for Phase 2)
ASKEVA_API_URL=YOUR_ASKEVA_API_URL
ASKEVA_API_KEY=YOUR_ASKEVA_API_KEY
```

## 4. How to configure Supabase
1. Create a new project in Supabase.
2. Go to Project Settings -> API.
3. Copy the `Project URL` and paste it as `SUPABASE_URL`.
4. Copy the `service_role` secret key and paste it as `SUPABASE_SERVICE_ROLE_KEY`.
5. Create user accounts manually in the Supabase Authentication dashboard, as there is no public registration.

## 5. How to run backend
```bash
cd backend
npm install
npm start
```
The server will run on `http://localhost:5000`.

## 6. How to run frontend
Use any local web server to serve the `frontend/` directory (e.g., Live Server extension in VSCode, or `npx serve frontend`). Do not use the backend Express server to serve the frontend files.

## 7. API Endpoint
- **POST `/api/auth/login`**: Authenticates a user with `email` and `password`. Returns `{ success, message, token }`.

## 8. Security Notes
- `SUPABASE_SERVICE_ROLE_KEY` and `ASKEVA_API_KEY` are NEVER exposed to the frontend.
- The `.env` file must never be committed to source control.
- Passwords are never logged or stored manually.
- The backend handles all direct communication with the Supabase service role.

## 9. Vercel Deployment Preparation
- Ensure only the `frontend/` folder is selected as the root directory for Vercel.
- Configure Vercel to serve static files.
- Set the `API_BASE_URL` in `frontend/js/config.js` to point to the production Render URL.

## 10. Render Deployment Preparation
- Set the `backend/` directory as the root for your Render Web Service.
- Ensure all environment variables from `.env` are added to the Render dashboard.
- The Build command should be `npm install` and the Start command `npm start`.
