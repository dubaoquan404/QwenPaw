import { Button, Tooltip } from "@agentscope-ai/design";
import {
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import styles from "../index.module.less";

interface HeaderActionsProps {
  batchModeEnabled: boolean;
  selectedSkills: Set<string>;
  loading: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onUploadToPool: (names: string[]) => void;
  onBatchEnable: () => void;
  onBatchDisable: () => void;
  onBatchDelete: () => void;
  onToggleBatchMode: () => void;
  onHardRefresh: () => void;
  onOpenDownloadPool: () => void;
  onOpenUploadPool: () => void;
  onImportHub: () => void;
  onCreate: () => void;
}

export function HeaderActions({
  batchModeEnabled,
  selectedSkills,
  loading,
  onSelectAll,
  onClearSelection,
  onUploadToPool,
  onBatchEnable,
  onBatchDisable,
  onBatchDelete,
  onToggleBatchMode,
  onHardRefresh,
  onOpenDownloadPool,
  onOpenUploadPool,
  onImportHub,
  onCreate,
}: HeaderActionsProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.headerRight}>
      {batchModeEnabled ? (
        <div className={styles.batchActions}>
          <>
            <span className={styles.batchCount}>
              {t("skills.selectedCount", { count: selectedSkills.size })}
            </span>
            <Button type="default" onClick={onSelectAll}>
              {t("skills.selectAll")}
            </Button>
            <Button
              type="default"
              onClick={onClearSelection}
              icon={<CloseOutlined />}
            >
              {t("skills.clearSelection")}
            </Button>
            <Tooltip title={t("skills.uploadToPoolHint")}>
              <Button
                type="default"
                className={styles.primaryTransferButton}
                onClick={() => {
                  const names = Array.from(selectedSkills);
                  if (names.length === 0) return;
                  onClearSelection();
                  void onUploadToPool(names);
                }}
                icon={<SwapOutlined />}
              >
                {t("skills.uploadToPool")}
              </Button>
            </Tooltip>
            <Button
              type="default"
              icon={<EyeOutlined />}
              onClick={onBatchEnable}
            >
              {t("skills.batchEnable")}
            </Button>
            <Button
              danger
              icon={<EyeInvisibleOutlined />}
              onClick={onBatchDisable}
            >
              {t("skills.batchDisable")}
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={onBatchDelete}>
              {t("common.delete")} ({selectedSkills.size})
            </Button>
          </>
          <Button type="primary" onClick={onToggleBatchMode}>
            {t("skills.exitBatch")}
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.headerActionsLeft}>
            <Tooltip title={t("skills.refreshHint")}>
              <Button
                type="default"
                icon={<ReloadOutlined spin={loading} />}
                onClick={onHardRefresh}
                disabled={loading}
              />
            </Tooltip>
            <Tooltip title={t("skills.downloadFromPoolHint")}>
              <Button
                type="default"
                className={styles.primaryTransferButton}
                onClick={onOpenDownloadPool}
                icon={<DownloadOutlined />}
              >
                {t("skills.downloadFromPool")}
              </Button>
            </Tooltip>
            <Tooltip title={t("skills.uploadToPoolHint")}>
              <Button
                type="default"
                className={styles.primaryTransferButton}
                onClick={onOpenUploadPool}
                icon={<SwapOutlined />}
              >
                {t("skills.uploadToPool")}
              </Button>
            </Tooltip>
          </div>
          <div className={styles.headerActionsRight}>
            <Tooltip title={t("skills.importHubHint")}>
              <Button
                type="default"
                className={styles.creationActionButton}
                onClick={onImportHub}
                icon={<ImportOutlined />}
              >
                {t("skills.importHub")}
              </Button>
            </Tooltip>
            <Button type="primary" onClick={onToggleBatchMode}>
              {t("skills.batchOperation")}
            </Button>
            <Tooltip title={t("skills.createSkillHint")}>
              <Button
                type="primary"
                className={styles.primaryActionButton}
                onClick={onCreate}
                icon={<PlusOutlined />}
              >
                {t("skills.createSkill")}
              </Button>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}
