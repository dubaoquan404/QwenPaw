import { Card } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import styles from "../index.module.less";

interface CreateSkillCardProps {
  onClick: () => void;
}

export function CreateSkillCard({ onClick }: CreateSkillCardProps) {
  const { t } = useTranslation();

  return (
    <Card
      hoverable
      className={`${styles.skillCard} ${styles.uploadCard}`}
      style={{ cursor: "pointer" }}
      onClick={onClick}
    >
      <div className={styles.uploadCardBody}>
        <div className={styles.uploadCardIcon}>
          <PlusOutlined />
        </div>
        <h3 className={styles.uploadCardTitle}>
          {t("skills.emptyStateCreate")}
        </h3>
        <p className={styles.uploadCardHint}>
          {t("skills.createSkillHint")}
        </p>
      </div>
    </Card>
  );
}
