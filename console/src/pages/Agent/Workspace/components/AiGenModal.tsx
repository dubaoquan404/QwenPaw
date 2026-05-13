import React, { useState, useRef, useCallback } from "react";
import { Modal, Button, Input } from "@agentscope-ai/design";
import { XMarkdown } from "@ant-design/x-markdown";
import { CopyOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useAgentStore } from "../../../../stores/agentStore";
import { getApiUrl } from "../../../../api/config";
import { buildAuthHeaders } from "../../../../api/authHeaders";
import { useAppMessage } from "../../../../hooks/useAppMessage";
import styles from "../index.module.less";

interface AiGenModalProps {
  open: boolean;
  onClose: () => void;
  fileContent: string;
  fileName: string;
  onApply: (content: string) => void;
}

export const AiGenModal: React.FC<AiGenModalProps> = ({
  open,
  onClose,
  fileContent,
  fileName,
  onApply,
}) => {
  const { t } = useTranslation();
  const { selectedAgent, agents } = useAgentStore();
  const { message } = useAppMessage();
  const [instruction, setInstruction] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const agentName =
    agents.find((a) => a.id === selectedAgent)?.name ||
    t("workspace.aiGen.unknownAgent");

  const handleGenerate = useCallback(async () => {
    if (generating) return;
    setGeneratedContent("");
    setGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(getApiUrl("/workspace/ai-gen"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({
          file_name: fileName,
          file_content: fileContent,
          instruction: instruction,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(t("workspace.aiGen.failed"));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const jsonStr = trimmed.startsWith("data:")
            ? trimmed.slice(5).trim()
            : trimmed;
          if (!jsonStr) continue;

          try {
            const payload = JSON.parse(jsonStr) as Record<string, unknown>;
            if (payload.error) {
              throw new Error(payload.error as string);
            }
            if (payload.done) break;
            if (typeof payload.text === "string" && payload.text) {
              accumulated += payload.text;
              setGeneratedContent(accumulated);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) {
              // Skip malformed JSON chunks
              continue;
            }
            throw parseErr;
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== "AbortError") {
        message.error(t("workspace.aiGen.failed"));
      }
    } finally {
      setGenerating(false);
      abortControllerRef.current = null;
    }
  }, [generating, fileName, fileContent, instruction, t, message]);

  const handleCancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setGenerating(false);
  }, []);

  const handleApply = useCallback(() => {
    if (generatedContent) {
      onApply(generatedContent);
      onClose();
    }
  }, [generatedContent, onApply, onClose]);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(generatedContent);
      } else {
        const ta = document.createElement("textarea");
        ta.value = generatedContent;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      message.success(t("common.copied"));
    } catch {
      message.error(t("common.copyFailed"));
    }
  }, [generatedContent, t, message]);

  const handleClose = useCallback(() => {
    if (generating) {
      abortControllerRef.current?.abort();
      setGenerating(false);
    }
    onClose();
  }, [generating, onClose]);

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={1040}
      title={t("workspace.aiGen.title")}
      styles={{ body: { padding: "16px 24px 24px" } }}
    >
      <div className={styles.aiGenModalBody}>
        {/* Left panel — instruction input */}
        <div className={styles.aiGenLeft}>
          <div className={styles.aiGenAgentInfo}>
            <span className={styles.aiGenAgentLabel}>
              {t("workspace.aiGen.agentInfo")}
            </span>
            <span className={styles.aiGenAgentName}>{agentName}</span>
          </div>

          <div className={styles.aiGenFileName}>
            <span>{fileName}</span>
          </div>

          <div className={styles.aiGenExtraSection}>
            <div className={styles.aiGenExtraLabel}>
              {t("workspace.aiGen.extraLabel")}
            </div>
            <Input.TextArea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t("workspace.aiGen.extraPlaceholder")}
              className={styles.aiGenTextarea}
              disabled={generating}
            />
          </div>

          <div className={styles.aiGenLeftActions}>
            <Button onClick={handleClose}>{t("common.cancel")}</Button>
            {generating ? (
              <Button type="primary" onClick={handleCancelGeneration} danger>
                {t("workspace.aiGen.cancel")}
              </Button>
            ) : (
              <Button type="primary" onClick={handleGenerate}>
                ✦ {t("workspace.aiGen.generate")}
              </Button>
            )}
          </div>
        </div>

        {/* Right panel — streaming preview */}
        <div className={styles.aiGenRight}>
          <div className={styles.aiGenRightHeader}>
            <span className={styles.aiGenRightTitle}>
              {t("workspace.aiGen.button")}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                icon={<CopyOutlined />}
                size="small"
                type="text"
                disabled={!generatedContent}
                onClick={handleCopy}
              />
              <Button
                type="primary"
                size="small"
                disabled={!generatedContent || generating}
                onClick={handleApply}
              >
                {t("workspace.aiGen.insert")}
              </Button>
            </div>
          </div>

          <div className={styles.aiGenPreview}>
            {generatedContent ? (
              <XMarkdown
                content={generatedContent}
                className={styles.aiGenMarkdown}
                dompurifyConfig={{
                  ADD_TAGS: ["pre", "code"],
                  ADD_ATTR: [
                    "data-block",
                    "data-state",
                    "data-lang",
                    "class",
                  ],
                }}
              />
            ) : (
              <div className={styles.aiGenPlaceholder}>
                {generating
                  ? `✦ ${t("workspace.aiGen.generating")}...`
                  : "生成的内容将在此处实时显示"}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
