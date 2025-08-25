import { Contract, N, TransactionResponse } from "ethers";
import { address, bytes, curvance_signer } from "../types";
import { contractSetup, EMPTY_ADDRESS, EMPTY_BYTES, NATIVE_ADDRESS } from "../helpers";
import { CToken } from "./CToken";
import { Calldata } from "./Calldata";
import abi from '../abis/SimpleZapper.json';
import { Zappers } from "./Market";

export interface Swap {
    inputToken: address,
    inputAmount: bigint,
    outputToken: address,
    target: address,
    slippage: bigint,
    call: bytes
};

export type ZapperTypes = 'none' | 'native-vault' | 'vault' | 'simple';
export const zapperTypeToName = new Map<ZapperTypes, keyof Zappers>([
    ['native-vault', 'nativeVaultZapper'],
    ['vault', 'vaultZapper'],
    ['simple', 'simpleZapper']
]);

export interface IZapper {
    swapAndDeposit(
        ctoken: address,
        depositAsWrappedNative: boolean,
        swapAction: Swap,
        expectedShares: bigint,
        collateralizeFor: boolean,
        receiver: address
    ): Promise<TransactionResponse>
}

export class Zapper extends Calldata<IZapper> {
    provider: curvance_signer;
    contract: Contract & IZapper;
    address: address;
    type: ZapperTypes;

    constructor(address: address, provider: curvance_signer, type: ZapperTypes) {
        super();
        this.address = address;
        this.provider = provider;
        this.type = type;
        this.contract = contractSetup<IZapper>(provider, address, abi);
    }

    async nativeZap(ctoken: CToken, amount: bigint, collateralize: boolean) {
        const calldata = this.getNativeZapCalldata(ctoken, amount, collateralize);
        return this.executeCallData(calldata, { value: amount });
    }

    getNativeZapCalldata(ctoken: CToken, amount: bigint, collateralize: boolean) {
        const swap: Swap = {
            inputToken: NATIVE_ADDRESS,
            inputAmount: amount,
            outputToken: NATIVE_ADDRESS,
            target: EMPTY_ADDRESS,
            slippage: 0n,
            call: EMPTY_BYTES
        };
        
        return this.getCallData("swapAndDeposit", [
            ctoken.address,
            false,
            swap,
            0n,
            collateralize,
            this.provider.address as address
        ]);
    }
}