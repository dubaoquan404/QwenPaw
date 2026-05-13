import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Spin } from "antd";
import { Button, IconButton } from "@agentscope-ai/design";
import {
  SparkDeleteLine,
  SparkEditLine,
  SparkOperateLeftLine,
  SparkOperateRightLine,
  SparkPlusLine,
} from "@agentscope-ai/icons";
import {
  HistoryPanel,
  useChatAnywhereSessionsState,
  useChatAnywhereSessions,
  type IAgentScopeRuntimeWebUISession,
  type ConversationsProps,
} from "@agentscope-ai/chat";
import { useTranslation } from "react-i18next";
import sessionApi from "../../../Chat/sessionApi";
import { chatApi } from "../../../../api/modules/chat";
import styles from "./index.module.less";

type Conversation = NonNullable<ConversationsProps["items"]>[number];

interface ExtendedSession extends IAgentScopeRuntimeWebUISession {
  createdAt?: string | null;
  pinned?: boolean;
  realId?: string;
}

const getBackendId = (session: ExtendedSession): string | null => {
  if (session.realId) return session.realId;
  const id = session.id;
  if (!/^\d+$/.test(id)) return id;
  return null;
};

export default function EmbedChatSessionSidebar() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  const { sessions, currentSessionId, setCurrentSessionId, setSessions } =
    useChatAnywhereSessionsState();
  const { createSession } = useChatAnywhereSessions();

  const refreshSessions = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await sessionApi.getSessionList();
      setSessions(list);
    } catch {
      // silent
    } finally {
      setListLoading(false);
    }
  }, [setSessions]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleCreateSession = useCallback(async () => {
    await createSession();
    await refreshSessions();
    setOpen(false);
  }, [createSession, refreshSessions]);

  const handleDelete = useCallback(
    async (conv: Conversation) => {
      const session = sessions.find((s) => s.id === conv.key) as
        | ExtendedSession
        | undefined;
      const backendId = session ? getBackendId(session) : null;
      if (backendId) {
        await chatApi.deleteChat(backendId);
      }
      if (currentSessionId === conv.key) {
        const next = sessions.filter((s) => s.id !== conv.key);
        setCurrentSessionId(next[0]?.id);
      }
      await refreshSessions();
    },
    [sessions, currentSessionId, setCurrentSessionId, refreshSessions],
  );

  const handleEdit = useCallback(
    async (label: string, conv: Conversation) => {
      const session = sessions.find((s) => s.id === conv.key) as
        | ExtendedSession
        | undefined;
      const backendId = session ? getBackendId(session) : null;
      const newName = label.trim();
      if (backendId && newName) {
        await chatApi.updateChat(backendId, { name: newName });
      }
      await refreshSessions();
    },
    [sessions, refreshSessions],
  );

  const sortedSessions = useMemo(() => {
    const ext = sessions as ExtendedSession[];
    return [...ext].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [sessions]);

  const historyItems = useMemo<Conversation[]>(
    () =>
      sortedSessions.map((s) => ({
        key: s.id,
        label: s.name || t("chat.newChat", "New Chat"),
      })),
    [sortedSessions, t],
  );

  return createPortal(
    <>
      {/* Toggle button shown when sidebar is closed */}
      {!open && (
        <div className={styles.toggleBtn}>
          <IconButton
            bordered={false}
            icon={<SparkOperateRightLine />}
            onClick={() => setOpen(true)}
          />
        </div>
      )}

      {/* Sidebar panel with slide animation */}
      <div className={`${styles.sidebar} ${open ? "" : styles.sidebarClosed}`}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>{t("chat.allChats")}</span>
          <IconButton
            bordered={false}
            icon={<SparkOperateLeftLine />}
            onClick={() => setOpen(false)}
          />
        </div>

        {/* New Chat button */}
        <div className={styles.newChatBtn}>
          <Button
            block
            type="primary"
            icon={<SparkPlusLine />}
            onClick={handleCreateSession}
          >
            {t("chat.createNewChat")}
          </Button>
        </div>

        {/* Session list */}
        <div className={styles.list}>
          {listLoading ? (
            <div className={styles.loading}>
              <Spin />
            </div>
          ) : historyItems.length === 0 ? (
            <div className={styles.empty}>
              {t("chat.noChats", "No chats yet")}
            </div>
          ) : (
            <HistoryPanel
              items={historyItems}
              activeKey={currentSessionId}
              onActiveChange={(key) => setCurrentSessionId(key)}
              menu={[
                {
                  key: "rename",
                  label: t("chat.contextMenu.rename", "Rename"),
                  icon: <SparkEditLine />,
                  onEdit: handleEdit,
                },
                {
                  key: "delete",
                  label: t("chat.contextMenu.delete", "Delete"),
                  icon: <SparkDeleteLine />,
                  danger: true,
                  onClick: handleDelete,
                },
              ]}
            />
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
