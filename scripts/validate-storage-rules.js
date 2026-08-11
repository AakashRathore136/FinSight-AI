#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Validates that Firebase Storage rules are compatible with server configuration.
 * Run this before deploying to catch configuration mismatches.
 */

const fs = require('fs');
const path = require('path');

const RULES_FILE = path.join(__dirname, '..', 'storage.rules');
const DEFAULT_DB = '(default)';

function checkStorageRules() {
  console.log('Validating Firebase Storage Rules...\n');

  const rules = fs.readFileSync(RULES_FILE, 'utf8');
  const issues = [];

  if (rules.includes('/databases/(default)/documents/')) {
    console.log('Storage rules use hardcoded "(default)" database');
    
    if (process.env.FIREBASE_FIRESTORE_DATABASE_ID && 
        process.env.FIREBASE_FIRESTORE_DATABASE_ID !== DEFAULT_DB) {
      issues.push({
        severity: 'ERROR',
        message: `FIREBASE_FIRESTORE_DATABASE_ID is set to "${process.env.FIREBASE_FIRESTORE_DATABASE_ID}" but storage.rules expects "${DEFAULT_DB}". Admin access will FAIL!`
      });
    }
  }

  if (issues.length > 0) {
    console.log('\nISSUES FOUND:\n');
    issues.forEach(issue => {
      console.log(`[${issue.severity}] ${issue.message}`);
    });
    console.log('\nFix the issues above before deploying.');
    process.exit(1);
  } else {
    console.log('\nNo issues found. Storage rules are properly configured.');
    process.exit(0);
  }
}

checkStorageRules();
