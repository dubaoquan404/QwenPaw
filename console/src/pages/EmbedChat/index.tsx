/**
 * EmbedChat — standalone chat page for iframe embedding.
 *
 * This is a fully independent implementation that does NOT depend on Chat/index.tsx.
 *
 * URL format:
 *   /embed/chat?agent=<agent_id>&token=<api_token>&dark=1
 *
 * The page has no sidebar or header; it renders only the chat interface.
 * If auth is enabled, the caller must pass a valid ?token= parameter.
 */
import {
  AgentScopeRuntimeWebUI,
  IAgentScopeRuntimeWebUIOptions,
  type IAgentScopeRuntimeWebUIRef,
  useChatAnywhereInput,
} from "@agentscope-ai/chat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Spin, Result, Tooltip } from "antd";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SparkCopyLine, SparkAttachmentLine } from "@agentscope-ai/icons";
import { IconButton } from "@agentscope-ai/design";
import { usePlugins } from "../../plugins/PluginContext";
import { setAuthToken, getApiToken, getApiUrl } from "../../api/config";
import { buildAuthHeaders } from "../../api/authHeaders";
import { chatApi } from "../../api/modules/chat";
import { agentsApi } from "../../api/modules/agents";
import { providerApi } from "../../api/modules/provider";
import type { ProviderInfo, ModelInfo } from "../../api/types";
import { useTheme } from "../../contexts/ThemeContext";
import { useAgentStore } from "../../stores/agentStore";
import { useAppMessage } from "../../hooks/useAppMessage";
import sessionApi from "../Chat/sessionApi";
import defaultConfig, {
  getDefaultConfig,
} from "./OptionsPanel/defaultConfig";
import {
  toDisplayUrl,
  copyText,
  extractCopyableText,
  buildModelError,
  normalizeContentUrls,
  extractUserMessageText,
  extractTextFromMessage,
  setTextareaValue,
  type CopyableResponse,
  type RuntimeLoadingBridgeApi,
} from "./utils";
import styles from "./index.module.less";
import EmbedChatSessionSidebar from "./components/EmbedChatSessionSidebar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHAT_ATTACHMENT_MAX_MB = 10;
const DEFAULT_USER_ID = "default";
const DEFAULT_CHANNEL = "console";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthState = "loading" | "ok" | "error";

interface SessionInfo {
  session_id?: string;
  user_id?: string;
  channel?: string;
}

interface CustomWindow extends Window {
  currentSessionId?: string;
  currentUserId?: string;
  currentChannel?: string;
}

declare const window: CustomWindow;

interface CommandSuggestion {
  command: string;
  value: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function renderSuggestionLabel(command: string, description: string) {
  return (
    <div className={styles.suggestionLabel}>
      <span className={styles.suggestionCommand}>{command}</span>
      <span className={styles.suggestionDescription}>{description}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom hooks
// ---------------------------------------------------------------------------

/** Handle IME composition events to prevent premature Enter key submission. */
function useIMEComposition(isChatActive: () => boolean) {
  const isComposingRef = useRef(false);

  useEffect(() => {
    const handleCompositionStart = () => {
      if (!isChatActive()) return;
      isComposingRef.current = true;
    };

    const handleCompositionEnd = () => {
      if (!isChatActive()) return;
      setTimeout(() => {
        isComposingRef.current = false;
      }, 50);
    };

    const suppressImeEnter = (e: KeyboardEvent) => {
      if (!isChatActive()) return;
      const target = e.target as HTMLElement;
      if (target?.tagName === "TEXTAREA" && e.key === "Enter" && !e.shiftKey) {
        if (isComposingRef.current || (e as any).isComposing) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();
          return false;
        }
      }
    };

    document.addEventListener("compositionstart", handleCompositionStart, true);
    document.addEventListener("compositionend", handleCompositionEnd, true);
    document.addEventListener("keydown", suppressImeEnter, true);
    document.addEventListener("keypress", suppressImeEnter, true);

    return () => {
      document.removeEventListener(
        "compositionstart",
        handleCompositionStart,
        true,
      );
      document.removeEventListener(
        "compositionend",
        handleCompositionEnd,
        true,
      );
      document.removeEventListener("keydown", suppressImeEnter, true);
      document.removeEventListener("keypress", suppressImeEnter, true);
    };
  }, [isChatActive]);

  return isComposingRef;
}

/** Fetch and track multimodal capabilities for the active model. */
function useMultimodalCapabilities(
  refreshKey: number,
  selectedAgent: string,
) {
  const [multimodalCaps, setMultimodalCaps] = useState<{
    supportsMultimodal: boolean;
    supportsImage: boolean;
    supportsVideo: boolean;
  }>({ supportsMultimodal: false, supportsImage: false, supportsVideo: false });

  const fetchMultimodalCaps = useCallback(async () => {
    try {
      const [providers, activeModels] = await Promise.all([
        providerApi.listProviders(),
        providerApi.getActiveModels({
          scope: "effective",
          agent_id: selectedAgent,
        }),
      ]);
      const activeProviderId = activeModels?.active_llm?.provider_id;
      const activeModelId = activeModels?.active_llm?.model;
      if (!activeProviderId || !activeModelId) {
        setMultimodalCaps({
          supportsMultimodal: false,
          supportsImage: false,
          supportsVideo: false,
        });
        return;
      }
      const provider = (providers as ProviderInfo[]).find(
        (p) => p.id === activeProviderId,
      );
      if (!provider) {
        setMultimodalCaps({
          supportsMultimodal: false,
          supportsImage: false,
          supportsVideo: false,
        });
        return;
      }
      const allModels: ModelInfo[] = [
        ...(provider.models ?? []),
        ...(provider.extra_models ?? []),
      ];
      const model = allModels.find((m) => m.id === activeModelId);
      setMultimodalCaps({
        supportsMultimodal: model?.supports_multimodal ?? false,
        supportsImage: model?.supports_image ?? false,
        supportsVideo: model?.supports_video ?? false,
      });
    } catch {
      setMultimodalCaps({
        supportsMultimodal: false,
        supportsImage: false,
        supportsVideo: false,
      });
    }
  }, [selectedAgent]);

  useEffect(() => {
    fetchMultimodalCaps();
  }, [fetchMultimodalCaps, refreshKey]);

  useEffect(() => {
    const handler = () => {
      fetchMultimodalCaps();
    };
    window.addEventListener("model-switched", handler);
    return () => window.removeEventListener("model-switched", handler);
  }, [fetchMultimodalCaps]);

  return multimodalCaps;
}

function useMessageHistoryNavigation(
  chatRef: React.RefObject<IAgentScopeRuntimeWebUIRef | null>,
  isChatActive: () => boolean,
  isComposingRef: React.RefObject<boolean>,
) {
  const historyIndexRef = useRef<number>(-1);
  const draftRef = useRef<string>("");
  const userMessagesCacheRef = useRef<string[]>([]);
  const cachedMessageCountRef = useRef<number>(0);

  const getUserMessagesWithText = useCallback((): string[] => {
    if (!chatRef.current?.messages?.getMessages) return [];
    const allMessages = chatRef.current.messages.getMessages();
    if (!Array.isArray(allMessages)) return [];
    const currentCount = allMessages.length;
    if (
      userMessagesCacheRef.current.length > 0 &&
      cachedMessageCountRef.current === currentCount
    ) {
      return userMessagesCacheRef.current;
    }
    const userMessages = allMessages
      .filter((msg) => msg.role === "user")
      .map((msg) => extractTextFromMessage(msg))
      .filter((text) => text.trim().length > 0);
    userMessagesCacheRef.current = userMessages;
    cachedMessageCountRef.current = currentCount;
    return userMessages;
  }, [chatRef]);

  interface MessageResult {
    index: number;
    text: string;
  }

  const findMessageInDirection = (
    messages: string[],
    startIndex: number,
    direction: 1 | -1,
  ): MessageResult | null => {
    const MAX_LOOKUP = 100;
    let lookupIndex = startIndex;
    let steps = 0;
    while (
      lookupIndex >= 0 &&
      lookupIndex < messages.length &&
      steps < MAX_LOOKUP
    ) {
      const messageText = messages[messages.length - 1 - lookupIndex];
      if (messageText) return { index: lookupIndex, text: messageText };
      lookupIndex += direction;
      steps += 1;
    }
    return null;
  };

  const isSuggestionPopupOpen = (textarea: HTMLTextAreaElement): boolean =>
    textarea.value.startsWith("/");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isChatActive()) return;
      const target = e.target as HTMLElement;
      const isChatSender =
        target?.tagName === "TEXTAREA" &&
        target?.closest('[class*="sender"]') !== null;
      if (!isChatSender) return;
      if (isComposingRef.current || (e as any).isComposing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const textarea = target as HTMLTextAreaElement;
      const hasSelection = textarea.selectionStart !== textarea.selectionEnd;
      if (hasSelection) return;
      const userMessages = getUserMessagesWithText();

      if (e.key === "ArrowUp") {
        if (isSuggestionPopupOpen(textarea)) return;
        const cursorPosition = textarea.selectionStart || 0;
        const textBeforeCursor = textarea.value.substring(0, cursorPosition);
        const lineBreaks = textBeforeCursor.split("\n").length - 1;
        if (lineBreaks > 0) return;
        if (userMessages.length === 0) return;
        if (historyIndexRef.current === -1) draftRef.current = textarea.value;
        const startIndex = historyIndexRef.current + 1;
        const messageText = findMessageInDirection(userMessages, startIndex, 1);
        if (messageText) {
          e.preventDefault();
          historyIndexRef.current = messageText.index;
          setTextareaValue(textarea, messageText.text);
        }
      } else if (e.key === "ArrowDown") {
        if (historyIndexRef.current < 0) return;
        const cursorPosition = textarea.selectionStart || 0;
        const textAfterCursor = textarea.value.substring(cursorPosition);
        if (textAfterCursor.includes("\n")) return;
        const startIndex = historyIndexRef.current - 1;
        const messageText = findMessageInDirection(
          userMessages,
          startIndex,
          -1,
        );
        if (messageText) {
          e.preventDefault();
          historyIndexRef.current = messageText.index;
          setTextareaValue(textarea, messageText.text);
        } else {
          e.preventDefault();
          historyIndexRef.current = -1;
          setTextareaValue(textarea, draftRef.current);
        }
      }
    };

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isChatSender =
        target?.tagName === "TEXTAREA" &&
        target?.closest('[class*="sender"]') !== null;
      if (isChatSender) {
        historyIndexRef.current = -1;
        draftRef.current = "";
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocus, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocus, true);
    };
  }, [isChatActive, isComposingRef, getUserMessagesWithText]);
}

function RuntimeLoadingBridge({
  bridgeRef,
}: {
  bridgeRef: { current: RuntimeLoadingBridgeApi | null };
}) {
  const { setLoading, getLoading } = useChatAnywhereInput(
    (value) =>
      ({
        setLoading: value.setLoading,
        getLoading: value.getLoading,
      }) as RuntimeLoadingBridgeApi,
  );

  useEffect(() => {
    if (!setLoading || !getLoading) {
      bridgeRef.current = null;
      return;
    }
    bridgeRef.current = { setLoading, getLoading };
    return () => {
      if (bridgeRef.current?.setLoading === setLoading) {
        bridgeRef.current = null;
      }
    };
  }, [getLoading, setLoading, bridgeRef]);

  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EmbedChatPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { setSelectedAgent, setAgents, selectedAgent, agents } =
    useAgentStore();
  const { isDark, setThemeMode } = useTheme();
  const { message } = useAppMessage();
  const { toolRenderConfig } = usePlugins();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [refreshKey] = useState(0);
  const chatRef = useRef<IAgentScopeRuntimeWebUIRef>(null);
  const runtimeLoadingBridgeRef = useRef<RuntimeLoadingBridgeApi | null>(null);
  const pendingClearHistoryRef = useRef(false);

  // User ID received from parent page via postMessage
  const [postMessageUserId, setPostMessageUserId] = useState<string | null>(null);
  const prevPostMessageUserIdRef = useRef<string | null>(null);

  const agentId = searchParams.get("agent") || "default";
  const tokenParam = searchParams.get("token");
  const darkParam = searchParams.get("dark") === "1";
  const showHistory = searchParams.get("history") === "1";

  // Embed page is always "active"
  const isChatActive = useCallback(() => true, []);

  const isComposingRef = useIMEComposition(isChatActive);
  const multimodalCaps = useMultimodalCapabilities(refreshKey, selectedAgent);
  useMessageHistoryNavigation(chatRef, isChatActive, isComposingRef);

  // Apply dark/light mode from URL param, always overriding localStorage preference
  useEffect(() => {
    setThemeMode(darkParam ? "dark" : "light");
  }, [darkParam, setThemeMode]);

  // Load agents list so welcome message shows correct agent name/description
  useEffect(() => {
    agentsApi
      .listAgents()
      .then((data) => {
        const sorted = [...data.agents].sort((a, b) => {
          if (a.enabled === b.enabled) return 0;
          return a.enabled ? -1 : 1;
        });
        setAgents(sorted);
      })
      .catch(() => {});
  }, [setAgents]);

  // Auth verification + agent selection
  useEffect(() => {
    if (tokenParam) setAuthToken(tokenParam);
    setSelectedAgent(agentId);

    (async () => {
      try {
        const res = await fetch(getApiUrl("/auth/status"));
        if (!res.ok) {
          setAuthState("ok");
          return;
        }
        const data = (await res.json()) as { enabled: boolean };
        if (!data.enabled) {
          setAuthState("ok");
          return;
        }

        const token = getApiToken();
        if (!token) {
          setErrorMsg(t("embed.noToken"));
          setAuthState("error");
          return;
        }

        const verifyRes = await fetch(getApiUrl("/auth/verify"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (verifyRes.ok) {
          setAuthState("ok");
        } else {
          setErrorMsg(t("embed.invalidToken"));
          setAuthState("error");
        }
      } catch {
        setAuthState("ok");
      }
    })();
  }, [agentId, tokenParam, setSelectedAgent, t]);

  // Force a fresh session on every page load, but only when history is NOT
  // shown. When showHistory=true the session sidebar needs to display existing
  // chats, so we must not wipe the list on initial load.
  useEffect(() => {
    if (!showHistory) {
      sessionApi.forceNewSession = true;
    }
  }, [showHistory]);

  // Listen for user ID from parent page via postMessage.
  // After registering, notify the parent that EmbedChat is ready so it can
  // (re-)send the userId — this avoids the race where the parent's onload
  // fires before React has mounted and registered this listener.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.debug("[EmbedChat] message event received, origin:", event.origin, "data:", event.data);
      if (!event.data || typeof event.data !== "object") {
        console.debug("[EmbedChat] message ignored: data is not an object");
        return;
      }
      const { type, userId } = event.data as Record<string, unknown>;
      console.debug("[EmbedChat] message parsed: type=", type, "userId=", userId);
      if (type === "SET_USER_ID" && typeof userId === "string") {
        const sanitized = userId.trim().slice(0, 256);
        if (sanitized) {
          console.debug("[EmbedChat] postMessage SET_USER_ID received:", sanitized);
          // Defer state update out of the message handler to avoid
          // "[Violation] 'message' handler took Nms" performance warnings.
          setTimeout(() => setPostMessageUserId(sanitized), 0);
        } else {
          console.debug("[EmbedChat] postMessage SET_USER_ID received but value is empty after sanitize, raw:", userId);
        }
      } else {
        console.debug("[EmbedChat] message ignored: type mismatch or userId not string. Expected type=SET_USER_ID, got type=", type, typeof userId);
      }
    };
    window.addEventListener("message", handleMessage);

    // Signal to the parent page that the listener is now registered and
    // ready to receive SET_USER_ID.
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "EMBED_CHAT_READY" }, "*");
        console.debug("[EmbedChat] sent EMBED_CHAT_READY to parent");
      }
    } catch {
      // cross-origin parent may block postMessage — safe to ignore
    }

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // When postMessage user ID changes, start a fresh isolated session
  useEffect(() => {
    if (
      postMessageUserId !== null &&
      postMessageUserId !== prevPostMessageUserIdRef.current
    ) {
      console.debug(
        "[EmbedChat] postMessageUserId changed:",
        prevPostMessageUserIdRef.current, "→", postMessageUserId,
        "| starting fresh session with embedUserId prefix",
      );
      prevPostMessageUserIdRef.current = postMessageUserId;
      // When history is disabled, force a clean slate so the new user
      // doesn't see any leftover messages from the previous user.
      // When history is enabled, let the session sidebar load the new
      // user's existing chats instead of wiping the list.
      if (!showHistory) {
        sessionApi.forceNewSession = true;
        chatRef.current?.messages.removeAllMessages();
      }
    }
  }, [postMessageUserId, showHistory]);

  // Clear embedUserId when this page unmounts so it doesn't bleed into
  // other pages (e.g. regular Chat) if navigation ever occurs.
  useEffect(() => {
    return () => {
      sessionApi.embedUserId = null;
    };
  }, []);

  const scheduleHistoryClear = useCallback(() => {
    queueMicrotask(() => {
      if (!pendingClearHistoryRef.current) return;
      pendingClearHistoryRef.current = false;
      chatRef.current?.messages.removeAllMessages();
    });
  }, []);

  const copyResponse = useCallback(
    async (response: CopyableResponse) => {
      try {
        await copyText(extractCopyableText(response));
        message.success(t("common.copied"));
      } catch {
        message.error(t("common.copyFailed"));
      }
    },
    [t, message],
  );

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

      try {
        const activeModels = await providerApi.getActiveModels({
          scope: "effective",
          agent_id: selectedAgent,
        });
        if (
          !activeModels?.active_llm?.provider_id ||
          !activeModels?.active_llm?.model
        ) {
          return buildModelError();
        }
      } catch {
        return buildModelError();
      }

      const { input = [], biz_params } = data;
      const session: SessionInfo = input[input.length - 1]?.session || {};
      const lastInput = input.slice(-1);
      const lastMsg = lastInput[0];
      const rewrittenInput =
        lastMsg?.content && Array.isArray(lastMsg.content)
          ? [
              {
                ...lastMsg,
                content: lastMsg.content.map(normalizeContentUrls),
              },
            ]
          : lastInput;

      const requestBody = {
        input: rewrittenInput,
        session_id: window.currentSessionId || session?.session_id || "",
        user_id: postMessageUserId || window.currentUserId || session?.user_id || DEFAULT_USER_ID,
        channel: window.currentChannel || session?.channel || DEFAULT_CHANNEL,
        stream: true,
        ...biz_params,
      };

      const backendChatId =
        sessionApi.getRealIdForSession(requestBody.session_id) ??
        requestBody.session_id;
      if (backendChatId) {
        const userText = rewrittenInput
          .filter((m: any) => m.role === "user")
          .map(extractUserMessageText)
          .join("\n")
          .trim();
        if (userText) sessionApi.setLastUserMessage(backendChatId, userText);
      }

      return fetch(getApiUrl("/console/chat"), {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: data.signal,
      });
    },
    [selectedAgent, postMessageUserId],
  );

  const handleFileUpload = useCallback(
    async (options: {
      file: File;
      onSuccess: (body: { url?: string; thumbUrl?: string }) => void;
      onError?: (e: Error) => void;
      onProgress?: (e: { percent?: number }) => void;
    }) => {
      const { file, onSuccess, onError, onProgress } = options;
      try {
        if (!multimodalCaps.supportsMultimodal) {
          message.warning(t("chat.attachments.multimodalWarning"));
        } else if (
          multimodalCaps.supportsImage &&
          !multimodalCaps.supportsVideo &&
          !file.type.startsWith("image/")
        ) {
          message.warning(t("chat.attachments.imageOnlyWarning"));
        }
        const sizeMb = file.size / 1024 / 1024;
        if (sizeMb >= CHAT_ATTACHMENT_MAX_MB) {
          message.error(
            t("chat.attachments.fileSizeExceeded", {
              limit: CHAT_ATTACHMENT_MAX_MB,
              size: sizeMb.toFixed(2),
            }),
          );
          onError?.(new Error(`File size exceeds ${CHAT_ATTACHMENT_MAX_MB}MB`));
          return;
        }
        const res = await chatApi.uploadFile(file);
        onProgress?.({ percent: 100 });
        onSuccess({ url: chatApi.filePreviewUrl(res.url) });
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    },
    [multimodalCaps, t, message],
  );

  const options = useMemo(() => {
    const i18nConfig = getDefaultConfig(t);
    const commandSuggestions: CommandSuggestion[] = [
      {
        command: "/clear",
        value: "clear",
        description: t("chat.commands.clear.description"),
      },
      {
        command: "/compact",
        value: "compact",
        description: t("chat.commands.compact.description"),
      },
      {
        command: "/mission",
        value: "mission",
        description: t("chat.commands.mission.description"),
      },
      {
        command: "/skills",
        value: "skills",
        description: t("chat.commands.skills.description"),
      },
    ];

    const handleBeforeSubmit = async () => {
      if (isComposingRef.current) return false;
      return true;
    };

    return {
      ...i18nConfig,
      theme: {
        ...defaultConfig.theme,
        darkMode: isDark,
        leftHeader: { ...defaultConfig.theme.leftHeader },
        rightHeader: (
          <>
            <RuntimeLoadingBridge bridgeRef={runtimeLoadingBridgeRef} />
            {showHistory && <EmbedChatSessionSidebar />}
          </>
        ),
      },
      welcome: {
        ...i18nConfig.welcome,
        nick:
          agents.find((a) => a.id === selectedAgent)?.name || "QwenPaw",
        greeting:
          agents.find((a) => a.id === selectedAgent)?.name ||
          i18nConfig.welcome.greeting,
        description: (() => {
          const raw =
            agents.find((a) => a.id === selectedAgent)?.description ||
            i18nConfig.welcome.description;
          const desc = raw.replace(/ - (?=\*{0,2}\S)/g, "\n- ");
          return (
            <div className={styles.welcomeDescription}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{desc}</ReactMarkdown>
            </div>
          );
        })(),
        avatar: "",
      },
      sender: {
        ...(i18nConfig as any)?.sender,
        beforeSubmit: handleBeforeSubmit,
        allowSpeech: false,
        attachments: {
          trigger: function (props: any) {
            const tooltipKey = multimodalCaps.supportsMultimodal
              ? multimodalCaps.supportsImage && !multimodalCaps.supportsVideo
                ? "chat.attachments.tooltipImageOnly"
                : "chat.attachments.tooltip"
              : "chat.attachments.tooltipNoMultimodal";
            return (
              <Tooltip title={t(tooltipKey, { limit: CHAT_ATTACHMENT_MAX_MB })}>
                <IconButton
                  disabled={props?.disabled}
                  icon={<SparkAttachmentLine />}
                  bordered={false}
                />
              </Tooltip>
            );
          },
          customRequest: handleFileUpload,
        },
        placeholder: t("chat.inputPlaceholder"),
        suggestions: commandSuggestions.map((item) => ({
          label: renderSuggestionLabel(item.command, item.description),
          value: item.value,
        })),
      },
      session: {
        multiple: showHistory,
        ...(showHistory && { hideBuiltInSessionList: true }),
        api: sessionApi,
      },
      api: {
        ...defaultConfig.api,
        fetch: customFetch,
        responseParser: (chunk: string) => {
          const payload = JSON.parse(chunk) as Record<string, unknown>;

          const messageRequestsHistoryClear = (msg: unknown): boolean => {
            if (!msg || typeof msg !== "object") return false;
            const metadata = (msg as Record<string, unknown>).metadata;
            if (!metadata || typeof metadata !== "object") return false;
            const meta = metadata as Record<string, unknown>;
            if (meta.clear_history === true) return true;
            const nested = meta.metadata;
            return (
              !!nested &&
              typeof nested === "object" &&
              (nested as Record<string, unknown>).clear_history === true
            );
          };

          const payloadRequestsHistoryClear = (p: unknown): boolean => {
            if (!p || typeof p !== "object") return false;
            const record = p as Record<string, unknown>;
            const candidates: unknown[] = [];
            if (record.object === "message") candidates.push(record);
            if (record.object === "response" && Array.isArray(record.output))
              candidates.push(...record.output);
            return candidates.some(messageRequestsHistoryClear);
          };

          if (payloadRequestsHistoryClear(payload)) {
            pendingClearHistoryRef.current = true;
            if (
              payload.object === "response" &&
              payload.status === "completed"
            ) {
              scheduleHistoryClear();
            }
          }
          return payload as any;
        },
        replaceMediaURL: (url: string) => toDisplayUrl(url),
        cancel(data: { session_id: string }) {
          const chatId =
            sessionApi.getRealIdForSession(data.session_id) ?? data.session_id;
          if (chatId) chatApi.stopChat(chatId).catch(() => {});
        },
        async reconnect(data: { session_id: string; signal?: AbortSignal }) {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...buildAuthHeaders(),
          };
          return fetch(getApiUrl("/console/chat"), {
            method: "POST",
            headers,
            body: JSON.stringify({
              reconnect: true,
              session_id: window.currentSessionId || data.session_id,
              user_id: postMessageUserId || window.currentUserId || DEFAULT_USER_ID,
              channel: window.currentChannel || DEFAULT_CHANNEL,
            }),
            signal: data.signal,
          });
        },
      },
      customToolRenderConfig:
        Object.keys(toolRenderConfig).length > 0 ? toolRenderConfig : undefined,
      actions: {
        list: [
          {
            icon: (
              <span title={t("common.copy")}>
                <SparkCopyLine />
              </span>
            ),
            onClick: ({ data }: { data: CopyableResponse }) => {
              void copyResponse(data);
            },
          },
        ],
        replace: true,
      },
    } as unknown as IAgentScopeRuntimeWebUIOptions;
  }, [
    customFetch,
    copyResponse,
    handleFileUpload,
    t,
    isDark,
    multimodalCaps,
    toolRenderConfig,
    scheduleHistoryClear,
    selectedAgent,
    agents,
    isComposingRef,
    showHistory,    postMessageUserId,  ]);

  if (authState === "loading") {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  if (authState === "error") {
    return (
      <div className={styles.errorContainer}>
        <Result
          status="403"
          title={t("embed.authError")}
          subTitle={errorMsg}
        />
      </div>
    );
  }

  return (
    <div className={styles.embedWrapper}>
      <div className={styles.chatMessagesArea}>
        <AgentScopeRuntimeWebUI ref={chatRef} key={refreshKey} options={options} />
      </div>
    </div>
  );
}
