import { useCallback, useState, useEffect, useMemo } from "react";
import { Button, Upload, Spin, Tooltip, Modal, Input, Empty, Card } from "antd";
import {
  UploadOutlined,
  DownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  InboxOutlined,
  SaveOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useAppMessage } from "../../../hooks/useAppMessage";
import { PageHeader } from "../../../components/PageHeader";
import { api } from "../../../api";
import { useAgentStore } from "../../../stores/agentStore";
import type { SkillSpec } from "../../../api/types";
import { useSkillDebugger } from "./useSkillDebugger";
import { FileTree } from "./components/FileTree";
import { FileEditor } from "./components/FileEditor";
import { ChatTestPanel } from "./components/ChatTestPanel";
import styles from "./index.module.less";
import skillStyles from "../Skills/index.module.less";

const MAX_ZIP_SIZE_MB = 50;

export default function SkillDebuggerPage() {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const { selectedAgent } = useAgentStore();
  const debugger_ = useSkillDebugger();
  const [skills, setSkills] = useState<SkillSpec[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  const {
    fileTree,
    openTabs,
    activeTab,
    activeTabObj,
    skillName,
    skillSource,
    loading,
    hasModified,
    loadZip,
    loadSkill,
    openFile,
    closeTab,
    setActiveTab,
    updateFileContent,
    exportZip,
    reset,
  } = debugger_;

  /** Fetch existing skills */
  useEffect(() => {
    let cancelled = false;
    setSkillsLoading(true);
    api
      .listSkills(selectedAgent)
      .then((data) => {
        if (!cancelled) setSkills(data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAgent]);

  /** Handle selecting an existing skill */
  const handleSelectSkill = useCallback(
    (skill: SkillSpec) => {
      loadSkill(skill);
    },
    [loadSkill],
  );

  /** Filtered skills by search text */
  const filteredSkills = useMemo(() => {
    if (!searchText.trim()) return skills;
    const q = searchText.trim().toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q),
    );
  }, [skills, searchText]);

  /** Handle zip upload */
  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".zip")) {
        message.error(t("skills.zipOnly"));
        return false;
      }
      const sizeMb = file.size / 1024 / 1024;
      if (sizeMb > MAX_ZIP_SIZE_MB) {
        message.error(
          t("skills.fileSizeExceeded", {
            limit: MAX_ZIP_SIZE_MB,
            size: sizeMb.toFixed(2),
          }),
        );
        return false;
      }
      await loadZip(file);
      message.success(t("skillDebugger.loadSuccess"));
      return false; // Prevent antd from uploading
    },
    [loadZip, message, t],
  );

  /** Export zip and deploy to workspace (for zip source) */
  const handleDeploy = useCallback(async () => {
    try {
      const blob = await exportZip();
      const file = new File([blob], `${skillName || "skill"}.zip`, {
        type: "application/zip",
      });
      await api.uploadSkill(file, { enable: true });
      message.success(t("skillDebugger.deploySuccess"));
    } catch (err: unknown) {
      message.error(
        err instanceof Error ? err.message : t("skillDebugger.deployFailed"),
      );
    }
  }, [exportZip, skillName, message, t]);

  /** Save skill content back (for existing skill source) */
  const handleSaveSkill = useCallback(async () => {
    try {
      const content = debugger_.activeTabObj?.content;
      if (!content) return;
      await api.saveSkill({
        name: skillName,
        content,
        overwrite: true,
      });
      debugger_.markSaved(debugger_.activeTab!);
      message.success(t("skillDebugger.saveSuccess"));
    } catch (err: unknown) {
      message.error(
        err instanceof Error ? err.message : t("skillDebugger.saveFailed"),
      );
    }
  }, [skillName, debugger_, message, t]);

  /** Export zip for download */
  const handleExport = useCallback(async () => {
    try {
      const blob = await exportZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${skillName || "skill"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      message.error(
        err instanceof Error ? err.message : t("skillDebugger.exportFailed"),
      );
    }
  }, [exportZip, skillName, message, t]);

  /** Reset workspace */
  const handleReset = useCallback(() => {
    if (hasModified) {
      Modal.confirm({
        title: t("skillDebugger.unsavedChanges"),
        content: t("skillDebugger.resetConfirm"),
        onOk: reset,
      });
    } else {
      reset();
    }
  }, [hasModified, reset, t]);

  // ── Upload zone (no file loaded) ────────────────────────────────────
  if (fileTree.length === 0 && !loading) {
    const isBuiltin = (s: SkillSpec) =>
      s.source === "builtin" ||
      s.source?.startsWith("builtin:") ||
      s.source === "system";

    return (
      <div className={styles.debuggerPage}>
        <PageHeader
          parent={t("nav.skills")}
          current={t("skillDebugger.title")}
          extra={
            <Input
              className={styles.searchInput}
              placeholder={t("skills.searchPlaceholder")}
              prefix={<SearchOutlined />}
              allowClear
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 240 }}
            />
          }
        />

        {skillsLoading ? (
          <div className={styles.uploadZone}>
            <Spin style={{ marginTop: 80 }} />
          </div>
        ) : (
          <div className={skillStyles.skillsGrid}>
            {/* First card: Upload Zip */}
            <Upload
              accept=".zip"
              showUploadList={false}
              beforeUpload={handleUpload}
            >
              <Card
                hoverable
                className={`${skillStyles.skillCard} ${styles.uploadCard}`}
                style={{ cursor: "pointer" }}
              >
                <div className={styles.uploadCardBody}>
                  <div className={styles.uploadCardIcon}>
                    <InboxOutlined />
                  </div>
                  <h3 className={styles.uploadCardTitle}>
                    {t("skillDebugger.uploadTitle")}
                  </h3>
                  <p className={styles.uploadCardHint}>
                    {t("skillDebugger.uploadHint")}
                  </p>
                </div>
              </Card>
            </Upload>

            {/* Skill cards */}
            {filteredSkills.map((skill) => (
              <Card
                key={skill.name}
                hoverable
                onClick={() => handleSelectSkill(skill)}
                className={skillStyles.skillCard}
                style={{ cursor: "pointer" }}
              >
                {/* Top row: Icon + Status */}
                <div className={skillStyles.cardTopRow}>
                  <span className={skillStyles.fileIcon}>
                    {skill.emoji ? (
                      <span className={skillStyles.skillEmoji}>
                        {skill.emoji}
                      </span>
                    ) : (
                      <span className={skillStyles.skillEmoji}>🛠</span>
                    )}
                  </span>
                  <div className={skillStyles.cardTopRight}>
                    <span
                      className={`${skillStyles.statusBadge} ${
                        skill.enabled
                          ? skillStyles.status_enabled
                          : skillStyles.status_disabled
                      }`}
                    >
                      <span className={skillStyles.statusDot} />
                      {skill.enabled
                        ? t("common.enabled")
                        : t("common.disabled")}
                    </span>
                  </div>
                </div>

                {/* Title + Built-in/Custom tag */}
                <div className={skillStyles.titleRow}>
                  <Tooltip title={skill.name}>
                    <h3 className={skillStyles.skillTitle}>
                      {skill.name}{" "}
                      {isBuiltin(skill) ? (
                        <span className={skillStyles.builtinTag}>
                          {t("skills.builtin")}
                        </span>
                      ) : (
                        <span className={skillStyles.customTag}>
                          {t("skills.custom")}
                        </span>
                      )}
                    </h3>
                  </Tooltip>
                </div>

                {/* Updated row */}
                {skill.last_updated && (
                  <div className={skillStyles.metaInfoRow}>
                    <span className={skillStyles.metaInfoLabel}>
                      {t("skills.lastUpdated")}
                    </span>
                    <span className={skillStyles.metaInfoValue}>
                      {dayjs(skill.last_updated).fromNow()}
                    </span>
                  </div>
                )}

                {/* Description */}
                <div className={skillStyles.descriptionSection}>
                  <span className={skillStyles.descriptionSectionLabel}>
                    {t("skills.skillDescription")}
                  </span>
                  <p className={skillStyles.descriptionText}>
                    {skill.description || "-"}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!skillsLoading && filteredSkills.length === 0 && searchText && (
          <Empty
            description={t("skills.noSearchResults")}
            style={{ marginTop: 40 }}
          />
        )}
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.debuggerPage}>
        <PageHeader
          parent={t("nav.skills")}
          current={t("skillDebugger.title")}
        />
        <div className={styles.uploadZone}>
          <Spin size="large" tip={t("skillDebugger.loading")} />
        </div>
      </div>
    );
  }

  // ── Main debugger layout ──────────────────────────────────────────
  return (
    <div className={styles.debuggerPage}>
      <PageHeader
        parent={t("nav.skills")}
        current={`${t("skillDebugger.title")} — ${skillName}`}
        extra={
          <div className={styles.saveActions}>
            <Tooltip title={t("skillDebugger.uploadNew")}>
              <Upload
                accept=".zip"
                showUploadList={false}
                beforeUpload={handleUpload}
              >
                <Button icon={<UploadOutlined />} size="small">
                  {t("skillDebugger.uploadNew")}
                </Button>
              </Upload>
            </Tooltip>

            {skillSource === "existing" && (
              <Tooltip title={t("skillDebugger.saveSkill")}>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  size="small"
                  onClick={handleSaveSkill}
                  disabled={!hasModified}
                >
                  {t("skillDebugger.saveSkill")}
                </Button>
              </Tooltip>
            )}

            {skillSource === "zip" && (
              <>
                <Tooltip title={t("skillDebugger.exportZip")}>
                  <Button
                    icon={<DownloadOutlined />}
                    size="small"
                    onClick={handleExport}
                  >
                    {t("skillDebugger.exportZip")}
                  </Button>
                </Tooltip>

                <Tooltip title={t("skillDebugger.deploy")}>
                  <Button
                    type="primary"
                    icon={<CloudUploadOutlined />}
                    size="small"
                    onClick={handleDeploy}
                  >
                    {t("skillDebugger.deploy")}
                  </Button>
                </Tooltip>
              </>
            )}

            <Tooltip title={t("skillDebugger.reset")}>
              <Button
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={handleReset}
              />
            </Tooltip>
          </div>
        }
      />

      <div className={styles.debuggerContainer}>
        {/* Left: File Tree */}
        <div className={styles.fileTreePanel}>
          <div className={styles.fileTreeHeader}>
            <span>{skillName}</span>
          </div>
          <FileTree
            tree={fileTree}
            activePath={activeTab}
            onSelect={openFile}
          />
        </div>

        {/* Center: File Editor */}
        <FileEditor
          tabs={openTabs}
          activeTab={activeTab}
          activeTabObj={activeTabObj}
          onTabClick={setActiveTab}
          onTabClose={closeTab}
          onContentChange={updateFileContent}
        />

        {/* Right: Chat Test */}
        <ChatTestPanel skillName={skillName} />
      </div>
    </div>
  );
}
