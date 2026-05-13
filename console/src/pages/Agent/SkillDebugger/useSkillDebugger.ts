import { useState, useCallback, useRef } from "react";
import JSZip from "jszip";
import type { SkillSpec } from "../../../api/types";
import { workspaceApi } from "../../../api/modules/workspace";

export type SkillSource = "zip" | "existing";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
}

/** Build a tree from flat zip entries */
function buildTree(entries: { path: string; content: string }[]): FileNode[] {
  const root: FileNode[] = [];

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");
      let existing = current.find((n) => n.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isLast ? "file" : "folder",
          ...(isLast ? { content: entry.content } : { children: [] }),
        };
        current.push(existing);
      }

      if (!isLast) {
        existing.type = "folder";
        if (!existing.children) existing.children = [];
        current = existing.children;
      }
    }
  }

  // Sort: folders first, then alphabetical
  const sortNodes = (nodes: FileNode[]): FileNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
    return nodes;
  };

  return sortNodes(root);
}

export interface OpenTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  modified: boolean;
}

export function useSkillDebugger() {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [skillName, setSkillName] = useState<string>("");
  const [skillSource, setSkillSource] = useState<SkillSource | null>(null);
  const [loading, setLoading] = useState(false);
  const flatFilesRef = useRef<Map<string, string>>(new Map());

  /** Load a zip File */
  const loadZip = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const entries: { path: string; content: string }[] = [];
      const flatFiles = new Map<string, string>();

      // Detect if all entries share a common root folder
      const allPaths = Object.keys(zip.files).filter(
        (p) => !zip.files[p].dir,
      );
      let stripPrefix = "";
      if (allPaths.length > 0) {
        const firstSlash = allPaths[0].indexOf("/");
        if (firstSlash > 0) {
          const candidate = allPaths[0].slice(0, firstSlash + 1);
          if (allPaths.every((p) => p.startsWith(candidate))) {
            stripPrefix = candidate;
          }
        }
      }

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;

        let path = relativePath;
        if (stripPrefix && path.startsWith(stripPrefix)) {
          path = path.slice(stripPrefix.length);
        }
        if (!path) continue;

        const content = await zipEntry.async("string");
        entries.push({ path, content });
        flatFiles.set(path, content);
      }

      flatFilesRef.current = flatFiles;
      const tree = buildTree(entries);
      setFileTree(tree);
      setOpenTabs([]);
      setActiveTab(null);

      // Derive skill name from zip filename
      const name = file.name.replace(/\.zip$/i, "");
      setSkillName(name);
      setSkillSource("zip");
    } finally {
      setLoading(false);
    }
  }, []);

  /** Load an existing skill from workspace by downloading workspace zip and extracting the skill folder */
  const loadSkill = useCallback(async (skill: SkillSpec) => {
    setLoading(true);
    try {
      const { blob } = await workspaceApi.downloadWorkspace();
      const zip = await JSZip.loadAsync(blob);

      // Find all files belonging to this skill
      // Skills are stored in a folder named after the skill, e.g. "skills/my-skill/" or just "my-skill/"
      const skillFolderCandidates = [
        `skills/${skill.name}/`,
        `${skill.name}/`,
      ];

      const entries: { path: string; content: string }[] = [];
      const flatFiles = new Map<string, string>();

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;

        let matchedPrefix = "";
        for (const candidate of skillFolderCandidates) {
          if (relativePath.startsWith(candidate)) {
            matchedPrefix = candidate;
            break;
          }
        }
        if (!matchedPrefix) continue;

        const path = relativePath.slice(matchedPrefix.length);
        if (!path) continue;

        const content = await zipEntry.async("string");
        entries.push({ path, content });
        flatFiles.set(path, content);
      }

      // If we didn't find files in the workspace zip, fall back to SKILL.md from the skill spec
      if (entries.length === 0) {
        flatFiles.set("SKILL.md", skill.content);
        entries.push({ path: "SKILL.md", content: skill.content });
        if (skill.config && Object.keys(skill.config).length > 0) {
          const configContent = JSON.stringify(skill.config, null, 2);
          flatFiles.set("config.json", configContent);
          entries.push({ path: "config.json", content: configContent });
        }
      }

      flatFilesRef.current = flatFiles;
      const tree = buildTree(entries);
      setFileTree(tree);
      setOpenTabs([]);
      setActiveTab(null);
      setSkillName(skill.name);
      setSkillSource("existing");

      // Auto-open SKILL.md if it exists
      const skillMdContent = flatFiles.get("SKILL.md");
      if (skillMdContent !== undefined) {
        setOpenTabs([
          {
            path: "SKILL.md",
            name: "SKILL.md",
            content: skillMdContent,
            originalContent: skillMdContent,
            modified: false,
          },
        ]);
        setActiveTab("SKILL.md");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /** Open a file in a tab */
  const openFile = useCallback(
    (path: string, name: string) => {
      setOpenTabs((prev) => {
        const existing = prev.find((t) => t.path === path);
        if (existing) return prev;

        const content = flatFilesRef.current.get(path) ?? "";
        return [
          ...prev,
          { path, name, content, originalContent: content, modified: false },
        ];
      });
      setActiveTab(path);
    },
    [],
  );

  /** Close a tab */
  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => {
        const filtered = prev.filter((t) => t.path !== path);
        return filtered;
      });
      setActiveTab((prev) => {
        if (prev === path) {
          const tabs = openTabs.filter((t) => t.path !== path);
          return tabs.length > 0 ? tabs[tabs.length - 1].path : null;
        }
        return prev;
      });
    },
    [openTabs],
  );

  /** Update file content */
  const updateFileContent = useCallback((path: string, content: string) => {
    flatFilesRef.current.set(path, content);
    setOpenTabs((prev) =>
      prev.map((t) =>
        t.path === path
          ? { ...t, content, modified: content !== t.originalContent }
          : t,
      ),
    );
  }, []);

  /** Mark a tab as saved */
  const markSaved = useCallback((path: string) => {
    setOpenTabs((prev) =>
      prev.map((t) =>
        t.path === path
          ? { ...t, originalContent: t.content, modified: false }
          : t,
      ),
    );
  }, []);

  /** Export current state back to zip */
  const exportZip = useCallback(async (): Promise<Blob> => {
    const zip = new JSZip();
    for (const [path, content] of flatFilesRef.current.entries()) {
      zip.file(path, content);
    }
    return zip.generateAsync({ type: "blob" });
  }, []);

  /** Get the active tab object */
  const activeTabObj = openTabs.find((t) => t.path === activeTab) ?? null;

  /** Check if any files are modified */
  const hasModified = openTabs.some((t) => t.modified);

  /** Reset */
  const reset = useCallback(() => {
    setFileTree([]);
    setOpenTabs([]);
    setActiveTab(null);
    setSkillName("");
    setSkillSource(null);
    flatFilesRef.current.clear();
  }, []);

  return {
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
    markSaved,
    exportZip,
    reset,
  };
}
