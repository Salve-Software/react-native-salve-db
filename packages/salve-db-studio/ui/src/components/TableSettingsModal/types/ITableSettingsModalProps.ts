export interface ITableSettingsModalProps {
  table: string | null;
  isSystem: boolean;
  onTruncate: (table: string) => void;
  onDelete: (table: string) => void;
  onClose: () => void;
}
