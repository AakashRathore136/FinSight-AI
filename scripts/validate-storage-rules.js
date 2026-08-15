#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Validates that Firebase Storage rules are compatible with server configuration.
 * Run this before deploying to catch configuration mismatches.
 *
 * Cloud Storage Security Rules cannot read environment variables, so the
 * Firestore database id referenced inside storage.rules (the literal segment
 * after /databases/) must match the database the server actually uses
 * (FIREBASE_FIRESTORE_DATABASE_ID). A mismatch makes every isAdmin() check
 * silently evaluate to false — admins quietly lose Storage access with no
 * error. This script hard-fails the deploy when the two disagree.
 */

const fs = require('fs');
const path = require('path');

const RULES_FILE = path.join(__dirname, '..', 'storage.rules');
const DEFAULT_DB = '(default)';

// Matches the literal database id used in storage rules, e.g.
// /databases/(default)/documents/ or /databases/my-db/documents/
const DB_ID_RE = /\/databases\/\(([^/]+)\)\/documents\//g;

function checkStorageRules() {
  console.log('Validating Firebase Storage Rules...\n');

  const rules = fs.readFileSync(RULES_FILE, 'utf8');
  const issues = [];

  // The server-configured database id (server.ts default is "(default)").
  const configuredDb = process.env.FIREBASE_FIRESTORE_DATABASE_ID || DEFAULT_DB;

  // Collect every distinct database id hardcoded in the rules.
  const ruleDbIds = new Set();
  let match;
  while ((match = DB_ID_RE.exec(rules)) !== null) {
    ruleDbIds.add(match[1]);
  }

  if (ruleDbIds.size === 0) {
    issues.push({
      severity: 'ERROR',
      message:
        'storage.rules does not reference any Firestore database via ' +
        '/databases/(<id>)/documents/. Admin access checks cannot resolve.',
    });
  } else {
    ruleDbIds.forEach((id) => {
      console.log(`Storage rules reference Firestore database "${id}"`);
      if (id !== configuredDb) {
        issues.push({
          severity: 'ERROR',
          message:
            `storage.rules references database "${id}" but the server is ` +
            `configured with FIREBASE_FIRESTORE_DATABASE_ID="${configuredDb}". ` +
            `Admin Storage access will FAIL because isAdmin() will silently ` +
            `evaluate to false. Update the literal in storage.rules to ` +
            `"${configuredDb}" (or change the env var) before deploying.`,
        });
      }
    });
  }

  if (issues.length > 0) {
    console.log('\nISSUES FOUND:\n');
    issues.forEach((issue) => {
      console.log(`[${issue.severity}] ${issue.message}`);
    });
    console.log('\nFix the issues above before deploying.');
    process.exit(1);
  } else {
    console.log('\nNo issues found. Storage rules match the configured database.');
    process.exit(0);
  }
}

checkStorageRules();
