export interface Agent {
  name: string;
  has_history: boolean;
  last_active: string | null;
}

export interface Skill {
  name: string;
  description: string;
  user_invocable: boolean;
  always_enabled: boolean;
}

export interface ToolCallInfo {
  name: string;
  input: Record<string, unknown>;
  id: string;
  output?: string;
  is_error?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status?: "streaming" | "complete";
  toolCalls?: ToolCallInfo[];
}

export interface ModelOption {
  value: string;
  label: string;
}

export interface ServerFrame {
  type: string;
  text?: string;
  message_id?: string;
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
  output?: string;
  is_error?: boolean;
  message?: string;
  status?: string;
  agent?: string;
  skills?: string[];
  input_tokens?: number;
  output_tokens?: number;
}
