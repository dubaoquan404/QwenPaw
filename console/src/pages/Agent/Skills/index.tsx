import { useTranslation } from "react-i18next";
import {
  SkillCard,
  SkillDrawer,
  PoolTransferModal,
  ImportHubModal,
  HeaderActions,
  SkillsToolbar,
  SkillListItem,
  UploadSkillCard,
  CreateSkillCard,
} from "./components";
import { PageHeader } from "@/components/PageHeader";
import { useSkillsPage } from "./useSkillsPage";
import styles from "./index.module.less";

function SkillsPage() {
  const { t } = useTranslation();
  const {
    skills,
    visibleSkills,
    hasMore,
    sentinelRef,
    poolSkills,
    allTags,
    sortedSkills,
    conflictRenameModal,
    loading,
    uploading,
    importing,
    drawerOpen,
    importModalOpen,
    setImportModalOpen,
    editingSkill,
    form,
    poolModal,
    setPoolModal,
    selectedSkills,
    batchModeEnabled,
    viewMode,
    setViewMode,
    filterOpen,
    setFilterOpen,
    searchQuery,
    setSearchQuery,
    searchTags,
    setSearchTags,
    handleCreate,
    handleEdit,
    handleToggleEnabled,
    handleDelete,
    handleDrawerClose,
    handleSubmit,
    handleUploadToPool,
    handleDownloadFromPool,
    handleBatchEnable,
    handleBatchDisable,
    handleBatchDelete,
    handleUploadFile,
    handleConfirmImport,
    closeImportModal,
    closePoolModal,
    toggleSelect,
    selectAll,
    clearSelection,
    toggleBatchMode,
    toggleEnabled,
    refreshSkills,
    hardRefresh,
    cancelImport,
  } = useSkillsPage();

  return (
    <div className={styles.skillsPage}>
      <PageHeader
        items={[{ title: t("nav.agent") }, { title: t("skills.title") }]}
        extra={
          <HeaderActions
            batchModeEnabled={batchModeEnabled}
            selectedSkills={selectedSkills}
            loading={loading}
            onSelectAll={selectAll}
            onClearSelection={clearSelection}
            onUploadToPool={handleUploadToPool}
            onBatchEnable={handleBatchEnable}
            onBatchDisable={handleBatchDisable}
            onBatchDelete={handleBatchDelete}
            onToggleBatchMode={toggleBatchMode}
            onHardRefresh={hardRefresh}
            onOpenDownloadPool={() => setPoolModal("download")}
            onOpenUploadPool={() => setPoolModal("upload")}
            onImportHub={() => setImportModalOpen(true)}
            onCreate={handleCreate}
          />
        }
      />

      <ImportHubModal
        open={importModalOpen}
        importing={importing}
        onCancel={closeImportModal}
        onConfirm={handleConfirmImport}
        cancelImport={cancelImport}
        hint={t("skillPool.externalHubHint")}
      />

      {!loading && skills.length > 0 && (
        <SkillsToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchTags={searchTags}
          onTagsChange={setSearchTags}
          allTags={allTags}
          filterOpen={filterOpen}
          onFilterOpenChange={setFilterOpen}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}

      {loading ? (
        <div className={styles.loading}>
          <span className={styles.loadingText}>{t("common.loading")}</span>
        </div>
      ) : skills.length === 0 ? (
        <div className={styles.skillsGrid}>
          <UploadSkillCard
            uploading={uploading}
            onFileSelect={handleUploadFile}
          />
          <CreateSkillCard onClick={handleCreate} />
        </div>
      ) : sortedSkills.length === 0 ? (
        <div className={styles.noSearchResults}>
          <span className={styles.noSearchResultsIcon}>🔍</span>
          <span className={styles.noSearchResultsText}>
            {t("skills.noSearchResults")}
          </span>
        </div>
      ) : viewMode === "card" ? (
        <div className={styles.skillsGrid}>
          {!batchModeEnabled && (
            <UploadSkillCard
              uploading={uploading}
              onFileSelect={handleUploadFile}
            />
          )}
          {visibleSkills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              selected={
                batchModeEnabled ? selectedSkills.has(skill.name) : undefined
              }
              onSelect={() => toggleSelect(skill.name)}
              onClick={() => handleEdit(skill)}
              onMouseEnter={() => {}}
              onMouseLeave={() => {}}
              onToggleEnabled={(e) => handleToggleEnabled(skill, e)}
              onDelete={(e) => handleDelete(skill, e)}
            />
          ))}
          {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        </div>
      ) : (
        <div className={styles.skillsList}>
          {visibleSkills.map((skill) => (
            <SkillListItem
              key={skill.name}
              skill={skill}
              batchModeEnabled={batchModeEnabled}
              isSelected={selectedSkills.has(skill.name)}
              onSelect={() => toggleSelect(skill.name)}
              onClick={() => handleEdit(skill)}
              onToggleEnabled={async () => {
                await toggleEnabled(skill);
                await refreshSkills();
              }}
              onDelete={() => handleDelete(skill)}
            />
          ))}
          {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        </div>
      )}

      <PoolTransferModal
        mode={poolModal}
        skills={skills}
        poolSkills={poolSkills}
        onCancel={closePoolModal}
        onUpload={handleUploadToPool}
        onDownload={handleDownloadFromPool}
      />

      {conflictRenameModal}

      <SkillDrawer
        open={drawerOpen}
        editingSkill={editingSkill}
        form={form}
        availableTags={allTags}
        onClose={handleDrawerClose}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export default SkillsPage;
