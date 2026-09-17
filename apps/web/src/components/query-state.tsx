import type { ReactNode } from "react";

interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyLabel?: string;
  errorLabel?: string;
  children: ReactNode;
}

/** Shared loading/empty/error rendering so pages present consistent states. */
export function QueryState({
  isLoading,
  isError,
  isEmpty = false,
  onRetry,
  emptyLabel = "暂无数据",
  errorLabel = "加载失败，请稍后重试",
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div className="state-block" role="status" aria-live="polite">
        正在加载…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="state-block state-error" role="alert">
        <p>{errorLabel}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            重试
          </button>
        ) : null}
      </div>
    );
  }
  if (isEmpty) {
    return <div className="state-block">{emptyLabel}</div>;
  }
  return <>{children}</>;
}
