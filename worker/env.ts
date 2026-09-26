/** Worker bindings with the string types the code expects (wrangler types narrows empty vars to ""). */
export interface AppEnv {
	DB?: Hyperdrive;
	ASSETS?: Fetcher;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	SESSION_SECRET?: string;
	BOOTSTRAP_ADMIN_EMAIL?: string;
	MCP_AUTH_TOKEN?: string;
	DEV_LOGIN_SECRET?: string;
}
