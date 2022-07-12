import { ApiPromise } from "@polkadot/api";
import {
  IBlock,
  IChainData,
  IExtrinsic,
  ISanitizedEvent,
  IOnInitializeOrFinalize,
  IAccountBalanceInfo,
  IAccountStakingInfo,
} from "./types";
import ApiHandler from "./ApiHandler";
import { CTxDB, TTransaction } from "./CTxDB";
//import { CLogBlockNr } from "./CLogBlockNr";
import getPackageVersion from "@jsbits/get-package-version";
import { GetTime, GetNodeVersion, Divide } from "./utils";

import csv from "csvtojson";
import ObjectsToCsv = require("objects-to-csv");

export type NodeData = {
  id: string;
  Label: string;
  Balance: number;
};

export type EdgeData = {
  Source: string;
  Target: string;
  Type: string;
  Weight: number;
  Block: number;
  Finalized: number;
};
// --------------------------------------------------------------
// Main Class
export class CVisualizingSubstrate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _chainData: IChainData;
  private _chain: string;
  private _api: ApiPromise;
  private _apiHandler: ApiHandler;
  private _db: CTxDB;
  private _errors: number;
  private _plancks: bigint;
  private _addrNames: any[];

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
  constructor(chainData: IChainData, chain: string) {
    this._chainData = chainData;
    this._chain = chain;
    this._errors = 0;
  }

  // --------------------------------------------------------------
  async InitAPI(): Promise<ApiPromise> {
    this._apiHandler = new ApiHandler(this._chainData.providers); // Create API Handler
    this._api = await this._apiHandler.connect();

    if (!this._api) process.exit(1);

    // Retrieve the chain & node information information via rpc calls
    const [chain, nodeName, nodeVersion] = await Promise.all([
      this._api.rpc.system.chain(),
      this._api.rpc.system.name(),
      this._api.rpc.system.version(),
    ]);

    const ver = getPackageVersion();
    const nodeVer = GetNodeVersion();

    console.log();
    console.log(`visualizing-substrate: v${ver}`);
    console.log(`Chain:                  ${chain}`);
    console.log(`Node:                   ${nodeName} v${nodeVersion}`);
    console.log(`Node.js:                ${nodeVer.original}`);
    console.log(`Provider:               ${this._apiHandler.currentEndpoint}`);
    console.log(`API:                    ${this._api.libraryInfo}\n`);

    if (chain.toString() != this._chain) {
      console.log(
        'Wrong chain!\nGot "%s" chain, but expected "%s" chain.',
        chain.toString(),
        this._chain
      );
      console.log("Process aborted.\n");
      process.exit(1);
    }

    return this._api;
  }

  // --------------------------------------------------------------
  InitDataBase(chain: string, filename?: string): CTxDB {
    this._db = new CTxDB(chain, filename); // Create transaction database instance
    return this._db;
  }

  // --------------------------------------------------------------
  async filterTransactions(): Promise<void> {
    if (!this._api || !this._db) return;

    console.log("Loading DB...");
    const transactions = this._db.GetRows(
      this._chainData.startBlock,
      10000000000000000
    );

    this._plancks = BigInt(this._chainData.planckPerUnit);
    const csvFilePath = "./data/AddressNames.csv";
    this._addrNames = await csv().fromFile(csvFilePath);

    const addrList: string[] = []; // empty Object
    const nodes: object[] = []; // empty Object
    const edges: object[] = []; // empty Object

    for (const transaction of transactions) {
      console.log(transaction.height);

      await this.ProcessNode(nodes, addrList, transaction.senderId);
      await this.ProcessNode(nodes, addrList, transaction.recipientId);

      await this.ProcessEdge(edges, transaction);
    }

    console.log("Writing CSV...");
    const csvNodes = new ObjectsToCsv(nodes);
    await csvNodes.toDisk("./data/nodes.csv");
    const csvEdges = new ObjectsToCsv(edges);
    await csvEdges.toDisk("./data/edges.csv");
  }

  // --------------------------------------------------------------
  async fetchBalance(
    blockNr: number,
    address: string
  ): Promise<IAccountBalanceInfo> {
    const hash = await this._api.rpc.chain.getBlockHash(blockNr);
    return await this._apiHandler.fetchBalance(hash, address);
  }

  // --------------------------------------------------------------
  //
  private async ProcessNode(
    nodes: object[],
    addrList: string[],
    addr: string
  ): Promise<void> {
    if (addrList.includes(addr)) {
      return;
    }
    addrList.push(addr);
    let label = addr;

    //Looks for address id in cvs file of Known addresses
    for (const n in this._addrNames) {
      if (this._addrNames[n].id == addr) {
        label = this._addrNames[n].Label;
        console.log(label);
      }
    }

    // balance from API
    const balanceApi = await this._apiHandler.fetchCurrentBalance(addr);
    const balanceApiTotal =
      BigInt(balanceApi.reserved.toString()) +
      BigInt(balanceApi.free.toString());
    const balanceApiTotalD = Divide(balanceApiTotal, this._plancks);

    const nodeData: NodeData = {
      id: addr,
      Label: label,
      Balance: balanceApiTotalD,
    };
    nodes.push(nodeData);
  }

  // --------------------------------------------------------------
  //
  private async ProcessEdge(edges: object[], transaction: any): Promise<void> {
    const edgeData = {
      Source: transaction.senderId,
      Target: transaction.recipientId,
      Type: "directed",
      Weight: Divide(BigInt(transaction.amount), this._plancks),
      Block: transaction.height,
      Finalized: transaction.height + BigInt(6),
    };
    edges.push(edgeData);
  }
}
