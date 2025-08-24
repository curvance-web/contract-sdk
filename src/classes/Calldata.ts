import { Contract, TransactionResponse } from "ethers";
import { address, bytes, curvance_provider } from "../types";
import { validateProviderAsSigner } from "../helpers";

export abstract class Calldata<T> {
    abstract address: address;
    abstract contract: Contract & T;
    abstract provider: curvance_provider;
    
    getCallData(functionName: string, exec_params: any[]) {
        return this.contract.interface.encodeFunctionData(functionName, exec_params) as bytes;
    }

    async executeCallData(calldata: bytes, overrides: { [key: string]: any } = {}): Promise<TransactionResponse> {
        const signer = validateProviderAsSigner(this.provider);
        return signer.sendTransaction({
            to: this.address,
            data: calldata,
            ...overrides
        });
    }
}