declare module 'pg' {
	export interface PoolConfig {
		connectionString?: string;
		host?: string;
		port?: number;
		user?: string;
		password?: string;
		database?: string;
		ssl?: boolean | object;
	}

	export interface QueryResultRow {
		[key: string]: unknown;
	}

	export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
		rows: T[];
		rowCount: number;
	}

	export interface PoolClient {
		query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
		release(): void;
	}

	export class Pool {
		constructor(config?: PoolConfig);
		query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
		connect(): Promise<PoolClient>;
		end(): Promise<void>;
	}
}
