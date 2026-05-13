import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage, ServerFrame, ToolCallInfo } from "../lib/types";

export function useWebSocket(agentName: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const currentMessageRef = useRef<string>("");

  useEffect(() => {
    if (!agentName) return;

    setMessages([]);
    setIsConnected(false);
    setIsGenerating(false);
    currentMessageRef.current = "";

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws?agent=${agentName}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let closed = false;

    ws.onopen = () => {
      if (!closed) setIsConnected(true);
    };
    ws.onclose = () => {
      closed = true;
      setIsConnected(false);
      setIsGenerating(false);
    };
    ws.onerror = () => {
      closed = true;
      setIsConnected(false);
      setIsGenerating(false);
    };

    ws.onmessage = (event) => {
      if (closed) return;
      let frame: ServerFrame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (frame.type) {
        case "history": {
          const history = (frame as any).messages as any[];
          if (history?.length) {
            setMessages(
              history.map((m: any) => ({
                id: String(m.id),
                role: m.role,
                content: m.content,
                timestamp: new Date(m.created_at).getTime(),
                status: "complete" as const,
                toolCalls: m.tool_calls || [],
              }))
            );
          }
          break;
        }

        case "status":
          if (frame.status === "generating") {
            setIsGenerating(true);
            currentMessageRef.current = "";
          } else if (frame.status === "context_cleared") {
            setMessages([]);
          }
          break;

        case "text_delta":
          currentMessageRef.current += frame.text || "";
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.id === frame.message_id && last?.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: currentMessageRef.current },
              ];
            }
            return [
              ...prev,
              {
                id: frame.message_id!,
                role: "assistant",
                content: currentMessageRef.current,
                timestamp: Date.now(),
                status: "streaming",
                toolCalls: [],
              },
            ];
          });
          break;

        case "tool_call":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              const tc: ToolCallInfo = {
                name: frame.name!,
                input: frame.input || {},
                id: frame.id!,
              };
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  toolCalls: [...(last.toolCalls || []), tc],
                },
              ];
            }
            return prev;
          });
          break;

        case "tool_result":
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.toolCalls) {
              const updated = last.toolCalls.map((tc) =>
                tc.id === frame.id
                  ? { ...tc, output: frame.output, is_error: frame.is_error }
                  : tc
              );
              return [...prev.slice(0, -1), { ...last, toolCalls: updated }];
            }
            return prev;
          });
          break;

        case "complete":
          setIsGenerating(false);
          currentMessageRef.current = "";
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [
                ...prev.slice(0, -1),
                { ...last, content: frame.text || last.content, status: "complete" },
              ];
            }
            return prev;
          });
          break;

        case "error":
          setIsGenerating(false);
          currentMessageRef.current = "";
          break;
      }
    };

    return () => {
      closed = true;
      ws.close();
      wsRef.current = null;
    };
  }, [agentName]);

  const sendMessage = useCallback(
    (content: string, model?: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const messageId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          role: "user",
          content,
          timestamp: Date.now(),
          status: "complete",
        },
      ]);

      const frame: Record<string, unknown> = {
        type: "user_message",
        content,
        message_id: messageId,
      };
      if (model) frame.model = model;

      wsRef.current.send(JSON.stringify(frame));
    },
    []
  );

  const stopQuery = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "stop_query" }));
  }, []);

  const clearContext = useCallback(() => {
    wsRef.current?.send(
      JSON.stringify({ type: "system_command", command: "clear_context" })
    );
  }, []);

  return { messages, isConnected, isGenerating, sendMessage, stopQuery, clearContext };
}
