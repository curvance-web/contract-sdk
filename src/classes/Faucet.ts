import { contractSetup } from "../helpers";
import { ERC20 } from "./ERC20";
import { Contract } from "ethers";
import { TransactionResponse } from "ethers";
import { address, curvance_signer } from "../types";

export interface IFaucet {
    userLastClaimed(user: address, token: address): Promise<bigint>;
    multiLastClaimed(user: address, tokens: address[]): Promise<bigint[]>;
    multiClaim(user: address, tokens: address[], amounts: bigint[]): Promise<TransactionResponse>;
    claim(user: address, token: address, amount: bigint): Promise<TransactionResponse>;
    multiIsAvailable(tokenAddrs: address[], amounts: bigint[]): Promise<boolean[]>;
}

export class Faucet {
    signer: curvance_signer;
    address: address;
    contract: Contract & IFaucet;

    constructor(signer: curvance_signer, address: address) {
        this.signer = signer;
        this.address = address;
        this.contract = contractSetup<IFaucet>(signer, this.address, [
            "function userLastClaimed(address user, address token) view returns (uint256)",
            "function multiLastClaimed(address user, address[] tokens) view returns (uint256[])",
            "function multiClaim(address user, address[] tokens, uint256[] amounts) external",
            "function claim(address user, address token, uint256 amount) external",
            "function multiIsAvailable(address[] tokenAddrs, uint256[] amounts) view returns (bool[])"
        ]);
    }

    async isAvailable(tokenAddr: address, amount: bigint) {
        const token = new ERC20(this.signer, tokenAddr);
        const faucetBalance = await token.balanceOf(this.address);
        return amount <= faucetBalance;
    }

    async multiIsAvailable(tokenAddrs: address[], amounts: bigint[]) {
        const data = await this.contract.multiIsAvailable(tokenAddrs, amounts);
        
        let availability: { [address: address]: boolean } = {};
        for(let i = 0; i < tokenAddrs.length; i++) {
            availability[tokenAddrs[i] as address] = data[i]!;
        }

        return availability;
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

    async multiClaim(user: address, tokens: address[], amounts: bigint[]) {
        return this.contract.multiClaim(user, tokens, amounts);
    }

    async claim(user: address, token: address, amount: bigint) {
        return this.contract.claim(user, token, amount);
    }
}