import { ApiPromise, WsProvider } from "@polkadot/api";
import { Struct } from "@polkadot/types";
import { GenericCall } from "@polkadot/types/generic";
import { Codec, Registry } from "@polkadot/types/types";
import { BlockHash } from "@polkadot/types/interfaces/chain";
import { u8aToHex } from "@polkadot/util";
import { blake2AsU8a } from "@polkadot/util-crypto";
import { Balance, Index } from "@polkadot/types/interfaces";

import {
  IAccountBalanceInfo,
  IAccountStakingInfo,
  IBlock,
  ISanitizedCall,
  ISanitizedEvent,
} from "./types";

export default class ApiHandler {
  private _endpoints: string[];
  private _currentEndpoint: string;
  private _api: ApiPromise;

  // --------------------------------------------------------------
  constructor(endpoints: string[]) {
    this._endpoints = endpoints;
    this._currentEndpoint = "";
  }

  // --------------------------------------------------------------
  get currentEndpoint(): string {
    return this._currentEndpoint;
  }

  // --------------------------------------------------------------
  async connect(): Promise<ApiPromise> {
    if (this._api?.isConnected) return this._api;

    // Find suitable API provider
    this._currentEndpoint = "";
    for (
      let i = 0, n = this._endpoints.length;
      i < n && !this._api?.isConnected;
      i++
    ) {
      try {
        this._currentEndpoint = this._endpoints[i];
        const provider = new WsProvider(this._currentEndpoint, 1000);

        console.log("Connecting ", this._currentEndpoint, " ...");

        // Create the API and check if ready
        this._api = new ApiPromise({ provider });
        await this._api.isReadyOrError;
      } catch (e) {
        if (this._api?.isConnected) await this._api?.disconnect();
      }
    }

    if (!this._api?.isConnected)
      throw "Cannot find suitable endpoint to connect";

    this._api.on("error", (e) => {
      console.error(e);
    });

    return this._api;
  }

  async fetchCurrentBalance(address: string): Promise<IAccountBalanceInfo> {
    const blockHash = await this._api.rpc.chain.getBlockHash();
    return this.fetchBalance(blockHash, address);
  }
  // --------------------------------------------------------------
  async fetchBalance(
    hash: BlockHash,
    address: string
  ): Promise<IAccountBalanceInfo> {
    const [api, header] = await Promise.all([
      this._api.at(hash),
      this._api.rpc.chain.getHeader(hash),
    ]);

    // before Kusama runtime 1050 there was no system.account method, we have to emulate it
    const hasSysAccount = api.query.system.account != undefined;

    let nonce: Index;
    let locks;
    let free: Balance;
    let reserved: Balance;
    let miscFrozen = this._api.createType("Balance", 0);
    let feeFrozen = this._api.createType("Balance", 0);

    let ok = true;

    if (hasSysAccount) {
      const [sysAccount, l] = await Promise.all([
        api.query.system.account(address),
        api.query.balances.locks(address),
      ]);

      const accountData =
        sysAccount.data != null
          ? sysAccount.data
          : await api.query.balances.account(address);

      nonce = sysAccount.nonce;
      locks = l;
      free = accountData.free;
      reserved = accountData.reserved;
      miscFrozen = accountData.miscFrozen;
      feeFrozen = accountData.feeFrozen;
      ok = accountData && locks != undefined;
    } else {
      [nonce, free, reserved, locks] = await Promise.all([
        api.query.system.accountNonce(address) as Promise<Index>,
        api.query.balances.freeBalance(address) as Promise<Balance>,
        api.query.balances.reservedBalance(address) as Promise<Balance>,
        api.query.balances.locks(address),
      ]);
      ok = locks != undefined;
    }

    const at = {
      hash,
      height: header.number.toNumber().toString(10),
    };

    if (ok) {
      return {
        at,
        nonce,
        free,
        reserved,
        miscFrozen,
        feeFrozen,
        locks,
      };
    } else {
      throw {
        at,
        error: "Account not found",
      };
    }
  }

  // Fetch staking information for a Stash account at a given block.
  // @param hash `BlockHash` to make call at
  // @param stash address of the Stash account to get the staking info of
  // returns null, if stash is not a Stash account
  async fetchStakingInfo(
    hash: BlockHash,
    stash: string
  ): Promise<IAccountStakingInfo | null> {
    const apiAt = await this._api.at(hash);

    const [header, controllerOption] = await Promise.all([
      this._api.rpc.chain.getHeader(hash),
      apiAt.query.staking.bonded(stash),
    ]);

    const at = {
      hash,
      height: header.number.unwrap().toString(10),
    };

    if (controllerOption.isNone) {
      return null;
      //throw new Error(`The address ${stash} is not a stash address.`);
    }

    const controller = controllerOption.unwrap();

    const [
      stakingLedgerOption,
      rewardDestination,
      slashingSpansOption,
    ] = await Promise.all([
      apiAt.query.staking.ledger(controller),
      apiAt.query.staking.payee(stash),
      apiAt.query.staking.slashingSpans(stash),
    ]);

    const stakingLedger = stakingLedgerOption.unwrapOr(null);

    if (stakingLedger === null) {
      // should never throw because by time we get here we know we have a bonded pair
      throw new Error(
        `Staking ledger could not be found for controller address "${controller.toString()}"`
      );
    }

    const numSlashingSpans = slashingSpansOption.isSome
      ? slashingSpansOption.unwrap().prior.length + 1
      : 0;

    return {
      at,
      controller,
      rewardDestination,
      numSlashingSpans,
      staking: stakingLedger,
    };
  }
}
