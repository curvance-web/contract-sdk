import { contractSetup } from "../helpers";
import { address } from "../types";
import { ERC20 } from "./ERC20";

export interface IERC4626 {
    asset(): Promise<address>;
}

export class ERC4626 extends ERC20 {
    private get4626Contract() {
        return contractSetup<IERC4626>(this.provider, this.address, [
            "function asset() view returns (address)",
        ]);
    }

    async fetchAsset(asErc20: boolean) {
        const vault_asset_address = await this.get4626Contract().asset();
        return asErc20 ? new ERC20(this.provider, vault_asset_address) : vault_asset_address as address;
    }
}