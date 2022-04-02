import Web3 from "web3";
import { ENV } from "./../config/config";

let Contract = require("web3-eth-contract");

const nftContractAddress = ENV.nftContractAddress;
let requiredChainId = ENV.requiredChainId;

Contract.setProvider(
  new Web3(
    Web3.givenProvider ||
      new Web3.providers.WebsocketProvider(ENV.web3ProviderAddress)
  )
);

export const getWeb3 = async () => {
  if (window.ethereum) {
    const web3 = new Web3(Web3.givenProvider);
    return web3;
  } else {
    return false;
  }
};

export const connectToWallet = async () => {
  if (window.ethereum) {
    const web3 = await getWeb3();
    // await window.ethereum.enable()
    // let accounts = await web3.eth.getAccounts()
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    let chainId = await web3.eth.getChainId();
    if (chainId !== requiredChainId) {
      console.error(
        `Please switch to ${ENV.requiredChainName} in order to use all features of Marketplace`
      );
    }
    return accounts[0];
  } else {
    console.error(
      "Please install Metamask Wallet in order to use all features of Marketplace"
    );
  }
};

export const disconnectWallet = async () => {
  try {
    const web3 = await getWeb3();
    web3.eth.currentProvider.disconnect();
  } catch (error) {
    store.dispatch(setWalletError(error));
  }
};

export const signRequest = async () => {
  if (window.ethereum) {
    const web3 = await getWeb3();
    let accounts = await web3.eth.getAccounts();
    let address = accounts[0];
    let signature = await handleSignMessage(address);
    return signature;
  } else {
    console.error(
      "Please install Metamask in order to use all features of Marketplace"
    );
  }
};

const handleSignMessage = async (address) => {
  return new Promise(async (resolve, reject) => {
    try {
      const web3 = await getWeb3();
      web3.eth.personal.sign(
        web3.utils.fromUtf8(
          `${ENV.appName} uses this cryptographic signature in place of a password, verifying that you are the owner of this address.`
        ),
        address,
        (err, signature) => {
          if (err) return reject(err);
          return resolve(signature);
        }
      );
    } catch (e) {
      console.log(e);
    }
  });
};

export const getBalance = async () => {
  try {
    if (window.ethereum) {
      const web3 = new Web3(Web3.givenProvider);
      let accounts = await web3.eth.getAccounts();
      let address = accounts[0];
      let balance = await web3.eth.getBalance(address, function (err, result) {
        if (err) {
          console.log(err);
        } else {
          return result;
        }
      });
      return web3.utils.fromWei(balance, "ether") + " ETH";
    } else {
      return false;
    }
  } catch (e) {
    return e;
  }
};

export const createNFT = async (_id, _nftData, royalties) => {
  const web3 = await getWeb3();
  if (!web3) {
    console.error("No web3 instance found");
    return false;
  }
  if (!isMetamaskConnected()) {
    return false;
  }
  try {
    let connectedAddress = await connectToWallet();
    _nftData.creator = connectedAddress;
    let tokenContract = new Contract(contractAbi, nftContractAddress);
    const txCount = await web3.eth.getTransactionCount(connectedAddress);
    console.log("txCount: ", txCount);
    let types = ["address", "string"];
    let payload = [_nftData.creator, _nftData.metaData];
    let hash = await createHash(types, payload);
    console.log("hash: ", hash);
    let signature = await handleSignMessageWithHash(hash, connectedAddress);
    console.log("signature: ", signature);
    const abiEncdedData = await tokenContract.methods
      .createNFT(_nftData, royalties, hash, signature)
      .encodeABI();
    console.log("abiEncdedData: ", abiEncdedData);
    const gasLimit = await web3.eth.estimateGas({
      from: connectedAddress,
      nonce: txCount,
      to: nftContractAddress,
      data: abiEncdedData,
    });
    console.log("gasLimit: ", gasLimit);
    const gas2 = await web3.eth.getGasPrice();
    console.log("gas2: ", gas2);
    const transactionParameters = {
      nonce: web3.utils.toHex(txCount), // ignored by MetaMask
      gasPrice: web3.utils.toHex(gas2), // customizable by user during MetaMask confirmation.
      gasLimit: web3.utils.toHex(gasLimit), // customizable by user during MetaMask confirmation.
      to: nftContractAddress, // Required except during contract publications.
      from: connectedAddress, // must match user's active address.
      data: abiEncdedData, // Optional, but used for defining smart contract creation and interaction.
    };
    console.log("transactionParameters: ", transactionParameters);
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [transactionParameters],
    });
    console.log("txHash: ", txHash);

    let txDetails = await getTransactionDetails(txHash);
    console.log("txDetails: ", txDetails);
    if (!txDetails.status) {
      let payloadData = {
        _id,
      };
      axiosSyncPost("nfts/unset", payloadData);
    }
    let blockNumber = txDetails.blockNumber;
    console.log("blockNumber: ", blockNumber);
    const tokenEvents = await tokenContract.getPastEvents("NewNFT", {
      fromBlock: blockNumber,
    });
    console.log("tokenEvents: ", tokenEvents);
    let tokenId = tokenEvents[0].returnValues[0];
    console.log("tokenId: ", tokenId);
    console.log("txHash: ", txHash);
    return { tokenId, txHash };
  } catch (e) {
    console.log("INSIDE CATCH");
    let payloadData = {
      _id,
    };
    axiosSyncPost("nfts/unset", payloadData);
    let eMessage = e.message.split("{")[0] || "";
    console.log(eMessage);
    toast.error("Sorry, unable to create an item/NFT for you");
    return false;
  }
};

export const mintNFTs = async (_nftData, amount = 0) => {
  const web3 = await getWeb3();
  if (!web3) {
    toast.error("No web3 instance found");
    return false;
  }
  try {
    let connectedAddress = await connectToWallet();
    let tokenContract = new Contract(contractAbi, nftContractAddress);
    const txCount = await web3.eth.getTransactionCount(connectedAddress);
    let types = ["address", "string"];
    let payload = [_nftData.creator, _nftData.metaData];
    let hash = await createHash(types, payload);
    let signature = await handleSignMessageWithHash(hash, connectedAddress);
    const abiEncdedData = await tokenContract.methods
      .mintNFTs(_nftData, hash, signature)
      .encodeABI();
    // const gasLimit = await web3.eth.estimateGas({
    //     from: connectedAddress,
    //     nonce: txCount,
    //     to: nftContractAddress,
    //     data: abiEncdedData,
    // })
    // const gas2 = await web3.eth.getGasPrice()
    const transactionParameters = {
      nonce: web3.utils.toHex(txCount), // ignored by MetaMask
      // gasPrice: web3.utils.toHex(gas2), // customizable by user during MetaMask confirmation.
      // gasLimit: web3.utils.toHex(gasLimit), // customizable by user during MetaMask confirmation.
      to: nftContractAddress, // Required except during contract publications.
      from: connectedAddress, // must match user's active address.
      data: abiEncdedData, // Optional, but used for defining smart contract creation and interaction.
    };

    if (amount) {
      let weiPrice = web3.utils.toWei(`${amount}`, "ether");
      transactionParameters.value = web3.utils.toHex(weiPrice);
    }

    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [transactionParameters],
    });
    let txDetails = await getTransactionDetails(txHash);
    let blockNumber = txDetails.blockNumber;
    const tokenEvents = await tokenContract.getPastEvents("mintedNFTs", {
      fromBlock: blockNumber,
    });
    let tokenIds = tokenEvents[0].returnValues;
    return { tokenIds, txHash };
  } catch (e) {
    let eMessage = e.message.split("{")[0] || "";
    console.log(eMessage);
    let uMsg = "Sorry, unable to purhase an item/NFT for you";
    console.error(uMsg);

    return false;
  }
};

export const changeSellingConfig = async (
  _tokenId = 2,
  status = true,
  _newPrice = 1000000000000000
) => {
  const web3 = await getWeb3();
  if (!web3) {
    console.error("No web3 instance found");
    return false;
  }
  try {
    let connectedAddress = await connectToWallet();
    let tokenContract = new Contract(contractAbi, nftContractAddress);
    const txCount = await web3.eth.getTransactionCount(connectedAddress);
    let weiPrice = web3.utils.toWei(`${_newPrice}`, "ether");

    const abiEncdedData = await tokenContract.methods
      .changeTokenPriceAndSelling(_tokenId, status, weiPrice)
      .encodeABI();
    debugger;
    const gasLimit = await web3.eth.estimateGas({
      from: connectedAddress,
      nonce: txCount,
      to: nftContractAddress,
      data: abiEncdedData,
    });

    const gas2 = await web3.eth.getGasPrice();
    const transactionParameters = {
      nonce: web3.utils.toHex(txCount), // ignored by MetaMask
      gasPrice: web3.utils.toHex(gas2), // customizable by user during MetaMask confirmation.
      gasLimit: web3.utils.toHex(gasLimit), // customizable by user during MetaMask confirmation.
      to: nftContractAddress, // Required except during contract publications.
      from: connectedAddress, // must match user's active address.
      data: abiEncdedData, // Optional, but used for defining smart contract creation and interaction.
    };

    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [transactionParameters],
    });
    let txDetails = await getTransactionDetails(txHash);
    return txDetails.status;
  } catch (e) {
    let eMessage = e.message.split("{")[0] || "";
    console.log(eMessage);
    console.error("Sorry, unable to create an item/NFT for you");
    return false;
  }
};

export const buyNFT = async (nftId, owner, creator, amount = 0) => {
  const web3 = await getWeb3();
  if (!web3) {
    console.error("No web3 instance found");
    return false;
  }
  try {
    let connectedAddress = await connectToWallet();
    let tokenContract = new Contract(contractAbi, nftContractAddress);
    const txCount = await web3.eth.getTransactionCount(connectedAddress);
    const weiPrice = web3.utils.toWei(`${amount}`, "ether");
    let hash = await createHash();
    let signature = await handleSignMessageWithHash(hash, connectedAddress);
    console.log(
      "nftId, owner, creator, hash, signature",
      nftId,
      owner,
      creator,
      hash,
      signature
    );
    const abiEncdedData = await tokenContract.methods
      .buyNFT(nftId, owner, creator, hash, signature)
      .encodeABI();
    // const gasLimit = await web3.eth.estimateGas({
    //     from: connectedAddress,
    //     nonce: txCount,
    //     to: nftContractAddress,
    //     data: abiEncdedData,
    // })
    // const gas2 = await web3.eth.getGasPrice()
    const transactionParameters = {
      nonce: web3.utils.toHex(txCount), // ignored by MetaMask
      // gasPrice: web3.utils.toHex(gas2), // customizable by user during MetaMask confirmation.
      // gasLimit: web3.utils.toHex(gasLimit), // customizable by user during MetaMask confirmation.
      to: nftContractAddress, // Required except during contract publications.
      from: connectedAddress, // must match user's active address.
      data: abiEncdedData, // Optional, but used for defining smart contract creation and interaction.
      value: web3.utils.toHex(weiPrice),
    };

    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [transactionParameters],
    });
    let txDetails = await getTransactionDetails(txHash);
    return txDetails.status;
  } catch (e) {
    let eMessage = e.message.split("{")[0] || "";
    console.log(eMessage);
    toast.error(eMessage);
    return false;
  }
};

export const createProject = async (_id, _projectData) => {
  const web3 = await getWeb3();
  if (!web3) {
    toast.error("No web3 instance found");
    return false;
  }
  try {
    let budget = _projectData.budget;
    let weiPrice = web3.utils.toWei(`${budget}`, "ether");
    _projectData.budget = weiPrice;
    let connectedAddress = await connectToWallet();
    let tokenContract = new Contract(contractAbi, nftContractAddress);
    const txCount = await web3.eth.getTransactionCount(connectedAddress);
    let hash = await createHash();
    let signature = await handleSignMessageWithHash(hash, connectedAddress);
    const abiEncdedData = await tokenContract.methods
      .createProject(_projectData, hash, signature)
      .encodeABI();
    // const gasLimit = await web3.eth.estimateGas({
    //     from: connectedAddress,
    //     nonce: txCount,
    //     to: nftContractAddress,
    //     data: abiEncdedData,
    // })
    // const gas2 = await web3.eth.getGasPrice()
    const transactionParameters = {
      nonce: web3.utils.toHex(txCount), // ignored by MetaMask
      // gasPrice: web3.utils.toHex(gas2), // customizable by user during MetaMask confirmation.
      // gasLimit: web3.utils.toHex(gasLimit), // customizable by user during MetaMask confirmation.
      to: nftContractAddress, // Required except during contract publications.
      from: connectedAddress, // must match user's active address.
      data: abiEncdedData, // Optional, but used for defining smart contract creation and interaction.
    };
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [transactionParameters],
    });
    let txDetails = await getTransactionDetails(txHash);
    if (!txDetails.status) {
      let payloadData = {
        _id,
      };
      axiosSyncPost("projects/unset", payloadData);
    }
    let blockNumber = txDetails.blockNumber;
    const tokenEvents = await tokenContract.getPastEvents("NewProject", {
      fromBlock: blockNumber,
    });
    let projectId = tokenEvents[0].returnValues[0];

    return { projectId, txHash };
  } catch (e) {
    let payloadData = {
      _id,
    };
    axiosSyncPost("projects/unset", payloadData);
    let eMessage = e.message.split("{")[0] || "";
    console.log(eMessage);
    toast.error(eMessage);
    return false;
  }
};

export const fundProject = async (projectId, amount) => {
  const web3 = await getWeb3();
  if (!web3) {
    toast.error("No web3 instance found");
    return false;
  }
  try {
    let connectedAddress = await connectToWallet();
    let tokenContract = new Contract(contractAbi, nftContractAddress);
    const txCount = await web3.eth.getTransactionCount(connectedAddress);
    let weiPrice = web3.utils.toWei(`${amount}`, "ether");
    let hash = await createHash();
    let signature = await handleSignMessageWithHash(hash, connectedAddress);
    const abiEncdedData = await tokenContract.methods
      .fundProject(projectId, hash, signature)
      .encodeABI();
    // const gasLimit = await web3.eth.estimateGas({
    //     from: connectedAddress,
    //     nonce: txCount,
    //     to: nftContractAddress,
    //     data: abiEncdedData,
    // })
    // const gas2 = await web3.eth.getGasPrice()
    const transactionParameters = {
      nonce: web3.utils.toHex(txCount), // ignored by MetaMask
      // gasPrice: web3.utils.toHex(gas2), // customizable by user during MetaMask confirmation.
      // gasLimit: web3.utils.toHex(gasLimit), // customizable by user during MetaMask confirmation.
      to: nftContractAddress, // Required except during contract publications.
      from: connectedAddress, // must match user's active address.
      data: abiEncdedData, // Optional, but used for defining smart contract creation and interaction.
      value: web3.utils.toHex(weiPrice),
    };
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [transactionParameters],
    });
    let txDetails = await getTransactionDetails(txHash);

    return txDetails;
  } catch (e) {
    let eMessage = e.message.split("{")[0] || "";
    console.log(eMessage);
    toast.error(eMessage);
    return false;
  }
};
export const withdrawProjectFunds = async (projectId = 2) => {
  const web3 = await getWeb3();
  if (!web3) {
    toast.error("No web3 instance found");
    return false;
  }
  try {
    let connectedAddress = await connectToWallet();
    let tokenContract = new Contract(contractAbi, nftContractAddress);
    const txCount = await web3.eth.getTransactionCount(connectedAddress);
    let hash = await createHash();
    let signature = await handleSignMessageWithHash(hash, connectedAddress);
    const abiEncdedData = await tokenContract.methods
      .withdrawProjectFunds(projectId, hash, signature)
      .encodeABI();
    const gasLimit = await web3.eth.estimateGas({
      from: connectedAddress,
      nonce: txCount,
      to: nftContractAddress,
      data: abiEncdedData,
    });
    const gas2 = await web3.eth.getGasPrice();
    const transactionParameters = {
      nonce: web3.utils.toHex(txCount), // ignored by MetaMask
      gasPrice: web3.utils.toHex(gas2), // customizable by user during MetaMask confirmation.
      gasLimit: web3.utils.toHex(gasLimit), // customizable by user during MetaMask confirmation.
      to: nftContractAddress, // Required except during contract publications.
      from: connectedAddress, // must match user's active address.
      data: abiEncdedData, // Optional, but used for defining smart contract creation and interaction.
    };

    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [transactionParameters],
    });
    let txDetails = await getTransactionDetails(txHash);
    return txDetails.status;
  } catch (e) {
    let eMessage = e.message.split("{")[0] || "";
    console.log(eMessage);
    toast.error(eMessage);
    return false;
  }
};
const getTransactionDetails = (txHash) => {
  try {
    return new Promise((resolve, reject) => {
      checkStatus();
      function checkStatus() {
        const web3 = new Web3(Web3.givenProvider);
        web3.eth.getTransactionReceipt(txHash, async function (err, result) {
          if (!result) {
            await sleep(4000);
            checkStatus();
          } else {
            resolve(result);
          }
        });
      }
    });
  } catch (e) {
    console.log("error");
  }
};
const sleep = async (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const handleSignMessageWithHash = async (hash, address) => {
  return new Promise(async (resolve, reject) => {
    try {
      const web3 = await getWeb3();
      web3.eth.personal.sign(hash, address, (err, signature) => {
        if (err) return reject(err);
        return resolve(signature);
      });
    } catch (e) {
      console.log(e);
    }
  });
};
async function createHash(types, data) {
  // var hash = '0x' + abi.soliditySHA3(
  //     types,
  //     data
  // ).toString('hex')
  // return hash
  const web3 = await getWeb3();
  const hash = await web3.utils.soliditySha3(
    { t: "string", v: "Hello!111%" },
    { t: "int8", v: -23 },
    { t: "address", v: "0x85F43D8a49eeB85d32Cf465507DD71d507100C1d" }
  );
  return hash;
}
const accountsChangedHandler = async () => {
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", function (accounts) {
      localStorage.clear();
      store.dispatch(beforeUser());
      store.dispatch(redirectToWallet());
      // location.href = "/"
    });
    window.ethereum.on("chainChanged", function (_chainId) {
      let chaindId = parseInt(_chainId, 16);
      if (requiredChainId === chaindId) {
        store.dispatch(setWalletError());
      } else {
        store.dispatch(
          setWalletError(
            `Please switch to ${ENV.requiredChainName} in order to use all features of Marketplace`
          )
        );
      }
    });
  }
};

accountsChangedHandler();

export const isMetamaskConnected = async () => {
  if (window.ethereum) {
    const web3 = await getWeb3();
    await window.ethereum.enable();
    const accounts = await web3.eth.getAccounts();
    const flag = accounts?.length ? true : false;
    if (!flag) toast.error("Please connect your Metamask account first");

    return flag;
  } else {
    store.dispatch(
      setWalletError(
        "Please install Metamask Wallet in order to use all features of Marketplace"
      )
    );
    return false;
  }
};
