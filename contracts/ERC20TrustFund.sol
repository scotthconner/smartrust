// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

///////////////////////////////////////////////////////////
// IMPORTS
//
// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other issues.
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Initializable interface is required because constructors don't work the same
// way for upgradeable contracts.
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// We are using the UUPSUpgradeable Proxy pattern instead of the transparent proxy
// pattern because its more gas efficient and comes with some better trade-offs.
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// We want to use the ERC20 interface so each trust can hold any arbitrary 
// ERC20. This enables the trusts to hold all sorts of assets, not just ethereum.
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// We have our own library that controls Trust Key Definitions and logic.
// We are going to be using this in all of our contracts.
import "./TrustKeyDefinitions.sol";

// We have a full contract dependency on the trust key manager, which
// must be deployed first.
import "./TrustKey.sol";
///////////////////////////////////////////////////////////

/**
 * ERC20TrustFund 
 *
 * This contract has a single responsiblity: managing the ERC20 funds for trusts. 
 * 
 * It takes an explicit dependency on the TrustKey contract, and uses the 
 * ERC1155 keys minted from that contract for access control.
 *
 */
contract ERC20TrustFund is Initializable, OwnableUpgradeable, UUPSUpgradeable {
   ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    //////////////////////////////////////////////////////// 
    /**
     * erc20DepositOccurred
     *
     * This event fires when an ERC20 deposit is successful on a trust. Most
     * likely this done by an owner or a trustee.
     *
     * @param depositor the address of the depositing message sender. 
     * @param trustId the trust ID the ERC20 funds went into.
     * @param keyId the key ID that was used to make the deposit.
     * @param token the token's contract address that represents its type.
     * @param amount the amount of the ERC20 token that was deposited.
     * @param newTotalBalance the new amounting total balance of ERC20 in the trust.
     */
    event erc20DepositOccurred(
        address depositor, uint256 trustId, uint256 keyId, 
        address token, uint256 amount, uint256 newTotalBalance);
    
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // the contract of the TrustKey proxy dependency 
    TrustKey public trustKeyManager;

    // this structure holds the token balance, and a boolean
    // to help determine if it is already registered in
    // the address array. This prevents us from looping through
    // the entire list when depositing to prevent duplicates.
    struct TokenBalance {
        // the balance itself
        uint256 balance;

        // a quick determination if it's been registered
        bool registered;
    }

    // Structure that holds the contract and balance for
    // a specific trust's ERC20 balances.
    struct ERC20Vault {
        // we want to keep an array of the contract addresses
        // there are non-zero balances for. This makes it easy
        // to introspect all ERC20s in the balance mapping for
        // UIs, total balance calculations, etc.
        address[] tokenRegistry;

        // a mapping should exist for every address in *tokens*.
        // the integer is the amount of ERC20 that is currently
        // held in the vault.
        mapping(address => TokenBalance) balances;
    }

    // maps the associated trust id's to their respective ERC20 vaults 
    mapping(uint256 => ERC20Vault) internal trustTokenVaults;

    ///////////////////////////////////////////////////////
    // Constructor and Upgrade Methods
    //
    // This section is specifically for upgrades and inherited
    // override functionality.
    ///////////////////////////////////////////////////////
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // this disables all previous initializers
        _disableInitializers();
    }

    /**
     * initialize()
     *
     * Fundamentally replaces the constructor for an upgradeable contract.
     * This contract relies on the ERC1155 contract for the Trust Key manager.
     *
     * @param trustKey the address of the proxy for the trust key contract
     */
    function initialize(address trustKey) initializer public {
        __Ownable_init();
        __UUPSUpgradeable_init();

        // this implies a specific deployment order that trust key
        // must be mined first.
        trustKeyManager = TrustKey(trustKey);
    }

    /**
     * _authorizeUpgrade
     *
     * This method is required to safeguard from un-authorized upgrades, since
     * in the UUPS model the upgrade occures from this contract, and not the proxy.
     * I think it works by reverting if upgrade() is called from someone other than
     * the owner.
     *
     * @param newImplementation the new address implementation to upgrade to
     */
    function _authorizeUpgrade(address newImplementation) internal view onlyOwner override
    { newImplementation; }

    ////////////////////////////////////////////////////////
    // External Methods
    //
    // These methods should be considered as the public interface
    // of the contract. They are for interaction with by wallets,
    // web frontends, and tests.
    ////////////////////////////////////////////////////////

    /**
     * getTokenBalance
     *
     * Given a specific key, will return the token balance for the associated trust.
     *
     * @param keyId the key you are using to access the trust
     * @param tokenAddress the token contract address you want to retrieve the balance for
     * @return the specific token balance for that trust
     */
    function getTokenBalance(uint256 keyId, address tokenAddress) external view returns(uint256) {
        return trustTokenVaults[trustKeyManager.resolveTrustWithSanity(msg.sender, keyId)]
            .balances[tokenAddress].balance;
    }

     /**
     * deposit
     *
     * This method will enable owners or trustees to deposit eth into
     * the trust for their given key. This method operates as a payable
     * transaction where the message's value parameter is what is deposited.
     *
     * @param keyId the ID of the key that the depositor is using.
     * @param tokenAddress the contract address of token type for deposit
     * @param amount the ERC20 token amount to deposit to the associated trust.
     */
    function deposit(uint256 keyId, address tokenAddress, uint256 amount) external {
        // ensure that the caller owns the key, and the trust exists
        uint256 trustId = trustKeyManager.resolveTrustWithSanity(msg.sender, keyId);

        // this is where more generalized rules will go, but for now we
        // ensure that the key held isn't a beneficiary.
        // make sure the key has permission to deposit for the given trust
        require(TrustKeyDefinitions.deriveKeyType(keyId) != TrustKeyDefinitions.BENEFICIARY,
            "NO_PERM");

        // make sure the caller has a sufficient token balance.
        require(IERC20(tokenAddress).balanceOf(msg.sender) >= amount,
            "INSUFFICIENT_TOKENS");

        // transfer tokens in the target token contract, and
        // update the trust balance for that ERC20
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);
        ERC20Vault storage vault = trustTokenVaults[trustId];
        TokenBalance storage tokenBalance = vault.balances[tokenAddress]; 
        tokenBalance.balance += amount;
   
        // maps aren't iterable in solidity. how would we answer
        // "what tokens are in this trust?". We need to keep track
        // of all token addresses that have had balances in each trust,
        // without polluting duplicates in an array or iterating over
        // an entire array. only add it to the token registry if it's
        // balance is currently unregistered.
        if (!tokenBalance.registered) {
            // register the token address in the vault
            vault.tokenRegistry.push(tokenAddress); 

            // mark the token balance as registered
            tokenBalance.registered = true; 
        } 
    
        // at this point we can assume it was successful
        emit erc20DepositOccurred(
            msg.sender, trustId, keyId, 
            tokenAddress, amount, tokenBalance.balance);
    }
}
