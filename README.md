# Syncswap swap

## How to run project

- clone the repository
- run `npm install`
- create file `wallets.txt` in the root folder
- fill `wallets.txt` with appropriate values
- run `npm run start`

### wallets.txt example

```
Private keys divided with comma
wallets-private-keys: 123456789, 123456789, 123456789

Delay in miliseconds (1 seconds equals 1000 miliseconds)
delay-in-ms-min: 5000
delay-in-ms-max: 10000

Amount in USDC
min-usd-swap: 0.1
max-usd-swap: 0.2

Random (random) or one-by-one (sequential) mode
wallet-choose-mode: random
```
