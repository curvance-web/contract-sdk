import { JsonRpcSigner, Wallet } from "ethers";

export type address = `0x${string}`;
export type bytes = `0x${string}`; 
export type uint = bigint | number
export type uint240 = uint;
export type uint8 = uint;
export type uint256 = uint;
export type uint128 = uint;
export type curvance_signer = JsonRpcSigner | Wallet;