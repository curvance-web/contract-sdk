import Decimal from "decimal.js";
import { JsonRpcProvider, JsonRpcSigner, Wallet } from "ethers";

export type address = `0x${string}`;
export type bytes = `0x${string}`; 
export type percentage = Decimal;
export type USD = Decimal;
export type USD_WAD = bigint;
export type TokenInput = Decimal;
export type typeBPS = Decimal;
export type curvance_provider = JsonRpcSigner | Wallet | JsonRpcProvider;
export type curvance_signer = JsonRpcSigner | Wallet;