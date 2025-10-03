import { Contract, TransactionResponse } from "ethers";
import { address, bytes, curvance_signer } from "../types";
import { Calldata } from "./Calldata";
import { Swap } from "./Zapper";
import { contractSetup } from "../helpers";
import abi from '../abis/SimplePositionManager.json';

export type PositionManagerTypes = 'native-vault';
export interface LeverageAction {
    borrowableCToken: address;
    borrowAssets: bigint;
    cToken: address;
    swapAction?: Swap;
    auxData?: bytes;
}

export interface DeleverageAction {
    cToken: address;
    collateralAssets: bigint;
    borrowableCToken: address;
    repayAssets: bigint;
    swapActions?: Swap[];
    auxData?: bytes;
}

export interface IPositionManager {
    leverage(action: LeverageAction, slippage: bigint): Promise<TransactionResponse>;
    depositAndLeverage(assets: bigint, action: LeverageAction, slippage: bigint): Promise<TransactionResponse>;
    deleverage(action: DeleverageAction, account: address): Promise<TransactionResponse>;
}

export class PositionManager extends Calldata<IPositionManager> {
    provider: curvance_signer;
    contract: IPositionManager & Contract;
    address: address;
    type: PositionManagerTypes;

    constructor(address: address, provider: curvance_signer, type: PositionManagerTypes) {
        super();
        this.address = address;
        this.provider = provider;
        this.type = type;
        this.contract = contractSetup<IPositionManager>(provider, address, abi);
    }

    getDeleverageCalldata(action: DeleverageAction, account: address) {
        return this.getCallData("deleverage", [action, account]);
    }

    getLeverageCalldata(action: LeverageAction, slippage: bigint) {
        return this.getCallData("leverage", [action, slippage]);
    }

    getDepositAndLeverageCalldata(assets: bigint, action: LeverageAction, slippage: bigint) {
        return this.getCallData("depositAndLeverage", [assets, action, slippage]);
    }
}