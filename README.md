# FinSight AI

> **AI-powered BFSI intelligence platform for financial document analysis, risk assessment, and automated business insights.**

FinSight AI is an AI-assisted financial intelligence platform built for the **Banking, Financial Services, and Insurance (BFSI)** domain. It enables organizations to upload financial documents, extract meaningful insights, evaluate portfolio risks, and generate structured reports using AI-driven analysis.

The platform combines modern web technologies with generative AI to transform complex financial documents into actionable intelligence for analysts, decision-makers, and financial teams.

---

## 🚀 Key Features

### 📄 Secure Document Intelligence

- Secure financial document ingestion workflow
- Upload and analyze reports, credit reviews, and portfolio summaries
- Cloud-based document storage with Firebase Storage

### 🤖 AI-Powered Financial Analysis

- Automated document understanding using Google Gemini API
- Financial metric extraction from unstructured documents
- AI-generated executive summaries
- Intelligent insight generation

### 📊 Risk & Portfolio Analytics

- Portfolio risk assessment
- Sentiment analysis of financial reports
- Structured financial interpretation
- Monitoring dashboard for financial insights

### 🔐 Authentication & Data Management

- Firebase Authentication for secure user access
- Cloud Firestore for persistent application data
- Role-ready architecture for future enterprise expansion

### 🎨 Modern User Experience

- Responsive operational dashboard
- Dark-mode interface optimized for financial workflows
- Clean and intuitive BFSI-focused UI

---

# 🏗️ System Architecture

```
User
 |
 | Upload Financial Documents
 |
Frontend (React + TypeScript + TailwindCSS)
 |
Backend API (Node.js + Express)
 |
AI Processing Layer (Google Gemini API)
 |
Firebase Services
 ├── Authentication
 ├── Cloud Firestore
 └── Firebase Storage
```

---

# 🛠️ Tech Stack

## Frontend

- React
- TypeScript
- TailwindCSS
- Vite

## Backend

- Node.js
- Express.js

## AI Integration

- Google Gemini API

## Database & Cloud Infrastructure

- Firebase Authentication
- Cloud Firestore
- Firebase Storage

## Development & Deployment

- Docker
- Environment-based configuration

---

# ⚙️ Local Development Setup

## Prerequisites

Before running the project, make sure you have:

- Node.js 18+
- Firebase Project
- Google Gemini API Key
- Docker (optional)

---

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>

cd finsight-ai
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root and add:

```env
GEMINI_API_KEY=your_gemini_api_key

FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_storage_bucket
```

---

# 🐳 Docker Setup

### Build Docker Image

```bash
docker build -t finsight-ai .
```

### Run Container

```bash
docker run -d --env-file .env -p 3001:3001 finsight-ai
```

The application will be available at:

```
http://localhost:3001
```

---

# 📂 Project Highlights

- AI-driven BFSI document intelligence
- Generative AI powered financial analysis
- Secure cloud-based document workflows
- Scalable Firebase architecture
- Modern responsive dashboard experience

---

# 🔮 Future Enhancements

- Advanced portfolio prediction models
- Real-time financial market integrations
- Multi-user enterprise collaboration
- Automated compliance reporting
- AI chatbot for financial queries
- Advanced analytics visualization

---

# 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature/new-feature
```

3. Commit your changes

```bash
git commit -m "Add new feature"
```

4. Push your branch

```bash
git push origin feature/new-feature
```

5. Create a Pull Request

---

# 📜 License

This project is licensed under the MIT License.

---

## ⭐ Support

If you find this project useful, consider giving it a star ⭐ on GitHub.
