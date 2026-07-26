import { Database } from "../database";
import { QueryCache } from "./QueryCache.class";

/** The single `QueryCache` instance backing every `useQuery` call, wired to the real native bridge. */
export const queryCache = new QueryCache(Database.subscribeToChanges, Database.unsubscribeFromChanges);
