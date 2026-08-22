# Contributing to FinSight AI

Thank you for contributing to FinSight AI — an AI-powered BFSI intelligence platform built on React, TypeScript, Vite, Firebase, and Hugging Face inference.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Architecture Overview](#architecture-overview)
- [Local Setup](#local-setup)
- [Branch Naming](#branch-naming)
- [Commit Message Format](#commit-message-format)
- [Code Style](#code-style)
- [PR Checklist](#pr-checklist)
- [Issue Guidelines](#issue-guidelines)
- [Scope](#scope)

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
│ └── lib/ # Firebase client, API calls, and utilities
├── components/ui/ # shadcn/ui base components
├── lib/ # Shared utility functions
├── server.ts # Express server and API entry point
├── public/ # Static assets
├── .env.example # Environment variable reference
└── firebase-applet-config.template.json # Firebase config template

> **`server.ts`** starts the Express server and Vite middleware used by `npm run dev`; it also serves the built frontend when running the production bundle.

---

## Local Setup

### 1. Prerequisites

- Node.js 18+
- A Firebase project (free Spark plan works)
- A Hugging Face access token with inference access

### 2. Clone and install

```bash
git clone https://github.com/AakashRathore136/FinSight-AI.git
cd FinSight-AI
npm install
```

### 3. Configure environment variables

```bash
copy .env.example .env
```

Open `.env` and fill in the following:

```env
# See .env.example for the complete list and descriptions.
HUGGINGFACE_API_KEY=your_huggingface_api_key
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_FIRESTORE_DATABASE_ID=(default)
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_FIRESTORE_DATABASE_ID=(default)
```

### 4. Set up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Create project**
2. Enable **Authentication** → Sign-in method → Google (and/or Email/Password)
3. Enable **Cloud Firestore** → Start in test mode for local dev
4. Enable **Firebase Storage** → Start in test mode
5. Go to Project Settings → Your apps → Add web app → copy the config values into `.env`.

The repository does not currently define Firebase Emulator Suite settings in
`firebase.json`. Use a development Firebase project locally, and do not use
production data while developing or testing.

### 5. Get a Hugging Face access token

1. Visit [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
2. Create a token with the minimum required inference permission.
3. Copy the value into `HUGGINGFACE_API_KEY` in `.env`.

### 6. Start the development server

```bash
npm run dev
```

Open http://localhost:5173

For a production-like local build, run `npm run build` and then `npm start`.

### Useful commands

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the Vite/Express development server |
| `npm test`          | Run the Node test suite                   |
| `npm run typecheck` | Run TypeScript without emitting files     |
| `npm run lint`      | Run ESLint                                |
| `npm run build`     | Build the frontend and bundled server     |

---

## Branch Naming

| Type           | Pattern                     | Example                     |
| -------------- | --------------------------- | --------------------------- |
| Feature        | `feature/short-description` | `feature/loading-skeleton`  |
| Bug fix        | `fix/short-description`     | `fix/api-error-handling`    |
| Documentation  | `docs/short-description`    | `docs/contributing-setup`   |
| Chore/refactor | `chore/short-description`   | `chore/update-dependencies` |

---

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

<type>(scope): short description

Optional body explaining why, not what.

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`

Examples:

feat(analysis): add skeleton loader during document processing
fix(auth): handle Firebase token expiry on dashboard
docs(contributing): add local Firebase setup walkthrough

---

## Code Style

- Use TypeScript for application code and keep the existing project structure.
- Follow the rules in `eslint.config.js`; run `npm run lint` before opening a PR.
- Keep components focused and reuse existing utilities and UI primitives.
- Avoid committing generated output, credentials, or local `.env` files.
- Update relevant tests and documentation when behavior or public workflows change.

---

## PR Checklist

Before opening a PR, confirm all of the following:

- [ ] TypeScript compiles without errors: `npx tsc --noEmit`
- [ ] Lint passes: `npm run lint`
- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] No `.env` values committed (check with `git diff --cached`)
- [ ] Branch is up to date with `main`
- [ ] PR description references the issue number (`Closes #XXX`)

---

## Issue Guidelines

Before starting substantial work, check existing issues and comment on the issue
you want to work on. For GSSoC or other assigned work, wait for maintainer
assignment before beginning so effort is not duplicated. Do not claim multiple
issues at once.

Use the issue templates provided in `.github/ISSUE_TEMPLATE/`. When in doubt:

- **Bug?** → Use the Bug Report template
- **New feature?** → Use the Feature Request template
- **Question?** → Open a Discussion instead of an Issue

## Scope

Keep contributions aligned with the project's financial intelligence purpose,
security requirements, and maintainability goals. Changes that are unrelated to
an issue, introduce secrets or personal data, alter Firebase security rules
without discussion, or make broad stylistic rewrites may be requested to be
split or closed. Please raise architectural or breaking changes in an issue
before implementing them.
