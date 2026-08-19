/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from "@/src/lib/firebase";
import {
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  deleteUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { DEFAULT_ROLE } from "@/src/lib/roleConstants";
import {
  Activity,
  TrendingUp,
  LayoutDashboard,
  FileText,
  ShieldCheck,
  LogOut,
  Upload,
  Search,
  Clock,
  Briefcase,
  AlertTriangle,
  Bell,
  Trophy,
  Wallet,
  Calculator,
  RefreshCw,
  HeartPulse,
  MessageSquare,
  LineChart,
  Globe,
  Lock,
  Shield,
  Repeat,
  FileBarChart,
  PieChart,
  Scale,
  Sparkles,
  Target
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { getSharedDocId, setSharedDocId, clearSharedDocId } from '@/src/lib/utils';

// Components
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";


import { Input } from "@/src/components/ui/input";

export function LogoIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Network Nodes in background */}
      <g
        stroke="url(#logoGrad)"
        strokeWidth="2.5"
        opacity="0.6"
        filter="url(#glow)"
      >
        <line
          x1="60"
          y1="90"
          x2="90"
          y2="40"
          stroke="url(#logoGrad)"
          strokeWidth="2"
        />
        <line
          x1="90"
          y1="40"
          x2="110"
          y2="75"
          stroke="url(#logoGrad)"
          strokeWidth="2"
        />
        <line
          x1="60"
          y1="90"
          x2="90"
          y2="135"
          stroke="url(#logoGrad)"
          strokeWidth="2"
        />
        <line
          x1="90"
          y1="135"
          x2="115"
          y2="105"
          stroke="url(#logoGrad)"
          strokeWidth="2"
        />
        <line
          x1="90"
          y1="135"
          x2="90"
          y2="175"
          stroke="url(#logoGrad)"
          strokeWidth="2"
        />

        <circle cx="90" cy="40" r="4.5" fill="#a855f7" />
        <circle cx="60" cy="90" r="4.5" fill="#6366f1" />
        <circle cx="90" cy="135" r="4.5" fill="#8b5cf6" />
        <circle cx="90" cy="175" r="4.5" fill="#6366f1" />
        <circle cx="110" cy="75" r="3" fill="#a855f7" />
        <circle cx="115" cy="105" r="3" fill="#8b5cf6" />
      </g>

      {/* Bold F Arrow Trend Foreground */}
      <path
        d="M 45 125 L 85 90 L 115 115 L 165 45 M 165 45 L 130 45 M 165 45 L 165 80"
        stroke="url(#logoGrad)"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#glow)"
      />
      <path
        d="M 85 90 L 135 90"
        stroke="url(#logoGrad)"
        strokeWidth="9"
        strokeLinecap="round"
        filter="url(#glow)"
      />
    </svg>
  );
}

// Pages (defined in separate files eventually, for now as sub-components)
import { Dashboard } from './components/Dashboard';
import { AnalysisList } from './components/AnalysisList';
import { FileUpload } from './components/FileUpload';
import { AnalysisDetail } from './components/AnalysisDetail';
import { AdminPanel } from './components/AdminPanel';
import { PrivacyDashboard } from './components/privacy/PrivacyDashboard';
import { AnomalyDashboard } from './components/anomaly/AnomalyDashboard';
import { BudgetDashboard } from './components/budget/BudgetDashboard';
import { CommandPalette } from './components/dashboard/CommandPalette';
import { SubscriptionAnalyzer } from './components/subscriptions/SubscriptionAnalyzer';
import { CategoryTrends } from './components/trends/CategoryTrends';
import { GoalPlanner } from './components/goals/GoalPlanner';
import { BillReminders } from './components/bills/BillReminders';
import { RolloverManager } from './components/rollover/RolloverManager';
import { ChallengesDashboard } from './components/challenges/ChallengesDashboard';
import { TaxEstimation } from './components/tax/TaxEstimation';
import { EmergencyFundPlanner } from './components/emergency/EmergencyFundPlanner';
import { HealthScoreDashboard } from './components/health/HealthScoreDashboard';
import { CashFlowDashboard } from './components/cashflow/CashFlowDashboard';
import { CurrencyManager } from './components/currency/CurrencyManager';
import { ChatAssistant } from './components/chat/ChatAssistant';
import { ForecastComparison } from './components/forecast/ForecastComparison';
import { PortfolioTracker } from './components/portfolio/PortfolioTracker';
import { ThemeProvider } from '@/src/lib/themeContext';
import { ThemeToggle } from '@/src/components/ThemeToggle';
import { ScrollToTop } from '@/src/components/ScrollToTop';
import { purgeApiCaches } from './pwa/registerSW';
import { clearAllLocalData } from '@/src/lib/storageUtils';

// Feature screens that were implemented but never mounted (issue #897)
import { ReportExport } from "./components/reports/ReportExport";
import { InsightsDashboard } from "./components/insights/InsightsDashboard";
import { CurrencyConverter } from "./components/currency/CurrencyConverter";
import MultiCurrencyNetWorth from "./components/MultiCurrencyNetWorth";
import { FxExposureMatrix } from "./components/currency/FxExposureMatrix";
import { ComplianceAuditDashboard } from "./components/compliance/ComplianceAuditDashboard";
import TaxLossHarvester from "./components/TaxLossHarvester";
import { TaxLossHarvesting } from "./components/tax/TaxLossHarvesting";
import MonteCarloRetirement from "./components/MonteCarloRetirement";
import SubscriptionAssistant from "./components/SubscriptionAssistant";
import DripAnalyzer from "./components/DripAnalyzer";
import NewsSentimentDashboard from "./components/NewsSentimentDashboard";
import FinancialLiteracyBot from "./components/FinancialLiteracyBot";
import OptionsStrategyBuilder from "./components/OptionsStrategyBuilder";
import PlaidLinkConnect from "./components/PlaidLinkConnect";
import RealEstateTracker from "./components/RealEstateTracker";
import CryptoPortfolioTracker from "./components/CryptoPortfolioTracker";
import { CryptoWebSocketProvider } from "./components/CryptoWebSocketProvider";
import EsgDashboard from "./components/EsgDashboard";
import PeerSpendingComparison from "./components/PeerSpendingComparison";
import { MultiScenarioMatrix } from "./components/forecast/MultiScenarioMatrix";
import ReceiptUploader from "./components/ReceiptUploader";
import SmsOptInSettings from "./components/SmsOptInSettings";
import VoiceExpenseLogger from "./components/VoiceExpenseLogger";
import BudgetReallocator from "./components/BudgetReallocator";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(() =>
    getSharedDocId() ? "detail" : "dashboard",
  );
  const [selectedDocId, setSelectedDocId] = useState<string | null>(() =>
    getSharedDocId(),
  );
  const selectedDocIdRef = useRef<string | null>(getSharedDocId());
  const contentScrollRef = useRef<HTMLDivElement>(null);

  // Email auth state
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [showVerificationScreen, setShowVerificationScreen] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);

  // Validation regexes
  const usernameRegex = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  const getDefaultProfile = (currentUser: User) => ({
    uid: currentUser.uid,
    username: currentUser.displayName || "",
    email: currentUser.email,
    role: DEFAULT_ROLE,
    createdAt: new Date().toISOString(),
  });

  // Fetch user role from Firestore instead of hardcoding
  const fetchUserRole = async (userId: string): Promise<string> => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        return userDoc.data().role || DEFAULT_ROLE;
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
    }
    return DEFAULT_ROLE;
  };

  const validateUsername = (username: string): string | null => {
    if (!username) return "Username is required";
    if (!usernameRegex.test(username)) {
      return "Username must be 3-20 characters, start with a letter, contain only letters, numbers, or underscore";
    }
    return null;
  };

  const validateEmail = (email: string): string | null => {
    if (!email) return "Email is required";
    if (!emailRegex.test(email)) return "Invalid email address";
    return null;
  };

  const validatePassword = (password: string): string | null => {
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(password))
      return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(password))
      return "Password must contain at least one lowercase letter";
    if (!/\d/.test(password))
      return "Password must contain at least one number";
    if (!/[@$!%*?&]/.test(password))
      return "Password must contain at least one special character (@$!%*?&)";
    return null;
  };

  const openAnalysisView = (
    docId: string,
    source: "upload" | "dashboard" | "list",
  ) => {
    if (!docId) return;

    selectedDocIdRef.current = docId;
    setSelectedDocId(docId);
    setSharedDocId(docId);
    setActiveTab("detail");

    if (source === "upload") {
      // uploaded docId handled via setSelectedDocId above
    }
  };

  useEffect(() => {
    if (selectedDocId) {
      selectedDocIdRef.current = selectedDocId;
    }
  }, [selectedDocId]);

  // Use selectedDocId directly - it is already initialized with getSharedDocId()
  const activeDocId = selectedDocId;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Safety timeout: if Firebase auth does not resolve within 10 seconds, show an error
    timeoutId = setTimeout(() => {
      setAuthTimedOut(true);
      setLoading(false);
    }, 10000);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (timeoutId) clearTimeout(timeoutId);
        setAuthTimedOut(false);
        setAuthError(null);
        setUser(currentUser);
        if (currentUser) {
          // Check email verification
          if (!currentUser.emailVerified) {
            setShowVerificationScreen(true);
            setLoading(false);
            return;
          }

          // Sync user profile for verified users
          const userRef = doc(db, "users", currentUser.uid);
          try {
            const userSnap = await getDoc(userRef);

            if (userSnap.exists() && userSnap.data().deletedAt) {
              // Erased account: the profile must stay deleted. Terminate the
              // session instead of auto-recreating a fresh profile.
              setUserProfile(null);
              setShowVerificationScreen(false);
              try {
                await deleteUser(currentUser);
              } catch (authError) {
                console.error("Could not remove auth account:", authError);
              }
              await signOut(auth);
              toast.info("This account has been deleted.");
              setLoading(false);
              return;
            }

            if (!userSnap.exists()) {
              const profile = getDefaultProfile(currentUser);
              await setDoc(userRef, profile);
              setUserProfile(profile);
            } else {
              setUserProfile(userSnap.data());
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.GET, "users");
            setUserProfile(getDefaultProfile(currentUser));
            toast.error(
              "Unable to sync your cloud profile. Using a local session profile for now.",
            );
          }
        } else {
          setUserProfile(null);
          setShowVerificationScreen(false);
        }
        setLoading(false);
      },
      (error) => {
        // Auth observer also fires error events
        if (timeoutId) clearTimeout(timeoutId);
        setAuthError(error.message || "Authentication failed");
        setLoading(false);
      },
    );

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success("Welcome back to FinSight AI");
    } catch (error: any) {
      const code = error?.code || "unknown";
      console.error("Auth error:", error);
      if (code === "auth/popup-blocked") {
        toast.error("Popup blocked — please allow popups for localhost in your browser");
      } else if (code === "auth/operation-not-allowed") {
        toast.error("Google sign-in is not enabled in Firebase Console");
      } else if (code === "auth/unauthorized-domain") {
        toast.error("Domain not authorized — add localhost to Firebase Auth settings");
      } else if (code === "auth/cancelled-popup-request" || code === "auth/popup-closed-by-user") {
        // user dismissed — no toast needed
      } else {
        toast.error(`Sign-in failed: ${code}`);
      }
    }
  };

  const handleEmailSignup = async () => {
    // Validate all fields
    const usernameError = validateUsername(username);
    if (usernameError) {
      toast.error(usernameError);
      return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
      toast.error(emailError);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    setEmailAuthLoading(true);
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const newUser = userCredential.user;

      try {
        // SECURITY: Always assign DEFAULT_ROLE ("junior_analyst") at signup.
        // Privileged roles (senior_pm, cro, compliance, admin) must only be
        // granted server-side via the Firebase Admin SDK. Firestore rules on
        // /users/{userId} enforce incoming().role == 'junior_analyst' as a
        // second layer. Never use user-controlled input for role. (Fixes #505)
        await setDoc(doc(db, "users", newUser.uid), {
          uid: newUser.uid,
          username: username,
          email: email,
          role: DEFAULT_ROLE,
          createdAt: new Date().toISOString(),
        });
      } catch (profileError) {
        handleFirestoreError(profileError, OperationType.CREATE, "users");
      }

      await sendEmailVerification(newUser);

      toast.success("Account created!");
      setUsername("");
      setEmail("");
      setPassword("");
      setIsSignup(false);
      setShowVerificationScreen(true);
    } catch (error: any) {
      const code = error?.code || "unknown";
      console.error("Signup error:", error);
      if (code === "auth/email-already-in-use") {
        toast.error("Email is already registered. Please sign in instead.");
      } else if (code === "auth/weak-password") {
        toast.error("Password should be at least 6 characters");
      } else if (code === "auth/invalid-email") {
        toast.error("Invalid email address");
      } else {
        toast.error(`Sign up failed: ${code}`);
      }
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const handleEmailSignin = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      toast.error(emailError);
      return;
    }

    if (!password) {
      toast.error("Password is required");
      return;
    }

    setEmailAuthLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      if (!userCredential.user.emailVerified) {
        setShowVerificationScreen(true);
        setEmail("");
        setPassword("");
      } else {
        toast.success("Welcome back to FinSight AI");
        setEmail("");
        setPassword("");
      }
    } catch (error: any) {
      const code = error?.code || "unknown";
      console.error("Login error full:", JSON.stringify({ code, message: error?.message }));
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        toast.error("No account found with this email. Please sign up first.");
      } else if (code === "auth/wrong-password") {
        toast.error("Incorrect password. Please try again.");
      } else if (code === "auth/invalid-email") {
        toast.error("Invalid email address");
      } else if (code === "auth/too-many-requests") {
        toast.error("Too many failed attempts. Please try again later.");
      } else if (code === "auth/internal-error") {
        toast.error(`Firebase internal error — check browser console for details`);
      } else {
        toast.error(`Sign in failed: ${code}`);
      }
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    // Drop every cached API response (may include session-bound data or
    // signed URLs) and the local analysis mirror before the next user signs
    // in on this device.
    void purgeApiCaches();
    clearAllLocalData();
    setActiveTab("dashboard");
    setShowVerificationScreen(false);
    setUsername("");
    setEmail("");
    setPassword("");
    toast.success("Signed out successfully");
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setVerificationLoading(true);
    try {
      await sendEmailVerification(auth.currentUser);
      toast.success("Verification email sent!");
    } catch (error: any) {
      console.error("Resend verification error:", error);
      toast.error("Failed to send verification email");
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!auth.currentUser) return;
    setVerificationLoading(true);
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        setShowVerificationScreen(false);
        toast.success("Email verified! Welcome to FinSight AI");
      } else {
        toast.error("Email not verified yet. Please check your inbox.");
      }
    } catch (error: any) {
      console.error("Verification check error:", error);
      toast.error("Failed to check verification status");
    } finally {
      setVerificationLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#0a0c10]">
        {/* Loading skeleton that mimics the app shell */}
        <div className="flex w-full max-w-2xl flex-col items-center gap-6 px-8">
          {/* Logo skeleton */}
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-800" />
            <div className="h-6 w-32 animate-pulse rounded bg-slate-800" />
          </div>
          {/* Spinner */}
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">
            Initializing FinSight AI...
          </p>
          {/* Nav skeleton */}
          <div className="mt-4 grid w-full grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-xl bg-slate-800"
              />
            ))}
          </div>
          {/* Content skeleton */}
          <div className="mt-2 grid w-full grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl bg-slate-800"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Auth timeout or error state
  if (authTimedOut || authError) {
    const message = authTimedOut
      ? "Authentication is taking longer than expected. This may be due to a slow network or Firebase service issues."
      : `Sign-in issue: ${authError}`;
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0a0c10]">
        <div className="flex max-w-md flex-col items-center gap-6 text-center px-6">
          <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={32} className="text-red-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">
              {authTimedOut ? "Authentication Timeout" : "Sign-in Issue"}
            </h2>
            <p className="text-sm leading-6 text-slate-400">{message}</p>
          </div>
          <Button
            className="h-11 gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            onClick={() => {
              setAuthTimedOut(false);
              setAuthError(null);
              setLoading(true);
              // Re-trigger by forcing a re-render that re-mounts the effect
              window.location.reload();
            }}
          >
            <RefreshCw size={16} />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Verification screen
  if (user && showVerificationScreen && !user.emailVerified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#020617] px-4 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
        </div>

        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md space-y-8 text-center relative z-10"
        >
          <div className="space-y-4">
            <motion.div
              initial={false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-amber-600 shadow-2xl shadow-amber-600/40 border border-white/5"
            >
              <AlertTriangle className="h-12 w-12 text-white" />
            </motion.div>
            <div className="space-y-1">
              <h1 className="text-4xl font-black tracking-tighter text-white">
                Verify Your Email
              </h1>
              <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs mt-4">
                Almost there!
              </p>
            </div>
          </div>

          <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-3xl overflow-hidden shadow-black/80">
            <CardHeader className="p-10 pb-6">
              <CardTitle className="text-xl font-bold text-white tracking-tight">
                Email Verification Required
              </CardTitle>
              <CardDescription className="text-slate-500 mt-3 text-sm">
                We've sent a verification email to{" "}
                <strong className="text-slate-300">{user.email}</strong>. Click
                the link in the email to verify your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-10 pt-0 space-y-6">
              <Button
                onClick={handleCheckVerification}
                disabled={verificationLoading}
                className="w-full bg-indigo-600 h-14 text-white hover:bg-indigo-700 font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-900/40 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {verificationLoading
                  ? "Checking..."
                  : "✓ I've Verified My Email"}
              </Button>

              <Button
                onClick={handleResendVerification}
                disabled={verificationLoading}
                variant="outline"
                className="w-full h-12 text-slate-300 border-slate-700 hover:bg-slate-800 font-bold text-sm uppercase tracking-widest rounded-2xl disabled:opacity-50"
              >
                {verificationLoading
                  ? "Sending..."
                  : "Resend Verification Email"}
              </Button>

              <Button
                onClick={() => {
                  signOut(auth);
                  setShowVerificationScreen(false);
                  setUsername("");
                  setEmail("");
                  setPassword("");
                }}
                variant="ghost"
                className="w-full h-12 text-slate-500 hover:text-slate-300 font-semibold text-sm uppercase rounded-2xl"
              >
                Use Different Email
              </Button>

              <p className="text-[10px] text-slate-500 leading-relaxed max-w-[280px] mx-auto uppercase font-bold tracking-wider">
                Didn't receive the email? Check your spam folder or request a
                new verification link.
              </p>
            </CardContent>
          </Card>
        </motion.div>
        <Toaster position="bottom-right" richColors theme="dark" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#020617] px-4 overflow-hidden relative">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
        </div>

        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md space-y-10 text-center relative z-10"
        >
          <div className="space-y-4">
            <motion.div
              initial={false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-indigo-950/40 shadow-2xl shadow-indigo-500/20 border border-white/5"
            >
              <LogoIcon className="h-14 w-14" />
            </motion.div>
            <div className="space-y-1">
              <h1 className="text-5xl font-black tracking-tighter text-white">
                FinSight AI
              </h1>
              <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs">
                Tier-1 Institutional Risk Analytics
              </p>
            </div>
          </div>

          <Card className="border-slate-800 bg-slate-900 shadow-2xl rounded-3xl overflow-hidden shadow-black/80">
            <CardHeader className="p-10 pb-6">
              <CardTitle className="text-2xl font-bold text-white tracking-tight">
                Security Gateway
              </CardTitle>
              <CardDescription className="text-slate-500 mt-2">
                Unified access to military-grade financial intelligence.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-10 pt-0 space-y-8">
              <Button
                onClick={handleLogin}
                className="w-full bg-indigo-500 h-14 text-white hover:bg-indigo-400 active:bg-indigo-600 font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-500/50 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] border border-indigo-400/40"
              >
                Authenticate Google ID
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-900 px-4 text-slate-600 font-black tracking-[0.3em]">
                    Or Email
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {isSignup && (
                  <>
                    <Input
                      type="text"
                      placeholder="Username (3-20 characters, letters/numbers/_)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={emailAuthLoading}
                      className="bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 h-12 rounded-2xl"
                    />
                  </>
                )}
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={emailAuthLoading}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 h-12 rounded-2xl px-4 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors duration-200"
                />
                <Input
                  type="password"
                  placeholder="Password (8+ chars, upper, lower, number, special)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={emailAuthLoading}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-400 h-12 rounded-2xl px-4 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors duration-200"
                />
              </div>

              <Button
                onClick={isSignup ? handleEmailSignup : handleEmailSignin}
                disabled={emailAuthLoading}
                className="w-full bg-slate-700 border border-slate-500 h-14 text-white hover:bg-slate-600 active:bg-slate-800 disabled:opacity-50 active:bg-slate-800 font-black text-sm uppercase tracking-widest shadow-xl rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              >
                {emailAuthLoading
                  ? "Loading..."
                  : isSignup
                    ? "Create Account"
                    : "Sign In"}
              </Button>

              <button
                onClick={() => setIsSignup(!isSignup)}
                disabled={emailAuthLoading}
                className="w-full text-xs text-slate-400 hover:text-indigo-400 transition-colors duration-200 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSignup
                  ? "Already have an account? Sign In"
                  : "Don't have an account? Sign Up"}
              </button>



              <div className="flex justify-center gap-4">
                {[ShieldCheck, Lock, Activity].map((Icon, i) => (
                  <div
                    key={i}
                    className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500"
                  >
                    <Icon size={18} />
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed max-w-[280px] mx-auto uppercase font-bold tracking-wider">
                Full compliance with SOC2 & ISO 27001 data protection protocols.
              </p>
            </CardContent>
          </Card>
        </motion.div>
        <Toaster position="bottom-right" richColors theme="dark" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#0a0c10] text-slate-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r border-slate-800 flex flex-col md:flex">
        <div className="p-6 flex items-center gap-3">
          <div className="h-9 w-9 bg-slate-900 border border-slate-800 rounded flex items-center justify-center shadow-lg shadow-indigo-950/50">
            <LogoIcon className="h-7 w-7" />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            FinSight AI
          </span>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
          <NavItem
            icon={<LayoutDashboard size={20} />}
            label="Dashboard"
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <NavItem
            icon={<AlertTriangle size={20} />}
            label="Anomalies"
            active={activeTab === "anomalies"}
            onClick={() => setActiveTab("anomalies")}
          />
          <NavItem
            icon={<FileText size={20} />}
            label="Documents"
            active={activeTab === "documents"}
            onClick={() => setActiveTab("documents")}
          />
          <NavItem
            icon={<Wallet size={20} />}
            label="Budgets"
            active={activeTab === "budgets"}
            onClick={() => setActiveTab("budgets")}
          />
          <NavItem
            icon={<Clock size={20} />}
            label="AI Intelligence"
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          />
          <NavItem 
            icon={<TrendingUp size={20} />} 
            label="Trends" 
            active={activeTab === 'trends'} 
            onClick={() => setActiveTab('trends')} 
          />
          <NavItem 
            icon={<Globe size={20} />} 
            label="Currencies" 
            active={activeTab === 'currencies'} 
            onClick={() => setActiveTab('currencies')} 
          />
          <NavItem
            icon={<Bell size={20} />}
            label="Bills"
            active={activeTab === 'bills'}
            onClick={() => setActiveTab('bills')}
          />
          <NavItem
            icon={<RefreshCw size={20} />}
            label="Rollover"
            active={activeTab === 'rollover'}
            onClick={() => setActiveTab('rollover')}
          />
          <NavItem
            icon={<Trophy size={20} />}
            label="Challenges"
            active={activeTab === 'challenges'}
            onClick={() => setActiveTab('challenges')}
          />
          <NavItem 
            icon={<Calculator size={20} />} 
            label="Tax Estimator" 
            active={activeTab === 'tax'} 
            onClick={() => setActiveTab('tax')} 
          />
          <NavItem 
            icon={<Shield size={20} />} 
            label="Emergency Fund" 
            active={activeTab === 'emergency'} 
            onClick={() => setActiveTab('emergency')} 
          />
          <NavItem
            icon={<HeartPulse size={20} />}
            label="Health Score"
            active={activeTab === 'health'}
            onClick={() => setActiveTab('health')}
          />
          <NavItem
            icon={<MessageSquare size={20} />}
            label="AI Chat"
            active={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
          />
          <NavItem
            icon={<LineChart size={20} />}
            label="Forecast"
            active={activeTab === 'forecast'}
            onClick={() => setActiveTab('forecast')}
          />
          <NavItem
            icon={<Briefcase size={20} />}
            label="Portfolio"
            active={activeTab === 'portfolio'}
            onClick={() => setActiveTab('portfolio')}
          />
          <NavItem
            icon={<Repeat size={20} />}
            label="Subscriptions"
            active={activeTab === 'subscriptions'}
            onClick={() => setActiveTab('subscriptions')}
          />
          <NavItem
            icon={<Activity size={20} />}
            label="Cash Flow"
            active={activeTab === 'cashflow'}
            onClick={() => setActiveTab('cashflow')}
          />
          <NavItem
            icon={<Target size={20} />}
            label="Goals"
            active={activeTab === 'goals'}
            onClick={() => setActiveTab('goals')}
          />
          <NavItem
            icon={<FileBarChart size={20} />}
            label="Reports"
            active={activeTab === 'reports'}
            onClick={() => setActiveTab('reports')}
          />
          <NavItem
            icon={<PieChart size={20} />}
            label="Insights"
            active={activeTab === 'insights'}
            onClick={() => setActiveTab('insights')}
          />
          <NavItem
            icon={<Scale size={20} />}
            label="Compliance"
            active={activeTab === 'compliance'}
            onClick={() => setActiveTab('compliance')}
          />
          <NavItem
            icon={<Sparkles size={20} />}
            label="AI Tools"
            active={activeTab === 'ai-tools'}
            onClick={() => setActiveTab('ai-tools')}
          />
          <NavItem
            icon={<Shield size={20} />}
            label="Privacy & Security"
            active={activeTab === 'privacy'}
            onClick={() => setActiveTab('privacy')}
          />
          {userProfile?.role === "admin" && (
            <NavItem
              icon={<ShieldCheck size={20} />}
              label="Admin Portal"
              active={activeTab === "admin"}
              onClick={() => setActiveTab("admin")}
            />
          )}
        </nav>

        <div className="p-6 mt-auto">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl items-center gap-3 flex">
            <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-indigo-200 flex items-center justify-center text-indigo-900 font-bold overflow-hidden shadow-lg">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="User profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                user.displayName?.[0] || user.email?.[0]
              )}
            </div>
            <div className="min-w-0 overflow-hidden flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {user.displayName || user.email}
              </p>
              <p className="text-xs text-slate-500">
                {userProfile?.role || "Compliance Officer"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-500 hover:text-red-500 hover:bg-slate-800"
              onClick={handleLogout}
            >
              <LogOut size={18} />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-[#0d1017]">
          <div className="flex items-center gap-4 w-1/3">
            <div className="relative w-full group">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors"
                size={16}
              />
              <Input
                placeholder="Search... (Win+O or Ctrl+Space)"
                className="bg-slate-900/50 border-slate-800 shadow-inner pl-10 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500/50 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            {userProfile?.role && (
              <div className="flex items-center gap-2 border-r border-slate-800 pr-4">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Active Role
                </span>
                <span className="text-sm text-indigo-400 font-medium capitalize">
                  {userProfile.role.replace("_", " ")}
                </span>
              </div>
            )}
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 h-9 px-4 text-white font-semibold text-sm shadow-lg shadow-indigo-900/20"
              onClick={() => {
                setActiveTab("upload");
              }}
            >
              <Upload className="mr-2" size={16} />
              New Analysis
            </Button>
          </div>
        </header>

        <div
          ref={contentScrollRef}
          className="flex-1 p-8 overflow-y-auto bg-[#0a0c10]"
        >
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                <Dashboard
                  user={user}
                  userProfile={userProfile}
                  onAction={(tab) => setActiveTab(tab)}
                  onDocSelect={(id) => openAnalysisView(id, "dashboard")}
                />
              </motion.div>
            )}

            {activeTab === "anomalies" && (
              <motion.div
                key="anomalies"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-8"
              >
                <AnomalyDashboard user={user} />
              </motion.div>
            )}

            {activeTab === "documents" && (
              <motion.div
                key="documents"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <AnalysisList
                  type="all"
                  user={user}
                  onSelect={(id) => openAnalysisView(id, "list")}
                />
              </motion.div>
            )}

            {activeTab === "budgets" && (
              <motion.div
                key="budgets"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <BudgetDashboard user={user} />
                <BudgetReallocator />
              </motion.div>
            )}

            {activeTab === "cashflow" && (
              <motion.div
                key="cashflow"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <CashFlowDashboard user={user} />
              </motion.div>
            )}

            {activeTab === "history" && (
              <motion.div
                key="history"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <AnalysisList
                  type="completed"
                  user={user}
                  onSelect={(id) => openAnalysisView(id, "list")}
                />
              </motion.div>
            )}

            {activeTab === "subscriptions" && user && (
              <motion.div
                key="subscriptions"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <SubscriptionAnalyzer user={user} />
                <SubscriptionAssistant />
              </motion.div>
            )}

            {activeTab === "goals" && (
              <motion.div
                key="goals"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <GoalPlanner user={user} />
              </motion.div>
            )}

            {activeTab === 'bills' && (
              <motion.div 
                key="bills"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <BillReminders user={user} />
              </motion.div>
            )}

            {activeTab === 'rollover' && (
              <motion.div
                key="rollover"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <RolloverManager user={user} />
              </motion.div>
            )}

            {activeTab === 'emergency' && (
              <motion.div 
                key="emergency"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <EmergencyFundPlanner user={user} />
              </motion.div>
            )}

            {activeTab === 'challenges' && (
              <motion.div
                key="challenges"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <ChallengesDashboard user={user} />
              </motion.div>
            )}

            {activeTab === 'health' && (
              <motion.div
                key="health"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <HealthScoreDashboard user={user} />
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div
                key="chat"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="h-[calc(100vh-8rem)]"
              >
                <ChatAssistant user={user} />
              </motion.div>
            )}

            {activeTab === 'forecast' && (
              <motion.div
                key="forecast"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <ForecastComparison user={user} />
              </motion.div>
            )}

            {activeTab === 'portfolio' && (
              <motion.div
                key="portfolio"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <PortfolioTracker user={user} />
              </motion.div>
            )}

            {activeTab === 'upload' && (
              <motion.div 
                key="upload"
                initial={false}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="max-w-2xl mx-auto"
              >
                <FileUpload
                  user={user}
                  onComplete={(id) => openAnalysisView(id, "upload")}
                  onCancel={() => setActiveTab("dashboard")}
                />
              </motion.div>
            )}

            {activeTab === "detail" && activeDocId && (
              <motion.div
                key="detail"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                <AnalysisDetail
                  docId={activeDocId}
                  user={user}
                  onBack={() => {
                    clearSharedDocId();
                    setActiveTab("documents");
                  }}
                />
              </motion.div>
            )}

            {activeTab === 'currencies' && user && (
              <motion.div
                key="currencies"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <CurrencyManager user={user} />
                <CurrencyConverter />
                <MultiCurrencyNetWorth />
                <FxExposureMatrix />
              </motion.div>
            )}

            {activeTab === 'trends' && (
              <motion.div 
                key="trends"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <CategoryTrends user={user} />
              </motion.div>
            )}

            {activeTab === 'admin' && userProfile?.role === 'admin' && (
              <motion.div 
                key="admin"
                initial={false}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <AdminPanel />
              </motion.div>
            )}

            {activeTab === 'privacy' && user && (
              <motion.div 
                key="privacy"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <PrivacyDashboard user={user} />
              </motion.div>
            )}

            {activeTab === 'tax' && (
              <motion.div 
                key="tax"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="space-y-6">
                  <TaxEstimation user={user} />
                  <TaxLossHarvester />
                  <TaxLossHarvesting />
                </div>
              </motion.div>
            )}

            {activeTab === 'reports' && (
              <motion.div
                key="reports"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ReportExport />
              </motion.div>
            )}

            {activeTab === 'insights' && user && (
              <motion.div
                key="insights"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <InsightsDashboard user={user} />
              </motion.div>
            )}

            {activeTab === 'compliance' && user && (
              <motion.div
                key="compliance"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ComplianceAuditDashboard {...({ user } as any)} />
              </motion.div>
            )}

            {activeTab === 'ai-tools' && (
              <motion.div
                key="ai-tools"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <MonteCarloRetirement />
                <DripAnalyzer />
                <NewsSentimentDashboard />
                <FinancialLiteracyBot />
                <OptionsStrategyBuilder />
                <PeerSpendingComparison />
                <EsgDashboard />
                <MultiScenarioMatrix />
                <PlaidLinkConnect />
                <RealEstateTracker />
                <CryptoWebSocketProvider>
                  <CryptoPortfolioTracker />
                </CryptoWebSocketProvider>
                <ReceiptUploader />
                <SmsOptInSettings />
                <VoiceExpenseLogger />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      {user && (
        <CommandPalette
          onAction={setActiveTab}
          onDocSelect={(id) => openAnalysisView(id, "dashboard")}
        />
      )}
      <ScrollToTop scrollRef={contentScrollRef} />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors
        ${
          active
            ? "bg-slate-800/50 text-white"
            : "text-slate-400 hover:bg-slate-800/30"
        }
      `}
    >
      <span className={`${active ? "opacity-80" : "opacity-60"}`}>{icon}</span>
      {label}
    </button>
  );
}
