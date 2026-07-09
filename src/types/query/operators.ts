import type { Condition } from "./condition";

/**
 * Condition operators used in `.where(...)`. Declarations only — implementation
 * is owned by TASK-013 (Query Builder).
 *
 * Out of MVP: `ilike`, `between`, `arrayContains`, subqueries.
 */
export declare function eq<T>(column: T, value: T): Condition;
export declare function ne<T>(column: T, value: T): Condition;
export declare function gt<T>(column: T, value: T): Condition;
export declare function gte<T>(column: T, value: T): Condition;
export declare function lt<T>(column: T, value: T): Condition;
export declare function lte<T>(column: T, value: T): Condition;
export declare function like(column: string, pattern: string): Condition;
export declare function inArray<T>(column: T, values: T[]): Condition;
export declare function isNull(column: unknown): Condition;
export declare function isNotNull(column: unknown): Condition;

export declare function and(...conditions: Condition[]): Condition;
export declare function or(...conditions: Condition[]): Condition;
export declare function not(condition: Condition): Condition;
