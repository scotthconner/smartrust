//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

library CollateralProviderLedger {
    /**
     * CollateralProviderContext
     *
     * This context holds the balances and information for provider
     * balances for a given context, at both the context level, and
     * the arn level.
     */
    struct CollateralProviderContext {
        // the active arns in this context
        bytes32[] arnRegistry;
        mapping(bytes32 => bool) registeredArns;

        // the active collateral providers in this context
        address[] collateralProviderRegistry;
        mapping(address => bool) registeredCollateralProviders;

        // the asset balances for this context, both for the
        // entire context as well as per-provider
        mapping(bytes32 => uint256) contextArnBalances;
        mapping(address => mapping(bytes32 => uint256)) contextProviderArnBalances;
    }
 
    ///////////////////////////////////////////////////////////
    // Context Interface Methods
    // 
    // These methods are to be used for the context interface
    // as part of a library implementation.
    ///////////////////////////////////////////////////////////

    /**
     * deposit
     *
     * Use this method to deposit funds from a collateral provider
     * into a context.
     *
     * @param c   the context you want to deposit to
     * @param arn the arn you want to deposit
     * @param amount the amount of asset you want to deposit
     * @return the context arn's resulting balance
     */
    function deposit(CollateralProviderContext storage c, bytes32 arn, uint256 amount) internal returns (uint256) {
        // register the provider and the arn
        if(!c.registeredCollateralProviders[msg.sender]) {
            c.collateralProviderRegistry.push(msg.sender);
            c.registeredCollateralProviders[msg.sender] = true;    
        }
        if(!c.registeredArns[arn]) {
            c.arnRegistry.push(arn);
            c.registeredArns[arn] = true;    
        }

        // add the amount to the context and provider totals
        c.contextArnBalances[arn] += amount;
        c.contextProviderArnBalances[msg.sender][arn] += amount;
            
        // invariant protection: the context balance should be equal or
        // bigger than the provider's balance.
        assert(c.contextArnBalances[arn] >= c.contextProviderArnBalances[msg.sender][arn]);

        return c.contextProviderArnBalances[msg.sender][arn];
    }
    
    /**
     * withdrawal 
     *
     * Use this method to withdrawal funds from a collateral provider
     * out a context.
     *
     * @param c   the context you want to withdrawal from
     * @param arn the arn you want to withdrawal 
     * @param amount the amount of asset you want to remove 
     * @return the context arn's resulting balance
     */
    function withdrawal(CollateralProviderContext storage c, bytes32 arn, uint256 amount) internal returns (uint256) {
        // make sure we are not overdrafting
        require(c.registeredArns[arn] && c.contextProviderArnBalances[msg.sender][arn] >= amount, "OVERDRAFT");

        // remove the amount from the context and provider totals
        c.contextArnBalances[arn] -= amount;
        c.contextProviderArnBalances[msg.sender][arn] -= amount;

        // invariant protection: the context balance should be equal or
        // bigger than the provider's balance.
        assert(c.contextArnBalances[arn] >= c.contextProviderArnBalances[msg.sender][arn]);

        return c.contextProviderArnBalances[msg.sender][arn];
    }

    /**
     * hasCollateral 
     *
     * For a given Collateral Provider, determines if they have any
     * non-zero deposits across all assets in the context.
     *
     * @param c        the context in question
     * @param provider the collateral provider in question
     * @return true if the provider has any assets in the context 
     */
    function hasCollateral(CollateralProviderContext storage c, address provider) internal view returns (bool) {
        for(uint256 arn = 0; arn < c.arnRegistry.length; arn++) {
            if(c.contextProviderArnBalances[provider][c.arnRegistry[arn]] > 0) {
                return true;
            }
        }

        return false;
    }
}
