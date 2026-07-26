export interface IPendingHandlers {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}
