import { contractSetup } from "../helpers";
import { Contract } from "ethers";
import { TransactionResponse } from "ethers";
import { address, curvance_provider } from "../types";

export interface IFaucet {
    userLastClaimed(user: address, token: address): Promise<bigint>;
    multiLastClaimed(user: address, tokens: address[]): Promise<bigint[]>;
    multiClaim(tokens: address[]): Promise<TransactionResponse>;
    claim(token: address): Promise<TransactionResponse>;
}

export class Faucet {
    provider: curvance_provider;
    address: address;
    contract: Contract & IFaucet;

    constructor(provider: curvance_provider, address: address) {
        this.provider = provider;
        this.address = address;
        this.contract = contractSetup<IFaucet>(provider, this.address, [
            "function userLastClaimed(address user, address token) view returns (uint256)",
            "function multiLastClaimed(address user, address[] tokens) view returns (uint256[])",
            "function multiClaim(address[] tokens) external",
            "function claim(address token) external",
        ]);
    }

    async lastClaimed(user: address, token: address) {
        return this.contract.userLastClaimed(user, token);
    }

    async multiLastClaimed(user: address, tokens: address[]) {
        const claims = await this.contract.multiLastClaimed(user, tokens);
        
        let claim_dates: Date[] = [];
        for(const claim of claims) {
            claim_dates.push(new Date(Number(claim) * 1000));
        }

        return claim_dates;
    }

    async multiClaim(tokens: address[]) {
        return this.contract.multiClaim(tokens);
    }

    async claim(token: address) {
        return this.contract.claim(token);
    }
}