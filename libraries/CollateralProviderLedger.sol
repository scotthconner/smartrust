//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
using EnumerableSet for EnumerableSet.AddressSet;
using EnumerableSet for EnumerableSet.Bytes32Set;

library CollateralProviderLedger {
    /**
     * CollateralProviderContext
     *
     * This context holds the balances and information for provider
     * balances for a given context, at both the context level, and
     * the arn level.
     */
    struct CollateralProviderContext {
        // the active arns in this context, across
        // all collateral providers
        EnumerableSet.Bytes32Set arnRegistry;

        // the append only collateral providers in this context
        EnumerableSet.AddressSet collateralProviderRegistry;

        // the arns registered to each collateral provider in this context
        mapping(address => EnumerableSet.Bytes32Set) providerArnRegistry;
        mapping(bytes32 => EnumerableSet.AddressSet) arnProviderRegistry;

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
     * @param c        the context you want to deposit to
     * @param provider the provider of the collateral
     * @param arn      the arn you want to deposit
     * @param amount   the amount of asset you want to deposit
     * @return the context arn's resulting balance
     */
    function deposit(CollateralProviderContext storage c, address provider, bytes32 arn, uint256 amount) internal returns (uint256) {
        // register the provider and the arn
        c.collateralProviderRegistry.add(provider);
        c.arnRegistry.add(arn);
        c.providerArnRegistry[provider].add(arn);
        c.arnProviderRegistry[arn].add(provider);

        // add the amount to the context and provider totals
        c.contextArnBalances[arn] += amount;
        c.contextProviderArnBalances[provider][arn] += amount;
    
        // invariant protection: the context balance should be equal or
        // bigger than the provider's balance.
        assert(c.contextArnBalances[arn] >= c.contextProviderArnBalances[provider][arn]);

        return c.contextProviderArnBalances[provider][arn];
    }
    
    /**
     * withdrawal 
     *
     * Use this method to withdrawal funds from a collateral provider
     * out a context.
     *
     * @param c        the context you want to withdrawal from
     * @param provider the provider of the collateral
     * @param arn      the arn you want to withdrawal 
     * @param amount   the amount of asset you want to remove 
     * @return the context arn's resulting balance
     */
    function withdrawal(CollateralProviderContext storage c, address provider, bytes32 arn, uint256 amount) internal returns (uint256) {
        // make sure we are not overdrafting
        require(c.arnRegistry.contains(arn) && c.contextProviderArnBalances[provider][arn] >= amount, "OVERDRAFT");

        // remove the amount from the context and provider totals
        c.contextArnBalances[arn] -= amount;
        c.contextProviderArnBalances[provider][arn] -= amount;

        // remove the arn from the provider arn registry if the amount is zero
        if(c.contextProviderArnBalances[provider][arn] == 0) {
            c.providerArnRegistry[provider].remove(arn);
            c.arnProviderRegistry[arn].remove(provider);
        }
        // remove the arn from the registry if the amount is zero
        if(c.contextArnBalances[arn] == 0) {
            c.arnRegistry.remove(arn);
        }

        // invariant protection: the context balance should be equal or
        // bigger than the provider's balance.
        assert(c.contextArnBalances[arn] >= c.contextProviderArnBalances[provider][arn]);

        return c.contextProviderArnBalances[provider][arn];
    }

    /**
     * getArnRegistry
     *
     * For the context, get the arns for a specific collateral
     * provider and asset. For a provider-agnostic arn registry,
     * the provider can be zero.
     *
     * @param c        the context
     * @param provider what provider balance you want, or 0 for all
     * @return the arns for that provider (or not) within this context
     */
    function getArnRegistry(CollateralProviderContext storage c, address provider) internal view returns (bytes32[] memory) {
        if (address(0) == provider) {
            return c.arnRegistry.values();
        }

        return c.providerArnRegistry[provider].values();
    }

    /**
     * getProviderRegistry
     *
     * For the context, get the providers for a specific arn.
     * For an arn-agnostic registry, the arn can be 0x0.
     *
     * @param c   the context
     * @param arn the arn, should you want one.
     * @return the registry of providers for that context/arn pair.
     */
    function getProviderRegistry(CollateralProviderContext storage c, bytes32 arn) internal view returns (address[] memory) {
        if(bytes32(0) == arn) {  
            return c.collateralProviderRegistry.values();
        }

        return c.arnProviderRegistry[arn].values();
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

    /**
     * getProvidersAndArnBalances
     *
     * Geenerates a traversal of the context's provider arn
     * registry and extracts both the provider, and their
     * balance for the required arn.
     *
     * This is merely a comvienence factor provided to frontends
     * and not necessarily a critical piece of byte-code.
     *
     * @param c   the context
     * @param arn the asset you want to inspect
     * @return an array of providers
     * @return an array of their balances for the given arn.
     */
    function getProvidersAndArnBalances(CollateralProviderContext storage c, bytes32 arn) internal view 
        returns(address[] memory, uint256[] memory) {
        
        // grab the list of providers for the given arn. we will return this.
        address[] memory providers = c.arnProviderRegistry[arn].values();

        // allocate out the respective balance slots
        uint256[] memory balances = new uint256[](providers.length); 

        // for provider, grab the balance for the given arn from the ledger
        for(uint8 p = 0; p < providers.length; p++) {
            balances[p] = c.contextProviderArnBalances[providers[p]][arn];
        }

        // that wasn't so bad was it?
        return (providers, balances);
    }
}
