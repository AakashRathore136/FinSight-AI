/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';

import {
  MessageSquare,
  Send,
  Bot,
  User,
  Plus,
  Trash2,
  Loader2,
  TrendingUp,
  Wallet,
  BarChart3,
  PiggyBank,
  Target,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { format, subMonths } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/src/components/ui/avatar';
import { cn, formatCurrency } from '@/src/lib/utils';
import {
  type ChatMessage,
  type Conversation,
  type FinancialContext,
  type ChatResponse,
  saveConversation,
  loadConversations,
  deleteConversation,
  saveMessage,
  loadMessages,
  buildFinancialContext,
  generateChatResponse,
  updateConversation,
} from '@/src/lib/chatUtils';
import {
  fetchTransactionsForPeriod,
  buildPeriodConfig,
  type Transaction,
  type TrendPeriod,
} from '@/src/lib/trendsUtils';
import { fetchBudgetCategories } from '@/src/lib/budgetUtils';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#14b8a6'];

const QUICK_ACTIONS = [
  { label: 'Expenses', icon: Wallet, prompt: 'Show me my spending summary' },
  { label: 'Budget Advice', icon: Target, prompt: 'Give me budget advice' },
  { label: 'Spending Patterns', icon: TrendingUp, prompt: 'Analyze my spending patterns' },
  { label: 'Category Insights', icon: BarChart3, prompt: 'Give me category insights' },
  { label: 'Savings', icon: PiggyBank, prompt: 'Give me savings recommendations' },
];

interface ChatAssistantProps {
  user: { uid: string } | null;
}

export function ChatAssistant({ user }: ChatAssistantProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<{ name: string; monthlyLimit: number }[]>([]);
  const [context, setContext] = useState<FinancialContext | null>(null);
  const [chartData, setChartData] = useState<any[] | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentUserId = user?.uid || '';

  const period = useMemo<TrendPeriod>(() => 'month', []);

  const periodConfig = useMemo(
    () =>
      buildPeriodConfig(
        period,
        new Date(),
        undefined,
        undefined,
      ),
    [period],
  );

  useEffect(() => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    let active = true;

    fetchTransactionsForPeriod(currentUserId, periodConfig)
      .then((txns) => {
        if (!active) return;
        setTransactions(txns);
      })
      .catch((error) => {
        console.error('Error fetching transactions:', error);
        if (active) setTransactions([]);
      });

    fetchBudgetCategories(currentUserId)
      .then((cats) => {
        if (!active) return;
        setBudgetCategories(cats);
      })
      .catch((error) => {
        console.error('Error fetching budget categories:', error);
        if (active) setBudgetCategories([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, periodConfig]);

  useEffect(() => {
    if (!currentUserId) return;
    const ctx = buildFinancialContext(currentUserId, transactions, budgetCategories);
    setContext(ctx);
  }, [transactions, budgetCategories, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    const unsubscribe = loadConversations(currentUserId).then((convs) => {
      if (!currentUserId) return;
      setConversations(convs);
    });
    return () => {
      unsubscribe.then(() => {});
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentConversationId || !currentUserId) return;

    const messagesRef = collection(db, 'chat_messages');
    const q = query(
      messagesRef,
      where('conversationId', '==', currentConversationId),
      where('userId', '==', currentUserId),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs: ChatMessage[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          msgs.push({
            id: docSnap.id,
            conversationId: data.conversationId || '',
            userId: data.userId || '',
            role: data.role || 'user',
            content: data.content || '',
            timestamp: (() => {
              const ts = data.timestamp;
              if (!ts) return new Date().toISOString();
              if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
              return String(ts);
            })(),
            metadata: data.metadata,
          });
        });
        setMessages(msgs);
      },
      (error) => {
        console.error('Error listening to messages:', error);
        handleFirestoreError(error, OperationType.LIST, 'chat_messages');
      }
    );

    return () => unsubscribe();
  }, [currentConversationId, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleCreateConversation = async () => {
    if (!currentUserId) {
      toast.error('Please sign in to start a conversation');
      return;
    }
    const conversation = await saveConversation({
      userId: currentUserId,
      title: 'New Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    });
    if (conversation) {
      setConversations((prev) => [conversation, ...prev]);
      setCurrentConversationId(conversation.id);
      setMessages([]);
      setChartData(null);
      setSuggestions([]);
      setInput('');
      inputRef.current?.focus();
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setCurrentConversationId(conversation.id);
    setChartData(null);
    setSuggestions([]);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    const success = await deleteConversation(conversationId);
    if (success) {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
        setMessages([]);
        setChartData(null);
        setSuggestions([]);
      }
      toast.success('Conversation deleted');
    } else {
      toast.error('Failed to delete conversation');
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !currentUserId || !currentConversationId || !context) return;

    const userMessage: ChatMessage = {
      id: '',
      conversationId: currentConversationId,
      userId: currentUserId,
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    const savedUserMessage = await saveMessage(userMessage);
    if (savedUserMessage) {
      setMessages((prev) => [...prev, savedUserMessage]);
    }

    setInput('');
    setIsTyping(true);
    setChartData(null);
    setSuggestions([]);

    await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 800));

    const response: ChatResponse = generateChatResponse(content, context);
    const assistantMessage: ChatMessage = {
      id: '',
      conversationId: currentConversationId,
      userId: currentUserId,
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      metadata: response.chartData ? { chartData: response.chartData } : undefined,
    };

    const savedAssistantMessage = await saveMessage(assistantMessage);
    if (savedAssistantMessage) {
      setMessages((prev) => [...prev, savedAssistantMessage]);
    }

    setIsTyping(false);
    setChartData(response.chartData || null);
    setSuggestions(response.suggestions || []);

    const conversation = conversations.find((c) => c.id === currentConversationId);
    const isDefaultTitle = !conversation?.title || conversation.title === 'New Chat';
    const derivedTitle = isDefaultTitle
      ? content.trim().slice(0, 50) + (content.trim().length > 50 ? '...' : '')
      : conversation.title;
    if (conversation) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConversationId
            ? {
                ...c,
                ...(isDefaultTitle ? { title: derivedTitle } : {}),
                updatedAt: new Date().toISOString(),
                lastMessageAt: new Date().toISOString(),
              }
            : c
        )
      );
      const patch: { lastMessageAt: string; title?: string } = { lastMessageAt: new Date().toISOString() };
      if (isDefaultTitle) patch.title = derivedTitle;
      await updateConversation(currentConversationId, patch);
    }
  };

  const handleQuickAction = (prompt: string) => {
    handleSendMessage(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  const renderChart = (data: any[]) => {
    if (!data || data.length === 0) return null;

    if (data[0]?.month !== undefined && data[0]?.amount !== undefined) {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="month"
              stroke="#94a3b8"
              fontSize={11}
              tickFormatter={(value) => format(new Date(value), 'MMM yyyy')}
            />
            <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f1219',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                color: '#f8fafc',
              }}
              formatter={(value: number) => [formatCurrency(value), 'Spending']}
            />
            <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (data[0]?.name !== undefined && data[0]?.amount !== undefined) {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={70}
              fill="#8884d8"
              dataKey="amount"
              nameKey="name"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f1219',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                color: '#f8fafc',
              }}
              formatter={(value: number) => [formatCurrency(value), 'Amount']}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  const renderMessageContent = (message: ChatMessage) => {
    const metadata = message.metadata as any;
    const hasChart = !!metadata?.chartData;

    return (
      <div className="space-y-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        {hasChart && renderChart(metadata.chartData)}
      </div>
    );
  };

  const formatMessageTime = (timestamp: string) => {
    const ts = timestamp as any;
    const date = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(timestamp);
    return format(date, 'h:mm a');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-indigo-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm font-bold tracking-wider uppercase text-indigo-300">Loading Chat</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[600px] bg-slate-950/50 rounded-2xl border border-slate-800 overflow-hidden">
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-slate-900/60 border-r border-slate-800 flex flex-col"
          >
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">Conversations</h3>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCreateConversation}
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {conversations.map((conversation) => (
                  <motion.div
                    key={conversation.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => handleSelectConversation(conversation)}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors group',
                      currentConversationId === conversation.id
                        ? 'bg-indigo-500/10 border border-indigo-500/30'
                        : 'bg-transparent border border-transparent hover:bg-slate-800/50 hover:border-slate-700'
                    )}
                  >
                    <MessageSquare className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate font-medium">{conversation.title}</p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(conversation.lastMessageAt), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => handleDeleteConversation(e, conversation.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                ))}
                {conversations.length === 0 && (
                  <div className="text-center py-8 text-slate-500">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No conversations yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-indigo-400"
          >
            {sidebarOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Bot className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">FinSight AI Assistant</h2>
              <p className="text-xs text-slate-500">Ask me anything about your finances</p>
            </div>
          </div>
          {currentConversationId && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {messages.length} messages
            </Badge>
          )}
        </div>

        {!currentConversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center max-w-md"
            >
              <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4">
                <Bot className="h-8 w-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Financial Assistant</h3>
              <p className="text-sm text-slate-400 mb-6">
                Get insights on your spending, budget advice, and personalized savings recommendations powered by your transaction data.
              </p>
              <Button onClick={handleCreateConversation} className="gap-2">
                <Plus className="h-4 w-4" />
                Start New Conversation
              </Button>
              <div className="mt-8 grid grid-cols-2 gap-3">
                {QUICK_ACTIONS.slice(0, 4).map((action) => (
                  <Card
                    key={action.label}
                    className="bg-slate-900/60 border-slate-800 cursor-pointer hover:border-indigo-500/30 transition-colors"
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <action.icon className="h-4 w-4 text-indigo-400" />
                      </div>
                      <span className="text-sm font-medium text-slate-300">{action.label}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                <AnimatePresence mode="popLayout">
                  {messages.map((message, index) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.2, delay: index === messages.length - 1 ? 0.1 : 0 }}
                      className={cn(
                        'flex gap-3',
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.role === 'assistant' && (
                        <Avatar size="sm" className="shrink-0 mt-1">
                          <AvatarFallback className="bg-indigo-500/10 text-indigo-400">
                            <Bot className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <motion.div
                        whileHover={{ scale: 1.005 }}
                        className={cn(
                          'max-w-[80%] rounded-xl px-4 py-3',
                          message.role === 'user'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 border border-slate-700 text-slate-100'
                        )}
                      >
                        {renderMessageContent(message)}
                        <p
                          className={cn(
                            'text-xs mt-2 opacity-60',
                            message.role === 'user' ? 'text-right' : 'text-left'
                          )}
                        >
                          {formatMessageTime(message.timestamp)}
                        </p>
                      </motion.div>
                      {message.role === 'user' && (
                        <Avatar size="sm" className="shrink-0 mt-1">
                          <AvatarFallback className="bg-slate-700 text-slate-300">
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 justify-start"
                  >
                    <Avatar size="sm" className="shrink-0 mt-1">
                      <AvatarFallback className="bg-indigo-500/10 text-indigo-400">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                        <span className="text-sm text-slate-400 ml-2">Analyzing your finances...</span>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-slate-800">
              <div className="max-w-3xl mx-auto space-y-3">
                {suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap gap-2"
                  >
                    {suggestions.map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendMessage(suggestion)}
                        className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-indigo-400"
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </motion.div>
                )}

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {QUICK_ACTIONS.map((action) => (
                    <Button
                      key={action.label}
                      variant="secondary"
                      size="sm"
                      onClick={() => handleQuickAction(action.prompt)}
                      className="gap-1.5 whitespace-nowrap bg-slate-800 border-slate-700 text-slate-300 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30"
                    >
                      <action.icon className="h-3.5 w-3.5" />
                      {action.label}
                    </Button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your finances..."
                    className="flex-1 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 focus:border-indigo-500/50"
                    disabled={isTyping}
                  />
                  <Button
                    onClick={() => handleSendMessage(input)}
                    disabled={!input.trim() || isTyping}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
                  >
                    {isTyping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
