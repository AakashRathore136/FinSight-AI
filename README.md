# FinSight AI

FinSight AI is an AI-assisted BFSI intelligence platform designed for financial document ingestion, portfolio risk assessment, and automated insight generation.

The platform enables users to upload financial reports, credit reviews, portfolio summaries, and institutional documents for AI-powered analysis and structured risk interpretation.

---

## Core Features

- Secure document ingestion workflow
- AI-powered financial intelligence analysis
- Risk assessment and sentiment scoring
- Automated executive summaries
- Structured financial metric extraction
- Portfolio monitoring dashboard
- BFSI-oriented reporting interface
- Firebase authentication and persistence
- Responsive dark-mode operational UI

---

## Tech Stack

### Frontend
- React
- TypeScript
- TailwindCSS
- Vite

### Backend
- Node.js
- Express

### AI Layer
- Google Gemini API

### Database & Infrastructure
- Firebase Authentication
- Cloud Firestore
- Firebase Storage

---

## Local Development Setup

### Prerequisites
- Node.js 18+
- Firebase Project
- Gemini API Key

---

### Installation

Install dependencies:

```bash
npm install

## Docker Setup

Build the image:

```bash
docker build -t finsight-ai .
```

Run the container in detached mode so it doesn't block your terminal:

```bash
docker run -d --env-file .env -p 3001:3001 finsight-ai
```

The application will be available at:

```text
http://localhost:3001
```