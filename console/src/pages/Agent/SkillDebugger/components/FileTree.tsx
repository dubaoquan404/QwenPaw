import { useState } from "react";
import type { FileNode } from "../useSkillDebugger";
import {
  FolderOpenOutlined,
  FolderOutlined,
  FileTextOutlined,
  FileOutlined,
  RightOutlined,
} from "@ant-design/icons";
import styles from "../index.module.less";

/** Returns an appropriate icon for a given file extension */
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
    case "txt":
      return <FileTextOutlined />;
    case "py":
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
    case "json":
    case "yaml":
    case "yml":
    case "toml":
    case "cfg":
    case "ini":
      return <FileOutlined style={{ color: "#52c41a" }} />;
    default:
      return <FileOutlined />;
  }
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  activePath: string | null;
  onSelect: (path: string, name: string) => void;
}

function FileTreeNode({ node, depth, activePath, onSelect }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const isFolder = node.type === "folder";
  const isActive = !isFolder && node.path === activePath;

  const handleClick = () => {
    if (isFolder) {
      setExpanded((prev) => !prev);
    } else {
      onSelect(node.path, node.name);
    }
  };

  return (
    <>
      <div
        className={`${styles.treeNode} ${isActive ? styles.active : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleClick}
        title={node.path}
      >
        {isFolder && (
          <span
            className={`${styles.folderToggle} ${expanded ? styles.folderToggleOpen : ""}`}
          >
            <RightOutlined />
          </span>
        )}
        <span className={styles.treeNodeIcon}>
          {isFolder ? (
            expanded ? (
              <FolderOpenOutlined />
            ) : (
              <FolderOutlined />
            )
          ) : (
            getFileIcon(node.name)
          )}
        </span>
        <span className={styles.treeNodeName}>{node.name}</span>
      </div>
      {isFolder && expanded && node.children && (
        <>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </>
  );
}

interface FileTreeProps {
  tree: FileNode[];
  activePath: string | null;
  onSelect: (path: string, name: string) => void;
}

export function FileTree({ tree, activePath, onSelect }: FileTreeProps) {
  return (
    <div className={styles.fileTreeContent}>
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          activePath={activePath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
