import postgres from "postgres";
import { requestScope } from "../scope.ts";

export type Sql = ReturnType<typeof postgres>;

/** A postgres.js client. Hyperdrive pools upstream, so keep `max` small. Caller must `end()` it. */
export function createSql(connectionString: string): Sql {
	return postgres(connectionString, { max: 3, fetch_types: false, prepare: false, idle_timeout: 20, connect_timeout: 10 });
}

/**
 * The request-scoped client (created on first use, closed by the request wrapper in index.ts).
 * Throws if the request has no database configured.
 */
export function scopedSql(): Sql {
	const scope = requestScope.getStore();
	if (!scope?.dbConnectionString) throw new Error("Database is not configured (missing DB binding)");
	scope.sql ??= createSql(scope.dbConnectionString);
	return scope.sql;
}

export function hasDb(): boolean {
	return !!requestScope.getStore()?.dbConnectionString;
}
