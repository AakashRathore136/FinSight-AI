# Security Fix: Add XSS Sanitization for Markdown Rendering

## Summary
This PR adds proper sanitization for markdown rendering to prevent XSS attacks when displaying AI-generated content.

## Problem
The application uses `react-markdown` to render AI-generated content. Without proper sanitization, malicious content from the AI could lead to XSS attacks.

## Solution
Install and configure `remark-sanitize-jsx` and `rehype-sanitize-jsx` to sanitize all markdown output.

## Changes Required

### 1. Install Dependencies
```bash
npm install remark-sanitize-jsx rehype-sanitize-jsx
```

### 2. Update Markdown Components
```typescript
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || [])],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] || []), "className"],
  },
};

<Markdown 
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeSanitize]}
>
  {content}
</Markdown>
```

### 3. Add Content Security Policy (Optional)
Add CSP headers in server.ts:
```typescript
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  );
  next();
});
```

## References
- Fixes #421
- Reported by automated bug hunter
