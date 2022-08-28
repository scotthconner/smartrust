//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

///////////////////////////////////////////////////////////
// IMPORTS
//
// We need this to use the ERC1155 token standard. This is required
// to be able to mint multiple types of NFTs for interacting with
// a trust (Owner, Beneficiary, Trustee)
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

// We want to use the ERC20 interface so each trust can hold
// any arbitrary ERC20. This enables the trusts to hold all
// sorts of assets, not just ethereum.
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// This enables the author of the contract to own it, and provide
// ownership only methods to be called by the author for maintenance
// or other issues.
import "@openzeppelin/contracts/access/Ownable.sol";

// This is for debugging purposes only
import "hardhat/console.sol";
///////////////////////////////////////////////////////////

/**
 * Trust 
 *
 * This is the main contract for building, managing, and creating a smart contract
 * powered trust. The idea is that you add crypto (eth, ERC20s) to a trust, and mint
 * NFTs that allow you to manage the trust, or be a beneficiary of the trust.
 *
 * This contract can be used to manage crypto for families, generational wealth,
 * all while avoiding lawyers, expensive wills, or probate courts.
 *
 */
contract Trust is ERC1155, Ownable {
    ///////////////////////////////////////////////////////
    /// Key Types
    ///
    /// Each TrustBox can be manipulated by keys, where keys
    /// hold certain permissions for what operations can be executed
    /// on the TrustBox.
    ////////////////////////////////////////////////////////
    /// Owner keys are minted on creation of a trust box. These
    /// keys provide essentially root access to the box balance,
    /// rules, and key creation, including the creation of new
    /// owner keys.
    uint256 constant OWNER = 0;
    
    /// A trustee key is a key type that can execute box functions
    /// that have been enabled by the owner, including generating
    /// new beneficiary keys, generating payouts, or other functions.
    uint256 constant TRUSTEE = 1;
        
    /// Beneficiaries are key holders that are the only valid destinations
    /// for funds or assets coming out of the box, and can only actively
    /// withdrawal assets if certain conditions defined by the trust are met.
    uint256 constant BENEFICIARY = 2;
    uint256 constant KEY_TYPE_COUNT = 3;    


    ////////////////////////////////////////////////////////
    /// TrustBox
    ///
    /// The primary structure for the actual 'trust' itself. This includes
    /// the account balances, the rules, and any additional metadata
    /// about the keys.
    ///
    ///
    /// Keys for trusts are always assigned in the following order:
    ///   OWNER, TRUSTEE, BENEFICIARY
    /// 
    /// The IDs for these keys can be easily derived by the trustID
    ////////////////////////////////////////////////////////
    struct TrustBox {
        /// The ethereum balance for the trust.
        uint256 ethBalance;
       
        /// The mapping of ERC20s (address) to trust balance
        mapping(address => uint256) tokenBalances;

        /// A user friendly name for the trust, like "My Family Trust"
        bytes32 name;
    }

    ////////////////////////////////////////////////////////
    // Storage
    ////////////////////////////////////////////////////////
    /// This is the master mapping that holds all created trust boxes.
    /// The index specifies the "trustID," which will be held as
    /// metadata
    mapping(uint256 => TrustBox) public trustRegistry; 
    uint256 public trustCount;

    /**
     * Contract initialization.
     */
    constructor() ERC1155("") {
        // Fairly certain we don't need to use the URI for now... 
    }

    ////////////////////////////////////////////////////////
    // Events
    //
    // This is going to help indexers and web applications
    // watch and respond to blocks that contain trust transactions.
    ////////////////////////////////////////////////////////
    event trustCreated(address creator, uint256 trustId, uint256 ownerKeyId, uint256 amount);
    event keyMinted(address creator, uint256 trustId, uint256 keyId, address receiver);
    event withdrawalOccurred(address beneficiary, uint256 trustId, uint256 keyId, uint256 amount);
    event depositOccurred(address depositor, uint256 trustId, uint256 keyId, uint256 amount);
    event tokenDepositOccurred(address depositor, uint256 trustId, uint256 keyId, address token, uint256 amount);

    ////////////////////////////////////////////////////////
    // External Methods
    // 
    // These methods should be considered as the public interface
    // of the contract. They are for interaction with by wallets,
    // web frontends, and tests.
    ////////////////////////////////////////////////////////
    
    /**
     * getTrustCount
     *
     * @return the number of active trusts in the contract.
     */
    function getTrustCount() external view returns(uint256) {
        return trustCount; 
    }
   
    /**
     * getEthBalanceForTrust
     *
     * Given a specific key, will return the ethereum balance for the associated trust.
     *
     * @param keyId the key you are using to access the trust
     * @return specifically the ethereum balance for that trust
     */
    function getEthBalanceForTrust(uint256 keyId) external view returns(uint256) {
        return trustRegistry[resolveTrustWithSanity(msg.sender, keyId)].ethBalance;
    }
    
    /**
     * getTokenBalanceForTrust
     *
     * Given a specific key, will return the token balance for the associated trust.
     *
     * @param keyId the key you are using to access the trust
     * @param tokenAddress the token contract address you want to retrieve the balance for
     * @return the specific token balance for that trust
     */
    function getTokenBalanceForTrust(uint256 keyId, address tokenAddress) external view returns(uint256) {
        return trustRegistry[resolveTrustWithSanity(msg.sender, keyId)].tokenBalances[tokenAddress];
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
     * @return the remaining balance for that asset in the trust
     */
    function withdrawal(uint256 keyId, uint256 amount) external returns (uint) {
        // sanely ensure we know what trust this would be for
        uint256 trustId = resolveTrustWithSanity(msg.sender, keyId); 

        // make sure the key has permission to withdrawal for the given trust
        require(keyHasWithdrawalPermission(keyId), "Key does not have withdrawal permission on trust");

        // each trust has rules and conditions for withdrawals, so ensure they are met.
        // require(withdrawalConditionsMet(trustId, keyId, amount), "Withdrawal conditions are not met");
       
        // at this point, we've ensured we have valid ranges for keys and trusts.
        // we need to pull this trust from storage because we are modifying the balance
        TrustBox storage trust = trustRegistry[trustId];

        // ensure that there is a sufficient balance to withdrawal from
        // and that hopefully the trust isn't entitled to more than is in
        // the contract
        require(trust.ethBalance >= amount, "Insufficient balance in trust for withdrawal");
        assert(address(this).balance >= amount);

        // ok ok ok, everything seems in order. Give the message sender their assets.
        // this would not refect in storage if the TrustBox was defined in memory
        trust.ethBalance -= amount; 
        payable(msg.sender).transfer(amount);
        emit withdrawalOccurred(msg.sender, trustId, keyId, amount);

        // for clarity, return the amount
        return amount;
    }
   
    /**
     * depositEth
     *
     * This method will enable owners or trustees to deposit eth into
     * the trust for their given key. This method operates as a payable
     * transaction where the message's value parameter is what is deposited. 
     *
     * @param keyId the ID of the key that the depositor is using.
     * @return the resulting amount of ethereum in the trust's balance.
     */
    function depositEth(uint256 keyId) payable external returns (uint256) {
        // ensure that the caller owns the key, and the trust exists
        uint256 trustId = resolveTrustWithSanity(msg.sender, keyId); 
        
        // make sure the key has permission to deposit for the given trust
        require(keyHasDepositPermission(keyId), 
            "Key does not have deposit permission on trust");
   
        // make sure we are grabbing the trust via storage
        // and add the message's value to the balance
        TrustBox storage trust = trustRegistry[trustId];
        trust.ethBalance += msg.value;
        emit depositOccurred(msg.sender, trustId, keyId, msg.value);
        
        // for sanity, return the total resulting balance
        return trust.ethBalance;
    }

    /**
     * depositERC20
     *
     * This method enables owners or trustees to deposit any ERC20
     * into the trust for their given key. Tthe caller has to hold 
     * the key, and have deposit permissions. The caller must have 
     * a sufficient ERC20 balance in their wallet to deposit.
     *
     * @param keyId the ID of the key that the depositor is using
     * @param tokenAddress the contract address of token type for deposit
     * @param amount the ERC20 token amount to deposit to the associated trust.
     * @return the resulting token balance for that trust
     */
    function depositERC20(uint256 keyId, address tokenAddress, uint256 amount) external returns (uint256) {
        // ensure that the caller owns the key, and the trust exists
        uint256 trustId = resolveTrustWithSanity(msg.sender, keyId); 
        
        // make sure the key has permission to deposit for the given trust
        require(keyHasDepositPermission(keyId), 
            "Key does not have deposit permission on trust");

        // make sure the caller has a sufficient token balance.
        require(IERC20(tokenAddress).balanceOf(msg.sender) >= amount, 
            "Depositor has insufficient tokens to send.");
        
        // transfer tokens in the target token contract, and 
        // update the trust balance for that ERC20
        IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount);            
        TrustBox storage trust = trustRegistry[trustId];
        trust.tokenBalances[tokenAddress] += amount;
        emit tokenDepositOccurred(msg.sender, trustId, keyId, tokenAddress, amount);

        // for sanity, return the trust's token balance;
        return trust.tokenBalances[tokenAddress];
    }

    /**
     * createTrustKeys 
     *
     * The holder of an owner key can use it to generate new keys of any time
     * for the owner key's associated trust, sending it to the destination wallets.
     *
     * This method, in batch, will mint and send 1 new ERC1155 key of the given key type
     * to each of the provided addresses, assuming the caller owns the key used.
     * 
     * @param keyId the key the sender is attempting to use to create new keys.
     * @param keyType should be 0 (OWNER), 1 (TRUSTEE), or 2 (BENEFICIARY)
     * @param addresses the addresses you want to receive an NFT key for the trust. 
     */
    function createTrustKeys(uint256 keyId, uint256 keyType, address[] calldata addresses) external {
        // ensure that the key used is in fact an owner key
        require(deriveKeyType(keyId) == OWNER, "Key used is not an owner key");

        // ensure that the caller owns the key, and the trust exists
        uint256 trustId = resolveTrustWithSanity(msg.sender, keyId); 
    
        // resolve the ERC1155 key ID to mint, panics if bad keyType 
        uint256 mintedKeyId = resolveKeyIdForTrust(trustId, keyType);

        // at this point we know the sender is using an owner key
        // that they hold for a real trust, and they're asking for
        // a sane key type to be minted. mint for each address now.
        uint walletCount = addresses.length;
        for(uint x = 0; x < walletCount; x++) {
            address receiver = addresses[x];
            mintKey(trustId, mintedKeyId, receiver);
        }
    }
    
    /**
     * createTrustAndOwnerKey 
     *
     * Calling this function will create a trust with a name, deposit ether,
     * and mint the first set of keys, give it to the caller.
     *
     * @param  trustName A string defining the name of the trust, like 'My Family Trust'
     * @return the id of the trust created in the contract
     */
    function createTrustAndOwnerKey(bytes32 trustName) payable external returns (uint) {
        // hold the trustBoxId that will eventually be used, and
        // increment the trust count
        uint trustId = trustCount++; 

        // create the trust, and put it into the registry
        TrustBox storage trust = trustRegistry[trustId];
        trust.name = trustName;
        trust.ethBalance = msg.value;

        // mint the owner key to the sender
        uint256 ownerKeyId = resolveKeyIdForTrust(trustId, OWNER);
        mintKey(trustId, ownerKeyId, msg.sender);
        emit trustCreated(msg.sender, trustId, ownerKeyId, msg.value); 

        // finally, return the trust ID to provide some level of confidence things are completed.
        return trustId;
    }
    
    ////////////////////////////////////////////////////////
    // Internal Methods
    // 
    // These methods are only used within this contract, or
    // any extensions of it, and are not designed to be called
    // by external wallet holders.
    ////////////////////////////////////////////////////////
   
    /**
     * deriveTrustId
     *
     * Given a key Id, based on the contract's logic we can
     * deterministically know what trust ID it is for.
     *
     * @param keyId The ERC1155 Key ID we want the trust for.
     * @return the trustID for the given key
     */
    function deriveTrustId(uint256 keyId) internal pure returns (uint256) {
        // because keys are ordered and earmarked automatically
        // for each trust, we can simply integer divide by the key
        // types count.
        return keyId / KEY_TYPE_COUNT;
    }
    
    /**
     * resolveKeyIdForTrust 
     *
     * Generates the unique ERC1155 id for a given trust and key type. 
     * This method also checks to make sure the target keyType is sane.
     * 
     * @param trustId the id of the trust in question
     * @param keyType the key type you want the ID for
     * @return the keyID for that given trust's key type. 
     */
    function resolveKeyIdForTrust(uint256 trustId, uint256 keyType) internal pure returns (uint256) {
        // make sure a valid key type is being passed in, or some very very
        // bad things could happen if there's a bug.
        require(keyType < KEY_TYPE_COUNT, "Key type is not recognized");

        // the keys are allocated in sequence
        return (trustId * KEY_TYPE_COUNT) + keyType;
    }

    /**
     * deriveKeyType 
     *
     * Given a key id, determines the type of key it is.
     *
     * @param keyId the key you need the type for.
     * @return either OWNER(0), TRUSTEE(1), or BENEFICIARY(2)
     */
    function deriveKeyType(uint256 keyId) internal pure returns (uint256) {
        return keyId % KEY_TYPE_COUNT;
    }
   
    /**
     * keyHasWithdrawalPermission
     *
     * Determines if the key has withdrawal permission for its associated trust.
     * For now, this likely means it is an owner or beneficiary key. By default,
     * trustees can not withdrawal funds.
     *
     * @param keyId the key ID you want to inspect the permissions for.
     * @return true if the key has withdrawal permission for its trust, false otherwise.
     */
    function keyHasWithdrawalPermission(uint256 keyId) internal pure returns (bool) {
        // for now, only trustees can't withdrawal
        return deriveKeyType(keyId) != TRUSTEE;
    }
    
    /**
     * keyHasDepositPermission
     *
     * Determines if the key has deposit permission for its associated trust.
     * For now, this likely means it is an owner or trustee key.
     *
     * @param keyId the key ID you want to inspect the permissions for.
     * @return true if the key has deposit permission for its trust, false otherwise.
     */
    function keyHasDepositPermission(uint256 keyId) internal pure returns (bool) {
        // for now, beneficiaries can't deposit
        return deriveKeyType(keyId) != BENEFICIARY;
    }

    /**
     * doesAddressHoldKey
     *
     * Determines if the address holds the specific trust box key.
     *
     * @param wallet the address of the wallet you want to inspect
     * @param keyId  the key Id (token ID) we are checking against.
     * @return true if the wallet address has a non-zero, non-negative number of that key
     */
    function doesAddressHoldKey(address wallet, uint256 keyId) internal view returns (bool) {
        return this.balanceOf(wallet,keyId) > 0;
    }
  
    /**
     * resolveTrustWithSanity 
     *
     * This is a helper method that will do plenty of checking for the cases
     * where an address (most often the sender) is trying to use a key for a
     * use case, and resolve the trust ID for the key context.
     * 
     * If this method doesn't panic, it means the address holds the key,
     * and the trust is valid.
     * 
     * @param wallet the wallet address in question
     * @param keyId the key the address is attempting to use
     * @return the associated trust ID for the given valid key
     */
    function resolveTrustWithSanity(address wallet, uint256 keyId) internal view returns (uint256) {
        // ensure we know what trust this would be for
        uint256 trustId = deriveTrustId(keyId); 
        
        // quickly panic if garbage key ids for bogus trusts enter the contract
        require(trustId < trustCount, "Trust for key does not exist");

        // ensure the sender holds the key they are using
        require(doesAddressHoldKey(wallet, keyId), "Wallet does not hold key");
   
        return trustId;
    }

    /**
     * withdrawalConditionsMet 
     *
     * Determines based on the rules of the trust if the withdrawal conditions 
     * are met. This explicitly does not test if there is a sufficient balance. 
     *
     * @param trustId the id of the trust you want to withdrwal funds from
     * @param keyId the key ID you want to use to withdrawal funds from the associated trust 
     * @return true if the key has met withdrawal conditions of the associated trust 
     */
    //function withdrawalConditionsMet(uint256 trustId, uint256 keyId, uint256 amount) internal pure returns (bool) {
    //    // conditions / rules have no yet been implemented yet
    //    return (trustId != amount) || (keyId != amount) || true; // do this to suppress compiler warnings for now
    //}

    /**
     * mintKey
     *
     * Internal helper function that mints a key and emits an event for it.
     * Always assumes that the message sender is the creator.
     *
     * @param trustId  the trust we are creating a key for
     * @param keyId    the resolved key Id we are minting
     * @param receiver the receiving address of the newly minted key
     */
    function mintKey(uint256 trustId, uint256 keyId, address receiver) internal {
        _mint(receiver, keyId, 1, ""); 
        emit keyMinted(msg.sender, trustId, keyId, receiver);
    }
}
