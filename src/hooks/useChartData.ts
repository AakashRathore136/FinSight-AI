import { useState, useCallback } from 'react';

export interface ChartData {
  type: string;
  data: unknown;
  options?: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chartData?: ChartData | null;
  timestamp: number;
}

/**
 * useChartData
 *
 * Manages the association between chat messages and their chart data.
 * Each assistant message carries its own chartData snapshot so that
 * scrolling through history renders the correct chart for each message
 * rather than always showing the most recently received chart.
 *
 * Resolves issue #200: chart display bugs when scrolling chat history.
 */
export function useChartData() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingChart, setPendingChart] = useState<ChartData | null>(null);

  const addUserMessage = useCallback((content: string): ChatMessage => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      chartData: null,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  const addAssistantMessage = useCallback(
    (content: string, chartData?: ChartData | null): ChatMessage => {
      // Use the explicitly provided chartData, or fall back to any
      // chart that arrived via setCurrentChart during streaming.
      const chart = chartData !== undefined ? chartData : pendingChart;
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        chartData: chart,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, msg]);
      // Clear the pending chart after it has been consumed.
      setPendingChart(null);
      return msg;
    },
    [pendingChart],
  );

  /**
   * Call this when a chart payload arrives during streaming, before the
   * assistant message has been finalised.  It will be attached to the
   * next assistant message created via addAssistantMessage().
   */
  const setCurrentChart = useCallback((chart: ChartData | null) => {
    setPendingChart(chart);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingChart(null);
  }, []);

  return {
    messages,
    addUserMessage,
    addAssistantMessage,
    setCurrentChart,
    clearMessages,
  };
}
