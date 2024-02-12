const fs = require('node:fs');
const ethers = require('ethers');
const abi = require('./abi.json');
const factoryAbi = require('./factoryAbi.json');
const readline = require('readline');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const CONTRACT_ADDRESS = '0x80e38291e06339d10aab483c65695d004dbd5c69';
const FACTORY_LP_ADDRESS = '0x37BAc764494c8db4e54BDE72f6965beA9fa0AC2d';
const LINEA_WETH_ADDRESS = '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f';
const LINEA_USDC_ADDRESS = '0x176211869cA2b568f2A7D4EE941E073a821EE1ff';

function getRandomValue(min, max, isDelay = true) {
  return isDelay ? Math.floor(Math.random() * (max - min + 1)) + min : (Math.random() * (max - min) + min).toFixed(2);
}

const readConfig = async () => {
  const config = {
    privateKeys: [],
    minDelay: 0,
    maxDelay: 0,
    minSwap: 0,
    maxSwap: 0,
    mode: null,
  };

  const getConfig = async () =>
    new Promise((resolve, reject) => {
      const inputStream = fs.createReadStream('./wallets.txt');
      const lineReader = readline.createInterface({
        input: inputStream,
        terminal: false,
      });
      lineReader
        .on('line', (line) => {
          const lineName = line.split(':')[0];
          switch (lineName) {
            case 'wallets-private-keys':
              config.privateKeys = line
                .split(':')[1]
                .split(',')
                .map((pk) => pk.trim());
              config.privateKeys.forEach((pk) => {
                try {
                  const w = new ethers.Wallet(pk);
                } catch (e) {
                  throw new Error(
                    `Invalid private key: ${pk} is not a valid private key. Please check the file and try again.`
                  );
                }
              });
              break;
            case 'delay-in-ms-min':
              config.minDelay = parseInt(line.split(':')[1].trim());
              break;
            case 'delay-in-ms-max':
              config.maxDelay = parseInt(line.split(':')[1].trim());
              break;
            case 'min-usd-swap':
              config.minSwap = parseFloat(line.split(':')[1].trim());
              break;
            case 'max-usd-swap':
              config.maxSwap = parseFloat(line.split(':')[1].trim());
              break;
            case 'wallet-choose-mode':
              config.mode = line.split(':')[1].trim();
              break;
            default:
              break;
          }
        }).on('close', () => {
          resolve(config);
        });
    });

  try {
    await getConfig();
  } catch (error) {
    console.error(error);
  }

  return config;
};

const handleConfigErrors = (config) => {
  if (
    config.privateKeys.length === 0 ||
    config.privateKeys.some((pk) => pk === '')
  ) {
    throw new Error('No private keys found');
  }
  if (!config.minDelay || Number.isNaN(config.minDelay)) {
    throw new Error('No minDelay found');
  }
  if (!config.maxDelay || Number.isNaN(config.maxDelay)) {
    throw new Error('No maxDelay found');
  }
  if (config.minDelay > config.maxDelay) {
    throw new Error('minDelay is greater than maxDelay');
  }
  if (!config.minSwap || Number.isNaN(config.minSwap)) {
    throw new Error('No minSwap found');
  }
  if (!config.maxSwap || Number.isNaN(config.maxSwap)) {
    throw new Error('No maxSwap found');
  }
  if (config.minSwap > config.maxSwap) {
    throw new Error('minSwap is greater than maxSwap');
  }
  if (!config.mode || config.mode === '') {
    throw new Error('No mode found');
  }
  if (config.mode !== 'random' && config.mode !== 'sequential') {
    throw new Error(
      'Invalid mode. The mode must be random or sequential'
    );
  }
};

const writeLogs = (walletAddress, isSuccess, hash, error, delay, pair, amount) => {
  const content = `Wallet address: ${walletAddress}\nResult: ${isSuccess ? 'succeeded' : 'failed'}\nError: ${error ?? ''}\nHash: ${hash ?? ''}\nDelay: ${delay}ms\nPair: ${pair}\nAmount: ${amount}USDC\n\n`;
  fs.appendFile('./logs.txt', content, err => {
    if (err) {
      console.error(err);
    } else {
      console.log('File written successfully');
    }
  });
};

const getEthAmountFromUSD = async (usdAmount) => {
  const res = await fetch('https://api.binance.com/api/v3/avgPrice?symbol=ETHUSDC');
  const { price } = await res.json();
  const ethAmount = +usdAmount / +price;

  return ethers.utils.parseEther(ethAmount.toFixed(10));
}

//   Linea Mainnet
const provider = new ethers.providers.JsonRpcProvider(
  'https://linea-mainnet.infura.io/v3/98454adfb6134a57a17e60e6fff0b70f'
);

const classicPoolFactory = new ethers.Contract(
  FACTORY_LP_ADDRESS,
  factoryAbi,
  provider
);


const handleSwap = async (wallet, amount, paths) => {
  const result = {
    isSuccess: false,
    hash: null,
    error: null,
  };

  try {
    const router = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);
    const response = await router.swap(
      paths, // paths
      0, // amountOutMin // Note: ensures slippage here
      ethers.BigNumber.from(Math.floor(Date.now() / 1000)).add(1800), // deadline // 30 minutes
      {
          value: amount,
      }
    );

    await response.wait();

    console.log('response:', response);
    
    result.hash = hash;
    result.isSuccess = true;
  } catch (error) {
    console.error(error);
    result.error = error.reason;
  }

  return result;
}


async function processWallet(wallet, delay, swapAmount, paths) {
  const bigNumberEthAmount = await getEthAmountFromUSD(swapAmount);

  const { isSuccess, hash, error } = await handleSwap(wallet, bigNumberEthAmount, paths);

  return new Promise(resolve => {
      setTimeout(() => {
          writeLogs(wallet.address, isSuccess, hash, error, delay, 'ETH/USDC', swapAmount);
          console.log(`Finished processing wallet: ${wallet}`);
          resolve();
      }, delay);
  });
}


const processKeysWithDelay = async () => {
  const config = await readConfig();
  handleConfigErrors(config);
  const privateKeys = config.mode === 'random' ? config.privateKeys.sort(() => Math.random() - 0.5) : config.privateKeys;
  const poolAddress = await classicPoolFactory.getPool(LINEA_WETH_ADDRESS, LINEA_USDC_ADDRESS);

  if (poolAddress === ZERO_ADDRESS) {
    throw Error('Pool not exists');
  }

  // The input amount of ETH
  const value = 100000000;

  // Constructs the swap paths with steps.
  // Determine withdraw mode, to withdraw native ETH or wETH on last step.
  // 0 - vault internal transfer
  // 1 - withdraw and unwrap to naitve ETH
  // 2 - withdraw and wrap to wETH
  const withdrawMode = 2; // 1 or 2 to withdraw to user's wallet

  for (let i = 0; i < privateKeys.length; i++) {
    const walletWithProvider = new ethers.Wallet(privateKeys[i], provider);
    const swapData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint8"],
      [LINEA_WETH_ADDRESS, walletWithProvider.address, withdrawMode], // tokenIn, to, withdraw mode
    );
    const steps = [{
      pool: poolAddress,
      data: swapData,
      callback: ZERO_ADDRESS, // we don't have a callback
      callbackData: '0x',
    }];
    const paths = [{
      steps: steps,
      tokenIn: ZERO_ADDRESS,
      amountIn: value,
    }];

    const delay = getRandomValue(config.minDelay, config.maxDelay);
    const swapAmount = getRandomValue(config.minSwap, config.maxSwap, false);
    
    await processWallet(walletWithProvider, delay, swapAmount, paths)
  } 
};

processKeysWithDelay()
  .then(() => {
    console.log('All wallets processed');
  })
  .catch((error) => {
    console.error(error);
  })

