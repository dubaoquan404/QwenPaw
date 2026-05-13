import { useCallback } from "react";
import { CloseOutlined } from "@ant-design/icons";
import type { OpenTab } from "../useSkillDebugger";
import styles from "../index.module.less";

interface FileEditorProps {
  tabs: OpenTab[];
  activeTab: string | null;
  activeTabObj: OpenTab | null;
  onTabClick: (path: string) => void;
  onTabClose: (path: string) => void;
  onContentChange: (path: string, content: string) => void;
}

export function FileEditor({
  tabs,
  activeTab,
  activeTabObj,
  onTabClick,
  onTabClose,
  onContentChange,
}: FileEditorProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (activeTab) {
        onContentChange(activeTab, e.target.value);
      }
    },
    [activeTab, onContentChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab key inserts spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const value = target.value;
        const newValue = value.substring(0, start) + "  " + value.substring(end);
        if (activeTab) {
          onContentChange(activeTab, newValue);
          // Restore cursor position
          requestAnimationFrame(() => {
            target.selectionStart = target.selectionEnd = start + 2;
          });
        }
      }
    },
    [activeTab, onContentChange],
  );

  if (tabs.length === 0) {
    return (
      <div className={styles.editorPanel}>
        <div className={styles.editorEmpty}>
          Select a file from the tree to start editing
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editorPanel}>
      <div className={styles.editorTabs}>
        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={`${styles.editorTab} ${tab.path === activeTab ? styles.activeTab : ""}`}
            onClick={() => onTabClick(tab.path)}
          >
            <span>
              {tab.modified ? "● " : ""}
              {tab.name}
            </span>
            <span
              className={styles.tabClose}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.path);
              }}
            >
              <CloseOutlined />
            </span>
          </div>
        ))}
      </div>

      <div className={styles.editorContent}>
        {activeTabObj ? (
          <>
            <textarea
              className={styles.editorTextarea}
              value={activeTabObj.content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
            <div className={styles.editorFooter}>
              <span>{activeTabObj.path}</span>
              <span>
                {activeTabObj.modified ? (
                  <span className={styles.modified}>Modified</span>
                ) : (
                  "Saved"
                )}
              </span>
            </div>
          </>
        ) : (
          <div className={styles.editorEmpty}>
            Select a tab to view content
          </div>
        )}
      </div>
    </div>
  );
}
