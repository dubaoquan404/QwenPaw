import { useState, useEffect, useCallback } from "react";
import {
  Select,
  Button,
  Typography,
  Space,
  Tooltip,
  Alert,
  Spin,
  Divider,
  Switch,
  Input,
} from "antd";
import {
  CopyOutlined,
  CheckOutlined,
  LinkOutlined,
  CodeOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { agentsApi } from "@/api/modules/agents";
import { authApi } from "@/api/modules/auth";
import { getApiToken } from "@/api/config";
import type { AgentSummary } from "@/api/types/agents";
import { PageHeader } from "@/components/PageHeader";
import { useAgentStore } from "@/stores/agentStore";
import styles from "./index.module.less";

const { Text, Paragraph, Title } = Typography;
const { TextArea } = Input;

function getBaseOrigin(): string {
  return window.location.origin + (window.location.pathname.includes("/console") ? "/console" : "");
}

function buildEmbedUrl(agentId: string, token: string | null, includeToken: boolean, darkMode: boolean, showHistory: boolean): string {
  const base = getBaseOrigin();
  const params = new URLSearchParams();
  params.set("agent", agentId);
  if (includeToken && token) {
    params.set("token", token);
  }
  if (darkMode) {
    params.set("dark", "1");
  }
  if (showHistory) {
    params.set("history", "1");
  }
  return `${base}/embed/chat?${params.toString()}`;
}

function buildIframeCode(url: string): string {
  return `<iframe\n  src="${url}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  allow="microphone"\n  style="border-radius: 12px; border: 1px solid #e8e8e8;"\n></iframe>`;
}

export default function EmbedPage() {
  const { t } = useTranslation();
  const { selectedAgent: currentAgent } = useAgentStore();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(currentAgent || "default");
  const [authEnabled, setAuthEnabled] = useState(false);
  const [includeToken, setIncludeToken] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [embedDarkMode, setEmbedDarkMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const embedUrl = buildEmbedUrl(selectedAgentId, token, includeToken, embedDarkMode, showHistory);
  const iframeCode = buildIframeCode(embedUrl);

  const loadData = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const [agentList, authStatus] = await Promise.all([
        agentsApi.listAgents(),
        authApi.getStatus(),
      ]);
      // Use all agents (enabled first); the API list already includes "default"
      const allAgents = agentList.agents;
      const enabledFirst = [
        ...allAgents.filter((a) => a.enabled),
        ...allAgents.filter((a) => !a.enabled),
      ];
      const finalAgents = enabledFirst.length > 0 ? enabledFirst : allAgents;
      setAgents(finalAgents);
      // Prefer current agent from store, then keep existing selection, then fall back to first agent
      if (finalAgents.length > 0) {
        setSelectedAgentId((prev) => {
          if (finalAgents.some((a) => a.id === currentAgent)) return currentAgent;
          return finalAgents.some((a) => a.id === prev) ? prev : finalAgents[0].id;
        });
      }
      setAuthEnabled(authStatus.enabled);
      setToken(getApiToken());
    } catch (err) {
      console.error("Failed to load embed page data:", err);
    } finally {
      setLoadingAgents(false);
    }
  }, [currentAgent]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(embedUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      /* noop */
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(iframeCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      /* noop */
    }
  };

  const agentOptions = agents.map((a) => ({
    value: a.id,
    label: a.name || a.id,
  }));

  const maskedToken = token
    ? token.slice(0, 6) + "•".repeat(Math.min(token.length - 10, 20)) + token.slice(-4)
    : "";

  return (
    <div className={styles.embedPage}>
      <PageHeader
        items={[{ title: t("nav.settings") }, { title: t("nav.embed") }]}
      />

      <div className={styles.content}>
        {/* ── Step 1: Select Agent ── */}
        <section className={styles.section}>
          <Title level={5} className={styles.sectionTitle}>
            1. {t("embed.selectAgent")}
          </Title>
          <Text type="secondary" className={styles.sectionDesc}>
            {t("embed.selectAgentDesc")}
          </Text>
          <div className={styles.row}>
            {loadingAgents ? (
              <Spin size="small" />
            ) : (
              <Select
                value={selectedAgentId}
                onChange={setSelectedAgentId}
                options={agentOptions}
                style={{ width: 320 }}
                showSearch
                optionFilterProp="label"
              />
            )}
            <Tooltip title={t("common.refresh")}>
              <Button icon={<ReloadOutlined />} onClick={loadData} />
            </Tooltip>
          </div>
        </section>

        <Divider />

        {/* ── Step 2: Auth Token ── */}
        {authEnabled && (
          <>
            <section className={styles.section}>
              <Title level={5} className={styles.sectionTitle}>
                2. {t("embed.tokenConfig")}
              </Title>
              <Text type="secondary" className={styles.sectionDesc}>
                {t("embed.tokenConfigDesc")}
              </Text>

              <Alert
                type="warning"
                showIcon
                message={t("embed.tokenWarning")}
                description={t("embed.tokenWarningDesc")}
                className={styles.alert}
              />

              <div className={styles.tokenRow}>
                <div className={styles.tokenDisplay}>
                  <Text code className={styles.tokenCode}>
                    {showToken ? token : maskedToken}
                  </Text>
                  <Button
                    type="text"
                    size="small"
                    icon={showToken ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    onClick={() => setShowToken((v) => !v)}
                  />
                </div>
                <Space>
                  <Text>{t("embed.includeToken")}</Text>
                  <Switch
                    checked={includeToken}
                    onChange={setIncludeToken}
                    size="small"
                  />
                </Space>
              </div>

              {!includeToken && (
                <Alert
                  type="info"
                  showIcon
                  message={t("embed.noTokenNote")}
                  className={styles.alert}
                />
              )}
            </section>
            <Divider />
          </>
        )}

        {/* ── Step 3: Generated URL ── */}
        <section className={styles.section}>
          <Title level={5} className={styles.sectionTitle}>
            {authEnabled ? "3." : "2."} {t("embed.generatedUrl")}
          </Title>
          <Text type="secondary" className={styles.sectionDesc}>
            {t("embed.generatedUrlDesc")}
          </Text>

          {/* URL params: dark mode */}
          <div className={styles.paramRow}>
            <Space>
              <Switch
                checked={embedDarkMode}
                onChange={setEmbedDarkMode}
                size="small"
              />
              <Text>{t("embed.darkMode")}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{t("embed.darkModeDesc")}</Text>
            </Space>
          </div>

          {/* URL params: show session history button */}
          <div className={styles.paramRow}>
            <Space>
              <Switch
                checked={showHistory}
                onChange={setShowHistory}
                size="small"
              />
              <Text>{t("embed.showSessionBtn")}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{t("embed.showSessionBtnDesc")}</Text>
            </Space>
          </div>

          <div className={styles.urlBox}>
            <Text
              className={styles.urlText}
              ellipsis={{ tooltip: embedUrl }}
            >
              <LinkOutlined style={{ marginRight: 6 }} />
              {embedUrl}
            </Text>
            <Button
              type="primary"
              icon={copiedUrl ? <CheckOutlined /> : <CopyOutlined />}
              onClick={handleCopyUrl}
              className={styles.copyBtn}
            >
              {copiedUrl ? t("common.copied") : t("common.copy")}
            </Button>
          </div>
        </section>

        <Divider />

        {/* ── Step 4: iframe Code ── */}
        <section className={styles.section}>
          <Title level={5} className={styles.sectionTitle}>
            {authEnabled ? "4." : "3."} {t("embed.iframeCode")}
          </Title>
          <Text type="secondary" className={styles.sectionDesc}>
            {t("embed.iframeCodeDesc")}
          </Text>

          <div className={styles.codeBlock}>
            <TextArea
              value={iframeCode}
              readOnly
              autoSize={{ minRows: 6, maxRows: 8 }}
              className={styles.codeArea}
            />
            <Button
              icon={copiedCode ? <CheckOutlined /> : <CodeOutlined />}
              onClick={handleCopyCode}
              className={styles.copyBtn}
            >
              {copiedCode ? t("common.copied") : t("embed.copyCode")}
            </Button>
          </div>
        </section>

        <Divider />

        {/* ── Step 5: Preview ── */}
        <section className={styles.section}>
          <div className={styles.previewHeader}>
            <Title level={5} className={styles.sectionTitle}>
              {authEnabled ? "5." : "4."} {t("embed.preview")}
            </Title>
            <Button
              type={showPreview ? "default" : "primary"}
              icon={showPreview ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? t("embed.hidePreview") : t("embed.showPreview")}
            </Button>
          </div>
          <Text type="secondary" className={styles.sectionDesc}>
            {t("embed.previewDesc")}
          </Text>

          {showPreview && (
            <div className={styles.previewContainer}>
              <iframe
                src={embedUrl}
                className={styles.previewFrame}
                title={t("embed.previewTitle")}
                allow="microphone"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
