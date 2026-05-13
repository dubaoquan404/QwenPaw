import { Card, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import styles from "../index.module.less";

interface UploadSkillCardProps {
  uploading?: boolean;
  onFileSelect: (file: File) => void | Promise<void>;
}

export function UploadSkillCard({ uploading, onFileSelect }: UploadSkillCardProps) {
  const { t } = useTranslation();

  const handleBeforeUpload = (file: File) => {
    void onFileSelect(file);
    return false; // prevent antd from doing the actual upload
  };

  return (
    <Upload
      accept=".zip"
      showUploadList={false}
      beforeUpload={handleBeforeUpload}
      disabled={uploading}
      style={{ display: "block", width: "100%" }}
    >
      <Card
        hoverable={!uploading}
        className={`${styles.skillCard} ${styles.uploadCard}`}
        style={{ cursor: uploading ? "not-allowed" : "pointer" }}
      >
        <div className={styles.uploadCardBody}>
          <div className={styles.uploadCardIcon}>
            <InboxOutlined />
          </div>
          <h3 className={styles.uploadCardTitle}>
            {t("skills.uploadZip")}
          </h3>
          <p className={styles.uploadCardHint}>
            {t("skills.uploadZipHint")}
          </p>
        </div>
      </Card>
    </Upload>
  );
}
