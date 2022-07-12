/* eslint-disable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = require("better-sqlite3-helper");

export type TTransaction = {
  chain: string;
  id: string;
  height: number;
  blockHash: string;
  type: string;
  subType: string | undefined;
  event: string | undefined;
  addData: string | undefined;
  timestamp: number;
  specVersion: number | undefined;
  transactionVersion: number | undefined;
  authorId: string | undefined;
  senderId: string | undefined;
  recipientId: string | undefined;
  amount: bigint | undefined;
  totalFee: bigint | undefined;
  feeBalances: bigint | undefined;
  feeTreasury: bigint | undefined;
  tip: bigint | undefined;
  success: number | undefined;
};

export class CTxDB {
  private _options: any;
  private _db: any;
  private _chain: string;
  private _maxHeight: number; // the highest block number in database (before program execution)

  constructor(chain: string, filename?: string) {
    this._options = {
      path: "./data/sqlite3.db", // this is the default
      readonly: false, // read only
      fileMustExist: true, // throw error if database not exists
      WAL: true, // automatically enable 'PRAGMA journal_mode = WAL'?
      migrate: {
        // disable completely by setting `migrate: false`
        force: false, // set to 'last' to automatically reapply the last migration-file
        table: "migration", // name of the database table that is used to keep track
        migrationsPath: "./migrations", // path of the migration-files
      },
    };
    if (filename) this._options.path = filename;
    this._chain = chain;

    console.log("Apply database migrations, please wait ...\n");

    db(this._options);
    db().defaultSafeIntegers(true);
    this._db = db;
    this._maxHeight = this.CalcMaxHeight();

    process.on("exit", () => db().close()); // close database on exit
  }

  // --------------------------------------------------------------
  // access the better-sqlite3-helper
  get db(): any {
    return this._db;
  }

  // --------------------------------------------------------------
  // the chain
  get chain(): string {
    return this._chain;
  }

  // --------------------------------------------------------------
  // returns number of records in database
  GetCount(): number {
    const row = db().queryFirstRow(
      "SELECT count(*) as count FROM transactions WHERE chain=?",
      this._chain
    );
    return row.count;
  }

  // --------------------------------------------------------------
  // returns maximum blockheight in database (before program execution)
  CalcMaxHeight(): number {
    const row = db().queryFirstRow(
      "SELECT max(height) as max FROM transactions WHERE chain=?",
      this._chain
    );
    return row.max ? Number(row.max) : -1;
  }

  // --------------------------------------------------------------
  // returns stored maximum blockheight in database
  GetMaxHeight(): number {
    return this._maxHeight;
  }

  // --------------------------------------------------------------
  // returns all rows with requested query in database
  GetRows(height: number, amount: number): any {
    const sql = `SELECT senderId,
                 recipientId,
                 amount,
                 height
                 FROM transactions
                 WHERE event = ?
                 AND height > ?
                 AND amount > ?`;

    const rows = db().query(sql, ["balances.Transfer"], height, amount);
    return rows;
  }
}
