import { useCallback, useMemo, useRef, useState } from "react";
import {
  AgentScopeRuntimeWebUI,
  type IAgentScopeRuntimeWebUIOptions,
  type IAgentScopeRuntimeWebUIRef,
} from "@agentscope-ai/chat";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "../../../../api/config";
import { buildAuthHeaders } from "../../../../api/authHeaders";
import { useTheme } from "../../../../contexts/ThemeContext";
import { getDefaultConfig } from "../../../Chat/OptionsPanel/defaultConfig";
import styles from "../index.module.less";

interface ChatTestPanelProps {
  skillName: string;
}

// Exact copies of Chat page helper functions
function messageRequestsHistoryClear(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const metadata = (message as Record<string, unknown>).metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const meta = metadata as Record<string, unknown>;
  if (meta.clear_history === true) return true;
  const nested = meta.metadata;
  return (
    !!nested &&
    typeof nested === "object" &&
    (nested as Record<string, unknown>).clear_history === true
  );
}

function payloadRequestsHistoryClear(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (record.object === "message") {
    candidates.push(record);
  }
  if (record.object === "response" && Array.isArray(record.output)) {
    candidates.push(...record.output);
  }
  return candidates.some(messageRequestsHistoryClear);
}

function payloadCompletesResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  return record.object === "response" && record.status === "completed";
}

// Render slash-command suggestion label (same pattern as Chat page)
function renderSuggestionLabel(command: string, description: string) {
  return (
    <div className={styles.suggestionLabel}>
      <span className={styles.suggestionCommand}>{command}</span>
      <span className={styles.suggestionDescription}>{description}</span>
    </div>
  );
}

export function ChatTestPanel({ skillName }: ChatTestPanelProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const chatRef = useRef<IAgentScopeRuntimeWebUIRef>(null);
  const pendingClearHistoryRef = useRef(false);
  const [sessionId] = useState(
    () => `skill-debug-${skillName}-${Date.now()}`,
  );

  const scheduleHistoryClear = useCallback(() => {
    queueMicrotask(() => {
      if (!pendingClearHistoryRef.current) return;
      pendingClearHistoryRef.current = false;
      chatRef.current?.messages.removeAllMessages();
    });
  }, []);

  const customFetch = useCallback(
    async (data: {
      input?: Array<Record<string, unknown>>;
      biz_params?: Record<string, unknown>;
      signal?: AbortSignal;
    }): Promise<Response> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      };

      // Mirror Chat page: only send the last message so the backend can
      // recognise slash-commands (e.g. "clear") without them being buried
      // in the full message history.
      const { input = [], biz_params } = data;
      const lastInput = input.slice(-1);

      const response = await fetch(getApiUrl("/console/chat"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          input: lastInput,
          session_id: sessionId,
          user_id: "skill-debugger",
          channel: "console",
          stream: true,
          ...(biz_params || {}),
        }),
        signal: data.signal,
      });

      return response;
    },
    [sessionId],
  );

  const options = useMemo(() => {
    const i18nConfig = getDefaultConfig(t);
    return {
      ...i18nConfig,
      theme: {
        colorPrimary: "#FF7F16",
        darkMode: isDark,
        prefix: "qwenpaw",
        leftHeader: { logo: "", title: "" },
        rightHeader: null,
      },
      welcome: {
        greeting: t("skillDebugger.chatTest"),
        description: t("skillDebugger.chatEmptyHint"),
        avatar: "",
        prompts: [],
      },
      sender: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(i18nConfig as any)?.sender,
        allowSpeech: false,
        attachments: false,
        placeholder: t("skillDebugger.chatPlaceholder"),
        // Slash-command suggestions — same as Chat page
        suggestions: [
          {
            label: renderSuggestionLabel("/clear", t("chat.commands.clear.description")),
            value: "clear",
          },
        ],
      },
      session: {
        multiple: false,
        hideBuiltInSessionList: true,
      },
      api: {
        baseURL: "",
        token: "",
        fetch: customFetch,
        responseParser: (chunk: string) => {
          const payload = JSON.parse(chunk) as Record<string, unknown>;

          if (payloadRequestsHistoryClear(payload)) {
            pendingClearHistoryRef.current = true;
            if (payloadCompletesResponse(payload)) {
              scheduleHistoryClear();
            }
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return payload as any;
        },
      },
    } as unknown as IAgentScopeRuntimeWebUIOptions;
  }, [customFetch, t, isDark, scheduleHistoryClear]);


  return (
    <div className={styles.chatPanel}>
      <div className={styles.chatPanelBody}>
        <AgentScopeRuntimeWebUI ref={chatRef} options={options} />
      </div>
    </div>
  );
}
