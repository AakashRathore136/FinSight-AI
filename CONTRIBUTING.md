# Contributing to FinSight AI

Thank you for contributing to FinSight AI — an AI-powered BFSI intelligence platform built on React, TypeScript, Vite, Firebase, and the Gemini API.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Architecture Overview](#architecture-overview)
- [Local Setup](#local-setup)
- [Branch Naming](#branch-naming)
- [Commit Message Format](#commit-message-format)
- [PR Checklist](#pr-checklist)
- [Issue Guidelines](#issue-guidelines)

---

## Code of Conduct

By participating, you agree to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Architecture Overview

FinSight-AI/
├── src/ # React application (Vite entry point)
│ ├── components/ # Feature components (upload, dashboard, analysis)
│ ├── pages/ # Route-level page components
│ ├── hooks/ # Custom React hooks
│ └── lib/ # Firebase client, Gemini API calls, utilities
├── components/ui/ # shadcn/ui base components
├── lib/ # Shared utility functions
├── server.ts # Express server (serves built frontend in production,
│ # proxies Gemini API calls to avoid CORS)
├── public/ # Static assets
├── .env.example # Environment variable reference
└── firebase-applet-config.template.json # Firebase config template


> **`server.ts`** is an Express server used in production Docker deployments. During local development (`npm run dev`), Vite's dev server is used directly and `server.ts` is not needed.

---

## Local Setup

### 1. Prerequisites

- Node.js 18+
- A Firebase project (free Spark plan works)
- A Google Gemini API key

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/FinSight-AI.git
cd FinSight-AI
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the following:

```env
# Vite exposes these to the browser — prefix must be VITE_
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_GEMINI_API_KEY=your_gemini_api_key
```

### 4. Set up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Create project**
2. Enable **Authentication** → Sign-in method → Google (and/or Email/Password)
3. Enable **Cloud Firestore** → Start in test mode for local dev
4. Enable **Firebase Storage** → Start in test mode
5. Go to Project Settings → Your apps → Add web app → copy the config values into `.env`

### 5. Get a Gemini API key

1. Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **Create API key** → copy the value into `VITE_GEMINI_API_KEY` in `.env`

### 6. Start the development server

```bash
npm run dev
```

Open http://localhost:5173

---

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/short-description` | `feature/loading-skeleton` |
| Bug fix | `fix/short-description` | `fix/gemini-error-handling` |
| Documentation | `docs/short-description` | `docs/contributing-setup` |
| Chore/refactor | `chore/short-description` | `chore/update-dependencies` |

---

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

<type>(scope): short description

Optional body explaining why, not what.


Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`

Examples:

feat(analysis): add skeleton loader during Gemini document processing
fix(auth): handle Firebase token expiry on dashboard
docs(contributing): add local Firebase setup walkthrough


---

## PR Checklist

Before opening a PR, confirm all of the following:

- [ ] TypeScript compiles without errors: `npx tsc --noEmit`
- [ ] Lint passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No `.env` values committed (check with `git diff --cached`)
- [ ] Branch is up to date with `main`
- [ ] PR description references the issue number (`Closes #XXX`)

---

## Issue Guidelines

Use the issue templates provided in `.github/ISSUE_TEMPLATE/`. When in doubt:

- **Bug?** → Use the Bug Report template
- **New feature?** → Use the Feature Request template
- **Question?** → Open a Discussion instead of an Issue
