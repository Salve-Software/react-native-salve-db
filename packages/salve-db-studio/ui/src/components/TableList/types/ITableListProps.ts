export interface ITableListProps {
  tables: string[];
  currentTable: string | null;
  onSelect: (name: string) => void;
  onManage: (name: string) => void;
}
