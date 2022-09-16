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
     * getArnBalance
     *
     * For the context, get the balance for a specific collateral
     * provider and asset. For a provider-agnostic balance,
     * the provider can be zero.
     *
     * @param c        the context
     * @param provider what provider balance you want, or 0 for all
     * @param arn      the arn you want the balance for
     * @return the balance
     */
    function getArnBalance(CollateralProviderContext storage c, address provider, bytes32 arn) internal view returns (uint256) {
        if (address(0) == provider) {
            return c.contextArnBalances[arn];
        }
        
        return c.contextProviderArnBalances[provider][arn];
    }
}
