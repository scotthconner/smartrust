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

// We have our own library that controls Trust Key Definitions and logic.
// We are going to be using this in all of our contracts.
import "./TrustKeyDefinitions.sol";

// We have a full contract dependency on the trust key manager, which
// must be deployed first.
import "./TrustKey.sol";
///////////////////////////////////////////////////////////

/**
 * EtherTrustFund 
 *
 * This contract has a single responsiblity: managing the eth funds for trusts. 
 * 
 * It takes an explicit dependency on the TrustKey contract, and uses the 
 * ERC1155 keys minted from that contract for access control.
 *
 */
contract EtherTrustFund is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    ///////////////////////////////////////////////////////
    // Storage
    ///////////////////////////////////////////////////////
    // the contract of the TrustKey proxy dependency 
    TrustKey public trustKeyManager;

    // maps the associated trust id's to their ethereum balances
    // within the contract
    mapping(uint256 => uint256) public trustBalances;

    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////
    /**
     * ethDepositOccurred
     *
     * This event fires when an ethereum deposit successfully occurs on a trust.
     * Generally this means it was acted upon by an owner or a trustee.
     *
     * @param depositor the address of the depositing message sender
     * @param trustId the trust the ether was depositing to
     * @param keyId the keyID they used to do the deposit
     * @param amount the amount deposited to the trust
     * @param newTotalBalance total resulting amount of ether after the deposit
     */
    event ethDepositOccurred(
        address depositor, uint256 trustId, uint256 keyId, 
        uint256 amount, uint256 newTotalBalance);

    /**
     * ethWithdrawalOccured
     *
     * This event fires when an ethereum withdrawal occurs on a trust. Generally
     * this means it was acted upon by an owner or a beneficiary.
     *
     * @param beneficiary the address of the wallet receiving the funds
     * @param trustId the trust the ether was removed from
     * @param keyId the key that was used to enable the withdrawals
     * @param amount the amount withdrawn from the trust
     * @param newTotalBalance total resulting amount of ether after the withdrawal
     */
    event ethWithdrawalOccurred(
        address beneficiary, uint256 trustId, uint256 keyId, 
        uint256 amount, uint256 newTotalBalance);

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
     * getEtherBalance 
     *
     * Given a specific key, will return the ethereum balance for the associated trust.
     *
     * @param keyId the key you are using to access the trust
     * @return specifically the ethereum balance for that trust
     */
    function getEtherBalance(uint256 keyId) external view returns(uint256) {
        return trustBalances[trustKeyManager.resolveTrustWithSanity(msg.sender, keyId)];
    }

    /**
     * deposit
     *
     * This method will enable owners or trustees to deposit eth into
     * the trust for their given key. This method operates as a payable
     * transaction where the message's value parameter is what is deposited.
     *
     * @param keyId the ID of the key that the depositor is using.
     */
    function deposit(uint256 keyId) payable external {
        // ensure that the caller owns the key, and the trust exists
        uint256 trustId = trustKeyManager.resolveTrustWithSanity(msg.sender, keyId);

        // this is where more generalized rules will go, but for now we
        // ensure that the key held isn't a beneficiary.
        // make sure the key has permission to deposit for the given trust
        require(TrustKeyDefinitions.deriveKeyType(keyId) != TrustKeyDefinitions.BENEFICIARY, 
            "NO_PERM");

        // make sure we are grabbing the trust via storage
        // and add the message's value to the balance
        trustBalances[trustId] += msg.value;
        emit ethDepositOccurred(msg.sender, trustId, keyId, msg.value, trustBalances[trustId]);
    }

    /**
     * withdrawal
     *
     * Given a key, attempt to withdrawal funds from the trust. This will only
     * succeed if the key is held by the user, the key has the permission to
     * withdrawal, the rules of the trust are satisified (whatever those may be),
     * and there is sufficient balance. If any of those fail, the entire
     * transaction will revert and fail.
     *
     * @param keyId  the keyId that identifies both the permissioned 'actor'
     *               and implicitly the associated trust
     * @param amount the amount of ether, in gwei, to withdrawal from the balance.
     */
    function withdrawal(uint256 keyId, uint256 amount) external {
        // sanely ensure we know what trust this would be for
        uint256 trustId = trustKeyManager.resolveTrustWithSanity(msg.sender, keyId);

        // this is where more generalized rules will go, but for now we
        // ensure that the key held isn't a beneficiary.
        // make sure the key has permission to deposit for the given trust
        require(TrustKeyDefinitions.deriveKeyType(keyId) != TrustKeyDefinitions.TRUSTEE, 
            "NO_PERM");

        // ensure that there is a sufficient balance to withdrawal from
        // and that hopefully the trust isn't entitled to more than is in
        // the contract
        require(trustBalances[trustId] >= amount, "OVERDRAFT");
        assert(address(this).balance >= amount); // invariant protection

        // ok ok ok, everything seems in order. Give the message sender their assets.
        trustBalances[trustId] -= amount;
        payable(msg.sender).transfer(amount);
        emit ethWithdrawalOccurred(msg.sender, trustId, keyId, amount, trustBalances[trustId]);
    }
}
